import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  LITERATURE_COLUMNS,
  exportLiteratureSeed,
  validateLiteratureSeed,
} from "./lib/literature-seed.mjs";

let seed;
if (process.argv.includes("--mysql")) {
  await import("dotenv/config");
  const mysql = (await import("mysql2/promise")).default;
  if (!process.env.DATABASE_URL)
    throw new Error("旧MySQL版のDATABASE_URLを設定してください");
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    dateStrings: true,
    timezone: "Z",
  });
  try {
    seed = await exportLiteratureSeed(c);
  } finally {
    await c.end();
  }
} else {
  const { DatabaseSync } = await import("node:sqlite");
  const data = path.resolve(
    process.env.REHAB_DATA_DIR ||
      (process.platform === "win32"
        ? path.join(
            process.env.LOCALAPPDATA ||
              path.join(os.homedir(), "AppData/Local"),
            "RehabPredict"
          )
        : process.platform === "darwin"
          ? path.join(os.homedir(), "Library/Application Support/RehabPredict")
          : path.join(os.homedir(), ".local/share/RehabPredict"))
  );
  let filename = "rehab.sqlite";
  try {
    const info = JSON.parse(
      await fs.readFile(path.join(data, "active-db.json"), "utf8")
    );
    if (!/^rehab(?:-restored-[a-f0-9-]+)?\.sqlite$/.test(info.file))
      throw new Error("利用中DBの選択情報が不正です");
    filename = info.file;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const index = process.argv.indexOf("--sqlite");
  const file = index < 0 ? path.join(data, filename) : process.argv[index + 1];
  if (!file) throw new Error("--sqliteにはデータファイルを指定してください");
  const c = new DatabaseSync(file, { readOnly: true });
  try {
    c.exec("BEGIN");
    const tables = {};
    for (const [table, columns] of Object.entries(LITERATURE_COLUMNS))
      tables[table] = c
        .prepare(
          `SELECT ${columns.map(k => `"${k}"`).join(",")} FROM ${table} ORDER BY id`
        )
        .all()
        .map(row => {
          for (const key of ["applyConditions", "ruleDefinition"])
            if (row[key] != null) row[key] = JSON.parse(row[key]);
          return row;
        });
    c.exec("COMMIT");
    const payload = {
      format: "rehab-literature-seed",
      version: 1,
      exportedAt: new Date().toISOString(),
      tables,
    };
    seed = {
      checksum: createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
      payload,
    };
    validateLiteratureSeed(seed);
  } finally {
    c.close();
  }
}
const outputIndex = process.argv.indexOf("--output");
const output =
  outputIndex < 0
    ? fileURLToPath(new URL("../release/literature.seed.json", import.meta.url))
    : path.resolve(process.argv[outputIndex + 1]);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(seed, null, 2) + "\n");
console.log(
  `配布文献: ${seed.payload.tables.outcomes.length}アウトカム・${seed.payload.tables.literature_rules.length}ルール / 履歴の読み取り・書き出しなし`
);
console.log(`文献チェックサム: ${seed.checksum}`);
