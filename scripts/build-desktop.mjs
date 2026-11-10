import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { isBuiltin } from "node:module";
import { validateLiteratureSeed } from "./lib/literature-seed.mjs";

const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
execFileSync(
  process.execPath,
  [path.resolve("node_modules/vite/bin/vite.js"), "build"],
  {
    stdio: "inherit",
    env: { ...process.env, VITE_DEMO_MODE: "false", VITE_BASE_PATH: "/" },
  }
);
const appDir = path.resolve("dist/desktop/app");
const seedBytes = await fs.readFile("release/literature.seed.json");
const seed = JSON.parse(seedBytes);
const payload = validateLiteratureSeed(seed);
await fs.rm(appDir, { recursive: true, force: true });
await fs.mkdir(appDir, { recursive: true });
const compiled = await build({
  entryPoints: ["server/_core/server.ts"],
  outfile: path.join(appDir, "backend.mjs"),
  platform: "node",
  target: "node24",
  format: "esm",
  bundle: true,
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
  banner: {
    js: 'import {createRequire as __createRequire} from "node:module";const require=__createRequire(import.meta.url);',
  },
});
for (const output of Object.values(compiled.metafile.outputs))
  for (const imp of output.imports)
    if (imp.external && !isBuiltin(imp.path))
      throw new Error(`アプリに未同梱の依存があります: ${imp.path}`);
if (
  [...Object.keys(compiled.metafile.inputs)].some(file =>
    /node_modules\/(?:mysql2|vite)\//.test(file)
  )
)
  throw new Error("デスクトップ版に不要なDB／開発サーバーが混入しました");
for (const file of ["main.cjs", "self-test.cjs"])
  await fs.copyFile(path.join("desktop", file), path.join(appDir, file));
await fs.cp("dist/public", path.join(appDir, "public"), {
  recursive: true,
  filter: file => !file.split(path.sep).includes("__manus__"),
});
await fs.mkdir(path.join(appDir, "release"));
await fs.writeFile(
  path.join(appDir, "release/literature.seed.json"),
  seedBytes
);
await fs.mkdir(path.join(appDir, "docs"));
for (const name of [
  "RELEASE_GUIDE.md",
  "LOCAL_USER_GUIDE.md",
  "LITERATURE_AUDIT.md",
  "TIME_MATCHING.md",
])
  await fs.copyFile(path.join("docs", name), path.join(appDir, "docs", name));
await fs.writeFile(
  path.join(appDir, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      productName: "RehabPredict",
      description: "文献ベースのリハビリテーション予後支援ツール",
      author: "machamu-24",
      license: "MIT",
      main: "main.cjs",
      private: true,
      dependencies: {},
    },
    null,
    2
  )
);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
  env: {
    ...process.env,
    DEVELOPER_DIR:
      process.env.DEVELOPER_DIR || "/Library/Developer/CommandLineTools",
  },
}).trim();
const manifest = {
  app: "RehabPredict",
  version: pkg.version,
  sourceCommit,
  builtAt: new Date().toISOString(),
  electron: pkg.devDependencies.electron,
  literatureExportedAt: payload.exportedAt,
  literatureChecksum: seed.checksum,
  storage: "sqlite",
  schemaVersion: 1,
  counts: {
    outcomes: payload.tables.outcomes.length,
    literatureRules: payload.tables.literature_rules.length,
    predictions: 0,
    predictionResults: 0,
  },
  externalRuntimeRequired: false,
  externalDatabaseRequired: false,
};
await fs.writeFile(
  path.join(appDir, "release-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);
// License texts of actual bundled dependencies, plus Electron's own notices (shipped by builder).
const licenses = new Map();
for (const input of Object.keys(compiled.metafile.inputs)) {
  if (!input.includes("node_modules/")) continue;
  let dir = path.dirname(path.resolve(input));
  while (dir.includes(`${path.sep}node_modules${path.sep}`)) {
    try {
      const info = JSON.parse(
        await fs.readFile(path.join(dir, "package.json"), "utf8")
      );
      if (info.name && info.version) {
        const key = `${info.name}@${info.version}`;
        if (!licenses.has(key)) {
          const names = (await fs.readdir(dir)).filter(name =>
            /^(license|licence|notice|copying)(\.|$)/i.test(name)
          );
          const text = await Promise.all(
            names.map(name => fs.readFile(path.join(dir, name), "utf8"))
          );
          licenses.set(
            key,
            `${key} (${info.license || "see source"})\n${text.join("\n") || `Source: https://www.npmjs.com/package/${info.name}/v/${info.version}`}`
          );
        }
        break;
      }
    } catch {}
    dir = path.dirname(dir);
  }
}
await fs.writeFile(
  path.join(appDir, "THIRD_PARTY_LICENSES.txt"),
  [...licenses]
    .sort()
    .map(([, text]) => text)
    .join("\n\n----------\n\n")
);
async function audit(dir) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isSymbolicLink())
      throw new Error("同梱ファイルにシンボリックリンクがあります");
    if (item.isDirectory()) await audit(file);
    else if (
      /(^|\/)(\.env|backups|tmp|node_modules|\.git)(\/|$|\.)/.test(
        path.relative(appDir, file)
      ) ||
      /\.(sqlite\d?|db|sql|pem|p12|log)$/i.test(item.name)
    )
      throw new Error(`同梱禁止ファイル: ${file}`);
  }
}
await audit(appDir);
console.log(
  `デスクトップ版を準備しました: ${appDir} / 文献${manifest.counts.literatureRules}件・初期履歴0件 / Node.js・MySQLの個別導入不要`
);
