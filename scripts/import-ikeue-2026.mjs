import "dotenv/config";
import mysql from "mysql2/promise";
import { createBackup } from "./lib/local-backup.mjs";
import { fingerprint } from "./lib/literature-review.mjs";
import { createIkeueRules } from "./lib/ikeue-2026.mjs";

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
  const [outcomes] = await connection.execute("SELECT * FROM outcomes WHERE name = ? FOR UPDATE", ["FIM運動項目"]);
  if (outcomes.length !== 1 || outcomes[0].unit !== "点" || !outcomes[0].description?.includes("91"))
    throw new Error("登録先のFIM運動項目（13〜91点）を一意に確認できません。変更せず停止しました。");
  const expected = createIkeueRules(outcomes[0].id);
  const [existing] = await connection.execute("SELECT * FROM literature_rules WHERE source LIKE ? OR sourceUrl LIKE ? OR name IN (?, ?) FOR UPDATE", ["%10.1298/ptr.25-E10391%", "%25-E10391%", ...expected.map(rule => rule.name)]);
  if (existing.some(row => !expected.some(rule => row.name === rule.name))) throw new Error("同文献の別定義が登録済みです。上書きせず停止しました。");
  const results = [];
  for (const rule of expected) {
    const matches = existing.filter(row => row.name === rule.name);
    if (matches.length > 1 || (matches.length === 1 && fingerprint(project(matches[0], rule)) !== fingerprint(rule)))
      throw new Error("同モデルの既存登録が異なる定義です。上書きせず停止しました。");
    let ruleId = matches[0]?.id;
    if (!ruleId && apply) {
      const values = Object.fromEntries(Object.entries(rule).map(([key, value]) => [key, jsonFields.has(key) ? JSON.stringify(value) : value]));
      const [insert] = await connection.query("INSERT INTO literature_rules SET ?", [values]);
      ruleId = insert.insertId;
    }
    if (apply) {
      const [rows] = await connection.execute("SELECT * FROM literature_rules WHERE id = ?", [ruleId]);
      if (fingerprint(project(rows[0], rule)) !== fingerprint(rule)) throw new Error("登録内容の読み戻し検証に失敗しました。");
    }
    results.push({ status: matches.length ? "already_registered" : "new", ruleId: ruleId ?? null, name: rule.name });
  }
  if (apply) await connection.commit(); else await connection.rollback();
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", outcomeId: outcomes[0].id, outcome: outcomes[0].name, models: results }));
} catch (error) {
  await connection.rollback(); throw error;
} finally { await connection.end(); }
