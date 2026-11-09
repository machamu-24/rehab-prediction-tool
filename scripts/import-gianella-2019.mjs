import "dotenv/config";
import mysql from "mysql2/promise";
import { createBackup } from "./lib/local-backup.mjs";
import { fingerprint } from "./lib/literature-review.mjs";
import { createGianellaRule } from "./lib/gianella-2019.mjs";

const apply = process.argv.includes("--apply");
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, dateStrings: true, connectTimeout: 5000 });
const jsonFields = new Set(["ruleDefinition", "applyConditions"]);
const flags = new Set(["isActive", "consensusEligible"]);
const project = (current, expected) => Object.fromEntries(Object.keys(expected).map(key => {
  let value = current[key];
  if (jsonFields.has(key) && typeof value === "string") value = JSON.parse(value);
  if (key === "auc" && value !== null) value = Number(Number(value).toFixed(6));
  return [key, flags.has(key) ? Boolean(value) : value];
}));
try {
  if (apply) console.log("変更前バックアップ:", (await createBackup(connection)).name);
  await connection.beginTransaction();
  const [outcomes] = await connection.execute("SELECT * FROM outcomes WHERE name = ? FOR UPDATE", ["歩行自立"]);
  if (outcomes.length !== 1) throw new Error("登録先の歩行自立アウトカムを一意に確認できません。変更せず停止しました。");
  const rule = createGianellaRule(outcomes[0].id);
  const [existing] = await connection.execute(
    "SELECT * FROM literature_rules WHERE name = ? OR source LIKE ? OR sourceUrl LIKE ? OR sourceUrl LIKE ? FOR UPDATE",
    [rule.name, "%10.1016/j.jstrokecerebrovasdis.2019.104367%", "%104367%", "%31519458%"],
  );
  if (existing.length > 1 || (existing.length === 1 && fingerprint(project(existing[0], rule)) !== fingerprint(rule)))
    throw new Error("同文献の既存登録が異なる定義です。上書きせず停止しました。");
  let ruleId = existing[0]?.id;
  if (!ruleId && apply) {
    const values = Object.fromEntries(Object.entries(rule).map(([key, value]) => [key, jsonFields.has(key) ? JSON.stringify(value) : value]));
    const [result] = await connection.query("INSERT INTO literature_rules SET ?", [values]);
    ruleId = result.insertId;
  }
  if (apply) {
    const [rows] = await connection.execute("SELECT * FROM literature_rules WHERE id = ?", [ruleId]);
    if (fingerprint(project(rows[0], rule)) !== fingerprint(rule)) throw new Error("登録内容の読み戻し検証に失敗しました。");
    await connection.commit();
  } else await connection.rollback();
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", status: existing.length ? "already_registered" : "new", outcomeId: rule.outcomeId, outcome: outcomes[0].name, ruleId: ruleId ?? null, name: rule.name, outputMode: rule.ruleDefinition.outputMode }));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
