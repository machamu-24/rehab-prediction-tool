import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const dir = "release-assets";
const expected = [
  `RehabPredict-${pkg.version}-Windows-x64-Setup.exe`,
  `RehabPredict-${pkg.version}-macOS-arm64.dmg`,
  `RehabPredict-${pkg.version}-macOS-x64.dmg`,
];
let all = await fs.readdir(dir, { recursive: true });
for (const relative of all.filter(name => /\.(exe|dmg|json)$/.test(name))) {
  const basename = path.basename(relative);
  if (relative !== basename) {
    try {
      await fs.access(path.join(dir, basename));
      throw new Error(`Duplicate release artifact: ${basename}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.rename(path.join(dir, relative), path.join(dir, basename));
  }
}
all = await fs.readdir(dir);
for (const name of expected) {
  const stat = await fs.stat(path.join(dir, name));
  if (stat.size < 10_000_000)
    throw new Error(`Installer is missing bundled runtime: ${name}`);
}
const sums = [];
for (const name of expected)
  sums.push(
    `${createHash("sha256")
      .update(await fs.readFile(path.join(dir, name)))
      .digest("hex")}  ${name}`
  );
await fs.writeFile(path.join(dir, "SHA256SUMS.txt"), sums.join("\n") + "\n");
const reports = [];
for (const relative of all.filter(name => name.endsWith(".json"))) {
  const report = JSON.parse(
    await fs.readFile(path.join(dir, relative), "utf8")
  );
  if (
    report.ok !== true ||
    report.packaged !== true ||
    report.version !== pkg.version
  )
    throw new Error("Packaged installer report is invalid");
  reports.push(report);
}
for (const [platform, arch] of [
  ["win32", "x64"],
  ["darwin", "arm64"],
  ["darwin", "x64"],
])
  for (const phase of ["fresh", "reopen"])
    if (
      !reports.some(
        r => r.platform === platform && r.arch === arch && r.phase === phase
      )
    )
      throw new Error(
        `Missing successful installer test: ${platform}/${arch}/${phase}`
      );
const seed = JSON.parse(
  await fs.readFile("release/literature.seed.json", "utf8")
);
if (
  reports.some(
    r =>
      r.sourceCommit !== process.env.GITHUB_SHA ||
      r.literatureChecksum !== seed.checksum ||
      (r.phase === "fresh" && r.initialHistoryCount !== 0)
  )
)
  throw new Error(
    "Installer reports do not match the current code/literature or clean initial state"
  );
await fs.writeFile(
  path.join(dir, "INSTALLER_TESTS.json"),
  JSON.stringify(
    {
      version: pkg.version,
      sourceCommit: process.env.GITHUB_SHA,
      results: reports,
    },
    null,
    2
  ) + "\n"
);
console.log("All three installers and six packaged runtime reports verified");
