const path = require("node:path");
const asar = require("@electron/asar");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
module.exports = async context => {
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, "RehabPredict.app/Contents/Resources")
      : path.join(context.appOutDir, "resources");
  const archive = path.join(resources, "app.asar");
  const roots = new Set([
    "main.cjs",
    "self-test.cjs",
    "backend.mjs",
    "package.json",
    "release-manifest.json",
    "THIRD_PARTY_LICENSES.txt",
    "public",
    "release",
    "docs",
  ]);
  for (const entry of asar.listPackage(archive)) {
    const name = entry.replaceAll("\\", "/").replace(/^\//, "");
    if (
      !roots.has(name.split("/")[0]) ||
      /(^|\/)(\.env|node_modules|backups|tmp|\.git)(\/|$|\.)/i.test(name) ||
      /\.(sqlite\d?|db|sql|pem|p12|log)$/i.test(name)
    )
      throw new Error(`配布物に未承認のファイルがあります: ${name}`);
  }
  const manifest = JSON.parse(
    asar.extractFile(archive, "release-manifest.json")
  );
  const seed = JSON.parse(
    asar.extractFile(archive, "release/literature.seed.json")
  );
  if (
    manifest.counts.predictions !== 0 ||
    manifest.counts.predictionResults !== 0 ||
    manifest.externalDatabaseRequired !== false ||
    manifest.externalRuntimeRequired !== false
  )
    throw new Error("配布初期状態の検証に失敗しました");
  if (
    Object.keys(seed.payload.tables).sort().join() !==
    "literature_rules,outcomes"
  )
    throw new Error("同梱データに文献以外のテーブルがあります");
  if (
    seed.checksum !==
      createHash("sha256").update(JSON.stringify(seed.payload)).digest("hex") ||
    seed.checksum !== manifest.literatureChecksum
  )
    throw new Error("同梱文献のチェックサムが一致しません");
  if (
    process.env.GITHUB_SHA &&
    manifest.sourceCommit !== process.env.GITHUB_SHA
  )
    throw new Error("配布物のコード版が一致しません");
  if (fs.existsSync(path.join(resources, "app.asar.unpacked")))
    throw new Error("想定外の外部依存が同梱されています");
  console.log(
    `Packaged app audit passed: ${context.electronPlatformName}/${context.arch}; literature only; no user database, credentials or external dependencies`
  );
};
