/**
 * 基本アウトカムのシードデータ投入スクリプト
 *
 * 文献ルールは scripts/seed_literature.mjs と
 * scripts/seed_gdrive_literature.mjs で登録する。
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);

console.log("🌱 基本アウトカムを投入中...");

await connection.execute(
  `INSERT INTO outcomes (name, description, unit, positiveLabel, negativeLabel, isDefault, sortOrder)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE
     description = VALUES(description),
     unit = VALUES(unit),
     positiveLabel = VALUES(positiveLabel),
     negativeLabel = VALUES(negativeLabel),
     isDefault = VALUES(isDefault),
     sortOrder = VALUES(sortOrder)`,
  [
    "歩行自立",
    "回復期リハビリテーション退院時または6ヶ月後の歩行自立（FAC≥4）",
    "FAC",
    "歩行自立",
    "歩行非自立",
    1,
    0,
  ]
);

const [outcomeRows] = await connection.execute("SELECT id FROM outcomes WHERE name = '歩行自立' LIMIT 1");
const outcomeId = outcomeRows[0].id;

console.log(`✅ アウトカム「歩行自立」ID: ${outcomeId}`);

await connection.end();
console.log("🎉 基本アウトカムの投入が完了しました！");
