import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createSqliteBackup, localStatus } from "../server/localOperations";
import {
  getStore,
  closeStore,
  defaultDataDirectory,
  restoreAsNewDatabase,
  validateBackup,
} from "../server/sqliteStore";
const [command, arg] = process.argv.slice(2);
try {
  if (command === "backup")
    console.log(JSON.stringify(await createSqliteBackup(), null, 2));
  else if (command === "restore") {
    if (!arg)
      throw new Error(
        "バックアップのJSONファイルを指定してください。アプリを終了してから実行してください。"
      );
    const data = JSON.parse(await fs.readFile(path.resolve(arg), "utf8"));
    validateBackup(data);
    getStore();
    const before = await createSqliteBackup();
    const result = restoreAsNewDatabase(
      data,
      process.argv.includes("--legacy-utc")
    );
    console.log(
      JSON.stringify({ ...result, previousBackup: before.name }, null, 2)
    );
  } else if (command === "status" || command === "migrate")
    console.log(JSON.stringify(await localStatus(), null, 2));
  else
    throw new Error(
      "使い方: tsx scripts/sqlite-cli.ts backup | restore <JSONファイル> [--legacy-utc] | status"
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  closeStore();
}
