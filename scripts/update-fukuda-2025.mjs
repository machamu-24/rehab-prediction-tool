import "dotenv/config";
import mysql from "mysql2/promise";
import { createBackup } from "./lib/local-backup.mjs";
import { fingerprint } from "./lib/literature-review.mjs";
import { createFimModelReferences } from "./lib/fim-model-references.mjs";
import { createFukudaRule } from "./lib/fukuda-2025.mjs";

const apply = process.argv.includes("--apply");
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, dateStrings: true, connectTimeout: 5000 });
const jsonFields = new Set(["ruleDefinition", "applyConditions"]);
const flags = new Set(["isActive", "consensusEligible"]);
const project = (row, template) => Object.fromEntries(Object.keys(template).map(key => {
  const value = row[key];
  return [key, flags.has(key) ? Boolean(value) : jsonFields.has(key) && typeof value === "string" ? JSON.parse(value) : value];
}));
try {
  if (apply) console.log("変更前バックアップ:", (await createBackup(connection)).name);
  await connection.beginTransaction();
  const [rows] = await connection.execute("SELECT * FROM literature_rules WHERE source LIKE ? OR sourceUrl LIKE ? FOR UPDATE", ["%10.1016/j.jstrokecerebrovasdis.2024.108185%", "%108185%"]);
  if (rows.length !== 1) throw new Error("Fukuda文献を一意に確認できません。上書きせず停止しました。");
  const current = rows[0], currentTemplate = createFukudaRule(current.outcomeId), legacy = createFimModelReferences([current.outcomeId, 0, 0])[0];
  const [outcomes] = await connection.execute("SELECT * FROM outcomes WHERE id = ?", [current.outcomeId]);
  if (outcomes.length !== 1 || !["発症90日後の運動FIM >61点", "FIM運動項目"].includes(outcomes[0].name)) throw new Error("登録先のアウトカムが異なります。");
  const [targets] = await connection.execute("SELECT id FROM outcomes WHERE name = ?", ["FIM運動項目"]);
  if (targets.length !== 1) throw new Error("統合先のFIM運動項目を一意に確認できません。");
  const updated = createFukudaRule(targets[0].id);
  const actual = fingerprint(project(current, updated));
  if (![fingerprint(legacy), fingerprint(currentTemplate)].includes(actual)) throw new Error("既存登録が想定した定義と異なります。変更せず停止しました。");
  const alreadyUpdated = actual === fingerprint(updated);
  if (apply && !alreadyUpdated) {
    const values = Object.fromEntries(Object.entries(updated).map(([key, value]) => [key, jsonFields.has(key) ? JSON.stringify(value) : value]));
    await connection.query("UPDATE literature_rules SET ? WHERE id = ?", [values, current.id]);
  }
  if (apply) {
    const [saved] = await connection.execute("SELECT * FROM literature_rules WHERE id = ?", [current.id]);
    if (fingerprint(project(saved[0], updated)) !== fingerprint(updated)) throw new Error("更新内容の読み戻し検証に失敗しました。");
    await connection.commit();
  } else await connection.rollback();
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", status: alreadyUpdated ? "already_updated" : "update", id: current.id, name: updated.name, active: updated.isActive, albumin: "≥3.5 g/dL = 1点、<3.5 = 0点", consensusEligible: updated.consensusEligible }));
} catch (error) { await connection.rollback(); throw error; }
finally { await connection.end(); }
