import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { dataDir, envFile, releaseRoot, checkNodeVersion } from "./paths.mjs";

try {
  checkNodeVersion();
  const config = dotenv.parse(await fs.readFile(envFile, "utf8"));
  const child = spawn(
    process.execPath,
    [path.join(releaseRoot, "scripts/local-db.mjs"), ...process.argv.slice(2)],
    {
      cwd: releaseRoot,
      env: { ...process.env, ...config, REHAB_DATA_DIR: dataDir },
      stdio: "inherit",
    }
  );
  child.on("error", () => {
    console.error("DB操作を開始できませんでした");
    process.exitCode = 1;
  });
  child.on("exit", code => {
    process.exitCode = code ?? 0;
  });
} catch {
  console.error(
    "初期設定がありません。先にSetup RehabPredictを開いてください。"
  );
  process.exitCode = 1;
}
