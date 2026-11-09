import "dotenv/config";
import mysql from "mysql2/promise";
import { createBackup } from "./lib/local-backup.mjs";
import { fingerprint } from "./lib/literature-review.mjs";
import { createKoyamaRule, koyamaOutcome } from "./lib/koyama-2005.mjs";

const apply = process.argv.includes("--apply");
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, dateStrings: true, connectTimeout: 5000 });
const jsonFields = new Set(["ruleDefinition", "applyConditions"]);
const flags = new Set(["isActive", "consensusEligible"]);
const project = (current, expected) => Object.fromEntries(Object.keys(expected).map(key => {
  let value = current[key];
  if (jsonFields.has(key) && typeof value === "string") value = JSON.parse(value);
  return [key, flags.has(key) ? Boolean(value) : value];
}));
try {
  if (apply) console.log("変更前バックアップ:", (await createBackup(connection)).name);
  await connection.beginTransaction();
  const [outcomes] = await connection.execute("SELECT * FROM outcomes WHERE name = ? FOR UPDATE", [koyamaOutcome.name]);
  if (outcomes.length > 1) throw new Error("FIM総得点アウトカムが重複しています。変更せず停止しました。");
  let outcomeId = outcomes[0]?.id;
  if (outcomeId && (outcomes[0].unit !== "点" || !outcomes[0].description?.includes("126")))
    throw new Error("既存のFIM総得点の尺度を確認できません。変更せず停止しました。");
  if (!outcomeId && apply) {
    const [insert] = await connection.query("INSERT INTO outcomes SET ?", [koyamaOutcome]);
    outcomeId = insert.insertId;
  }
  const rule = createKoyamaRule(outcomeId ?? 0);
  const [existing] = await connection.execute(
    "SELECT * FROM literature_rules WHERE name = ? OR source LIKE ? OR sourceUrl LIKE ? FOR UPDATE",
    [rule.name, "%10.1191/0269215505cr876oa%", "%16250198%"],
  );
  if (existing.length > 1 || (existing.length === 1 && fingerprint(project(existing[0], rule)) !== fingerprint(rule)))
    throw new Error("同文献の既存登録が異なる定義です。上書きせず停止しました。");
  let ruleId = existing[0]?.id;
  if (!ruleId && apply) {
    const values = Object.fromEntries(Object.entries(rule).map(([key, value]) => [key, jsonFields.has(key) ? JSON.stringify(value) : value]));
    const [insert] = await connection.query("INSERT INTO literature_rules SET ?", [values]);
    ruleId = insert.insertId;
  }
  if (apply) {
    const [rows] = await connection.execute("SELECT * FROM literature_rules WHERE id = ?", [ruleId]);
    if (fingerprint(project(rows[0], rule)) !== fingerprint(rule)) throw new Error("登録内容の読み戻し検証に失敗しました。");
    await connection.commit();
  } else await connection.rollback();
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", status: existing.length ? "already_registered" : "new", outcomeId: outcomeId ?? null, ruleId: ruleId ?? null, name: rule.name }));
} catch (error) {
  await connection.rollback(); throw error;
} finally { await connection.end(); }
