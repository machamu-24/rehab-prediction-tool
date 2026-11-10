import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const names = fs.readdirSync("dist/installers");
const extension = process.platform === "win32" ? ".exe" : ".dmg";
const matches = names.filter(name => name.endsWith(extension));
if (matches.length !== 1)
  throw new Error("このビルドで作成したインストーラーが1つではありません");
execFileSync(
  process.execPath,
  [
    "scripts/test-desktop.mjs",
    process.platform === "win32" ? "--installer" : "--dmg",
    path.resolve("dist/installers", matches[0]),
  ],
  { stdio: "inherit", env: process.env }
);
