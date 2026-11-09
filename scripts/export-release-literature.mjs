import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "node:fs/promises";
import { exportLiteratureSeed } from "./lib/literature-seed.mjs";

if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URLを設定してください");
const connection = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  dateStrings: true,
  timezone: "Z",
});
try {
  const seed = await exportLiteratureSeed(connection);
  await fs.mkdir(new URL("../release/", import.meta.url), { recursive: true });
  await fs.writeFile(
    new URL("../release/literature.seed.json", import.meta.url),
    JSON.stringify(seed, null, 2) + "\n"
  );
  console.log(
    `配布文献: ${seed.payload.tables.outcomes.length}アウトカム・${seed.payload.tables.literature_rules.length}ルール / 履歴の読み取り・書き出しなし`
  );
  console.log(`文献チェックサム: ${seed.checksum}`);
} finally {
  await connection.end();
}
