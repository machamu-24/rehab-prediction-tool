import "dotenv/config";
import mysql from "mysql2/promise";
import { createBackup } from "./lib/local-backup.mjs";
import { fingerprint } from "./lib/literature-review.mjs";
import { createJeongRule, jeongOutcome } from "./lib/jeong-2014.mjs";

const apply = process.argv.includes("--apply");
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, dateStrings: true });
const jsonFields = new Set(["ruleDefinition", "applyConditions"]);
const flags = new Set(["isDefault", "isActive", "consensusEligible"]);
const project = (current, expected) => Object.fromEntries(Object.keys(expected).map(key => {
  let value = current[key];
  if (jsonFields.has(key) && typeof value === "string") value = JSON.parse(value);
  return [key, flags.has(key) ? Boolean(value) : value];
}));
try {
  if (apply) console.log("変更前バックアップ:", (await createBackup(connection)).name);
  await connection.beginTransaction();
  const [outcomes] = await connection.execute("SELECT * FROM outcomes WHERE name = ? FOR UPDATE", [jeongOutcome.name]);
  if (outcomes.length > 1) throw new Error("FIM総得点アウトカムが重複しています。変更せずに停止しました。");
  let outcomeId = outcomes[0]?.id;
  if (outcomeId && (outcomes[0].unit !== "点" || !outcomes[0].description?.includes("126")))
    throw new Error("既存のFIM総得点の尺度を確認できません。変更せずに停止しました。");
  if (!outcomeId && apply) {
    const [result] = await connection.query("INSERT INTO outcomes SET ?", [jeongOutcome]);
    outcomeId = result.insertId;
  }
  const rule = createJeongRule(outcomeId ?? 0);
  const [existing] = await connection.execute(
    "SELECT * FROM literature_rules WHERE name = ? OR source LIKE ? OR sourceUrl LIKE ? FOR UPDATE",
    [rule.name, "%10.11336/jjcrs.5.19%", "%/jjcrs/5/0/5_19%"],
  );
  if (existing.length > 1 || (existing.length === 1 && fingerprint(project(existing[0], rule)) !== fingerprint(rule)))
    throw new Error("同文献の既存登録が異なる定義です。上書きせずに停止しました。");
  let ruleId = existing[0]?.id;
  if (!ruleId && apply) {
    const values = Object.fromEntries(Object.entries(rule).map(([key, value]) => [key, jsonFields.has(key) ? JSON.stringify(value) : value]));
    const [result] = await connection.query("INSERT INTO literature_rules SET ?", [values]);
    ruleId = result.insertId;
    const [rows] = await connection.execute("SELECT * FROM literature_rules WHERE id = ?", [ruleId]);
    if (fingerprint(project(rows[0], rule)) !== fingerprint(rule)) throw new Error("登録内容の読み戻し検証に失敗しました。");
  }
  if (apply) await connection.commit(); else await connection.rollback();
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", status: existing.length ? "already_registered" : "new", outcomeId: outcomeId ?? null, ruleId: ruleId ?? null, name: rule.name, outputMode: rule.ruleDefinition.outputMode }));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
