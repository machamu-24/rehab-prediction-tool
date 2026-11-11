import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getStore, closeStore, defaultDataDirectory } from "../server/sqliteStore";
import { createSqliteBackup } from "../server/localOperations";
import { importStrokeWalkingRules } from "./lib/import-stroke-walking-2026";

const apply = process.argv.includes("--apply");
try {
  const dir = defaultDataDirectory();
  const config = path.join(dir, "active-db.json");
  const file = fs.existsSync(config) ? JSON.parse(fs.readFileSync(config, "utf8")).file : "rehab.sqlite";
  if (typeof file !== "string" || !/^rehab(?:-restored-[a-f0-9-]+)?\.sqlite$/.test(file) || !fs.existsSync(path.join(dir, file))) throw new Error("利用中のSQLiteが見つかりません。新規DBの作成・初期化はしません。");
  const store = getStore();
  // A conflicting registration must fail before even creating a backup.
  const plan = importStrokeWalkingRules(store);
  if (apply && plan.models.some(model => model.status === "new")) {
    console.log("変更前バックアップ:", (await createSqliteBackup()).name);
    console.log(JSON.stringify({ databaseFile: store.file, ...importStrokeWalkingRules(store, true) }, null, 2));
  } else console.log(JSON.stringify({ databaseFile: store.file, ...plan }, null, 2));
} finally { closeStore(); }
