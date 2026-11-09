import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isBuiltin } from "node:module";
import { build } from "esbuild";
import { validateLiteratureSeed } from "./lib/literature-seed.mjs";
import { releaseZip } from "./lib/release-zip.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const seedBytes = await fs.readFile("release/literature.seed.json");
const seed = validateLiteratureSeed(JSON.parse(seedBytes));
const folder = `RehabPredict-v${pkg.version}`;
const stage = path.join(root, "dist/release", folder);
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(stage, { recursive: true });
const inputs = new Set();
const bundle = async (entry, output, external = []) => {
  const result = await build({
    entryPoints: [entry],
    outfile: path.join(stage, output),
    platform: "node",
    target: "node24",
    bundle: true,
    format: "esm",
    define: { "process.env.NODE_ENV": '"production"' },
    external,
    metafile: true,
    legalComments: "inline",
    banner: {
      js: 'import { createRequire as __releaseCreateRequire } from "node:module"; const require = __releaseCreateRequire(import.meta.url);',
    },
  });
  for (const input of Object.keys(result.metafile.inputs)) inputs.add(input);
  for (const output of Object.values(result.metafile.outputs))
    for (const item of output.imports) {
      if (item.external && !isBuiltin(item.path) && !item.path.startsWith("."))
        throw new Error(`未同梱の依存: ${item.path}`);
    }
};
await bundle("server/_core/index.ts", "dist/index.js");
for (const name of ["setup", "start", "db"])
  await bundle(`scripts/release/${name}.mjs`, `scripts/release/${name}.mjs`, [
    "../lib/local-schema.mjs",
    "../lib/literature-seed.mjs",
    "./paths.mjs",
  ]);
await bundle("scripts/local-db.mjs", "scripts/local-db.mjs", [
  "./lib/local-backup.mjs",
  "./lib/local-schema.mjs",
]);
const copy = async file => {
  await fs.mkdir(path.dirname(path.join(stage, file)), { recursive: true });
  await fs.copyFile(file, path.join(stage, file));
};
for (const file of [
  "scripts/release/paths.mjs",
  "scripts/lib/local-schema.mjs",
  "scripts/lib/local-backup.mjs",
  "scripts/lib/literature-seed.mjs",
  "drizzle/0001_heavy_omega_red.sql",
  "drizzle/0002_wealthy_red_wolf.sql",
  "release/literature.seed.json",
  "docs/RELEASE_GUIDE.md",
  "docs/LOCAL_USER_GUIDE.md",
  "docs/LITERATURE_AUDIT.md",
  "docs/TIME_MATCHING.md",
])
  await copy(file);
await fs.cp("dist/public", path.join(stage, "dist/public"), {
  recursive: true,
  filter: source => !source.split(path.sep).includes("__manus__"),
});
await fs.writeFile(
  path.join(stage, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: "module",
      private: true,
      engines: { node: ">=24" },
    },
    null,
    2
  ) + "\n"
);
await fs.copyFile("docs/RELEASE_GUIDE.md", path.join(stage, "START_HERE.md"));
for (const [name, script] of [
  ["Setup", "setup"],
  ["Start", "start"],
]) {
  const mac = `#!/bin/zsh\ncd -- "\${0:A:h}" || exit 1\nexport PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"\nnode scripts/release/${script}.mjs\nif [[ $? -ne 0 ]]; then\n  printf '\\n上のメッセージを確認し、Enterで閉じてください。\\n'\n  read\nfi\n`;
  const win = `@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n  echo Node.js 24 LTS or later is required: https://nodejs.org/\r\n  pause\r\n  exit /b 1\r\n)\r\nnode scripts\\release\\${script}.mjs\r\nif errorlevel 1 (\r\n  pause\r\n  exit /b 1\r\n)\r\n${name === "Setup" ? "pause\r\n" : ""}`;
  await fs.writeFile(path.join(stage, `${name} RehabPredict.command`), mac, {
    mode: 0o755,
  });
  await fs.writeFile(path.join(stage, `${name} RehabPredict.cmd`), win);
}
// Preserve the license texts for packages actually included in the runtime bundles.
const licenses = new Map();
for (const input of inputs) {
  if (!input.includes("node_modules/")) continue;
  let dir = path.dirname(path.resolve(input));
  while (dir !== root && dir.includes(`${path.sep}node_modules${path.sep}`)) {
    try {
      const info = JSON.parse(
        await fs.readFile(path.join(dir, "package.json"), "utf8")
      );
      if (info.name && info.version) {
        const key = `${info.name}@${info.version}`;
        if (!licenses.has(key)) {
          const files = (await fs.readdir(dir)).filter(name =>
            /^(licen[sc]e|notice|copying)(\.|$)/i.test(name)
          );
          const texts = await Promise.all(
            files.map(file => fs.readFile(path.join(dir, file), "utf8"))
          );
          licenses.set(
            key,
            `${key} (${info.license || "see package source"})\n${texts.join("\n") || `Source: https://www.npmjs.com/package/${info.name}/v/${info.version}`}`
          );
        }
        break;
      }
    } catch {
      /* Continue to package root. */
    }
    dir = path.dirname(dir);
  }
}
await fs.writeFile(
  path.join(stage, "THIRD_PARTY_LICENSES.txt"),
  [...licenses]
    .sort()
    .map(([, text]) => text)
    .join("\n\n----------------\n\n")
);
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  env: {
    ...process.env,
    DEVELOPER_DIR:
      process.env.DEVELOPER_DIR || "/Library/Developer/CommandLineTools",
  },
  encoding: "utf8",
}).trim();
const manifest = {
  app: pkg.name,
  version: pkg.version,
  sourceCommit: commit,
  builtAt: new Date().toISOString(),
  literatureExportedAt: seed.exportedAt,
  literatureChecksum: JSON.parse(seedBytes).checksum,
  counts: {
    outcomes: seed.tables.outcomes.length,
    literatureRules: seed.tables.literature_rules.length,
    predictions: 0,
    predictionResults: 0,
  },
  platforms: ["Windows", "macOS"],
  prerequisites: ["Node.js >=24", "MySQL >=8.0"],
};
await fs.writeFile(
  path.join(stage, "release-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);
const entries = [];
async function walk(dir) {
  for (const item of (await fs.readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name)
  )) {
    const file = path.join(dir, item.name);
    if (item.isSymbolicLink())
      throw new Error("配布物にシンボリックリンクは使用できません");
    if (item.isDirectory()) await walk(file);
    else {
      const rel = path.relative(stage, file).split(path.sep).join("/");
      if (
        /(^|\/)(\.env|backups?|node_modules|tmp|\.git|\.manus-logs)(\/|$|\.)/i.test(
          rel
        ) ||
        /\.(sqlite\d?|db|pem|key|p12|log)$/i.test(rel)
      )
        throw new Error(`配布禁止ファイル: ${rel}`);
      entries.push({
        name: `${folder}/${rel}`,
        bytes: await fs.readFile(file),
        mode: rel.endsWith(".command") ? 0o755 : 0o644,
      });
    }
  }
}
await walk(stage);
const zipName = `${folder}-Windows-macOS.zip`;
const zip = releaseZip(entries);
await fs.writeFile(path.join(root, "dist/release", zipName), zip);
await fs.writeFile(
  path.join(root, "dist/release/SHA256SUMS.txt"),
  `${createHash("sha256").update(zip).digest("hex")}  ${zipName}\n`
);
console.log(
  `配布物: dist/release/${zipName} (${zip.length} bytes) / 文献${manifest.counts.literatureRules}件・履歴0件`
);
