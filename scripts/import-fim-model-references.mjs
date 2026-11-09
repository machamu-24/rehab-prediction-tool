import "dotenv/config";
import mysql from "mysql2/promise";
import { createBackup } from "./lib/local-backup.mjs";
import { fingerprint } from "./lib/literature-review.mjs";
import { createFimModelReferences, fimReferenceOutcomes } from "./lib/fim-model-references.mjs";
import { createFukudaRule } from "./lib/fukuda-2025.mjs";

const apply = process.argv.includes("--apply");
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, dateStrings: true, connectTimeout: 5000 });
const jsonFields = new Set(["ruleDefinition", "applyConditions"]);
const flags = new Set(["isActive", "consensusEligible"]);
const project = (current, expected) => Object.fromEntries(Object.keys(expected).map(key => {
  const v = current[key];
  return [key, flags.has(key) ? Boolean(v) : jsonFields.has(key) && typeof v === "string" ? JSON.parse(v) : v];
}));
try {
  if (apply) console.log("変更前バックアップ:", (await createBackup(connection)).name);
  await connection.beginTransaction();
  const outcomeIds = [];
  for (const [index, outcome] of fimReferenceOutcomes.entries()) {
    if (index === 0) {
      const [targets] = await connection.execute("SELECT id FROM outcomes WHERE name = ? FOR UPDATE", ["FIM運動項目"]);
      if (targets.length !== 1) throw new Error("Fukudaの登録先FIM運動項目を一意に確認できません。");
      outcomeIds.push(targets[0].id);
      continue;
    }
    const [rows] = await connection.execute("SELECT * FROM outcomes WHERE name = ? FOR UPDATE", [outcome.name]);
    if (rows.length > 1 || (rows.length && (rows[0].description !== outcome.description || rows[0].unit !== outcome.unit))) throw new Error("既存アウトカムが重複または別定義です。変更せず停止しました。");
    let id = rows[0]?.id;
    if (!id && apply) { const [insert] = await connection.query("INSERT INTO outcomes SET ?", [outcome]); id = insert.insertId; }
    outcomeIds.push(id ?? 0);
  }
  const expected = createFimModelReferences(outcomeIds);
  expected[0] = createFukudaRule(outcomeIds[0]);
  const [existing] = await connection.execute("SELECT * FROM literature_rules WHERE source LIKE ? OR source LIKE ? OR sourceUrl LIKE ? OR sourceUrl LIKE ? FOR UPDATE", ["%108185%", "%018058%", "%108185%", "%018058%"]);
  if (existing.some(row => !expected.some(rule => row.name === rule.name))) throw new Error("同文献に別の登録があります。上書きせず停止しました。");
  const models = [];
  for (const rule of expected) {
    const matches = existing.filter(row => row.name === rule.name);
    if (matches.length > 1 || (matches.length === 1 && fingerprint(project(matches[0], rule)) !== fingerprint(rule))) throw new Error("同モデルの既存定義が異なります。上書きせず停止しました。");
    let id = matches[0]?.id;
    if (!id && apply) {
      const values = Object.fromEntries(Object.entries(rule).map(([key, value]) => [key, jsonFields.has(key) ? JSON.stringify(value) : value]));
      const [insert] = await connection.query("INSERT INTO literature_rules SET ?", [values]); id = insert.insertId;
    }
    if (apply) {
      const [rows] = await connection.execute("SELECT * FROM literature_rules WHERE id = ?", [id]);
      if (fingerprint(project(rows[0], rule)) !== fingerprint(rule)) throw new Error("登録内容の読み戻し検証に失敗しました。");
    }
    models.push({ id: id ?? null, name: rule.name, status: matches.length ? "already_registered" : "new", active: rule.isActive, reason: rule.ruleDefinition.evidenceReview.reason });
  }
  if (apply) await connection.commit(); else await connection.rollback();
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", outcomeIds, models }));
} catch (error) { await connection.rollback(); throw error; }
finally { await connection.end(); }
