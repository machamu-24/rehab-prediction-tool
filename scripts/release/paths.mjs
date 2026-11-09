import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const releaseRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
export const dataDir = path.resolve(
  process.env.REHAB_DATA_DIR ||
    (process.platform === "win32"
      ? path.join(
          process.env.LOCALAPPDATA ||
            path.join(os.homedir(), "AppData", "Local"),
          "RehabPredict"
        )
      : process.platform === "darwin"
        ? path.join(
            os.homedir(),
            "Library",
            "Application Support",
            "RehabPredict"
          )
        : path.join(os.homedir(), ".local", "share", "RehabPredict"))
);
export const envFile = path.join(dataDir, ".env");
export function checkNodeVersion() {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error(
      "Node.js 24以上が必要です。https://nodejs.org/ のLTS版をインストールしてください。"
    );
}
