import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { checkNodeVersion, dataDir, envFile, releaseRoot } from "./paths.mjs";

async function main() {
  checkNodeVersion();
  let config;
  try {
    config = dotenv.parse(await fs.readFile(envFile, "utf8"));
  } catch {
    throw new Error(
      "初期設定がありません。先にSetup RehabPredictを開いてください。"
    );
  }
  if (!config.DATABASE_URL)
    throw new Error(
      "接続設定が不正です。docs/RELEASE_GUIDE.mdを確認してください。"
    );
  const port = Number(config.PORT || 3020);
  if (!Number.isInteger(port) || port < 1024 || port > 65515)
    throw new Error("PORTは1024〜65515で設定してください");
  const open = url => {
    if (process.env.REHAB_NO_OPEN === "1") return;
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "explorer.exe"
          : "xdg-open";
    const opener = spawn(command, [url], { stdio: "ignore" });
    opener.on("error", () => console.log(`ブラウザで ${url} を開いてください`));
  };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/local/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if ((await response.json()).app === "rehab-prediction-tool") {
      console.log(`起動済みです: http://localhost:${port}/`);
      open(`http://localhost:${port}/`);
      return;
    }
  } catch {
    /* Start our own process. */
  }
  const child = spawn(
    process.execPath,
    [path.join(releaseRoot, "dist/index.js")],
    {
      cwd: releaseRoot,
      env: {
        ...process.env,
        ...config,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        REHAB_DATA_DIR: dataDir,
        PORT: String(port),
      },
      stdio: ["inherit", "pipe", "inherit"],
    }
  );
  let opened = false;
  let log = "";
  child.stdout.on("data", chunk => {
    process.stdout.write(chunk);
    log = (log + chunk.toString()).slice(-4000);
    const match = log.match(/Server running on (http:\/\/localhost:\d+\/)/);
    if (match && !opened) {
      opened = true;
      console.log("終了するにはこの画面でCtrl+Cを押してください。");
      open(match[1]);
    }
  });
  child.on("error", () => {
    console.error("アプリを起動できませんでした");
    process.exitCode = 1;
  });
  child.on("exit", code => {
    process.exitCode = code ?? 0;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => child.kill(signal));
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
