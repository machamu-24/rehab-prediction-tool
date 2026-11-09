import "dotenv/config";
import fs from "node:fs";
import mysql from "mysql2/promise";
import { createBackup } from "./lib/local-backup.mjs";
import { fingerprint } from "./lib/literature-review.mjs";
import { correctLouieRule, LOUIE_RULE_IDS, LOUIE_SOURCE_URL } from "./lib/louie-2018.mjs";

const apply = process.argv.includes("--apply");
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, dateStrings: true });
const fields = ["name", "source", "sourceUrl", "ruleType", "evidenceLevel", "applyConditions", "ruleDefinition", "accuracy", "sensitivity", "specificity", "auc", "consensusEligible"];
const jsonFields = new Set(["applyConditions", "ruleDefinition"]);
const metricFields = new Set(["accuracy", "sensitivity", "specificity", "auc"]);
// MySQL FLOAT values have binary tails in prepared-statement readbacks.
const project = row => Object.fromEntries(fields.map(key => [key, key === "consensusEligible" ? Boolean(row[key]) : metricFields.has(key) && row[key] !== null ? Number(Number(row[key]).toFixed(6)) : jsonFields.has(key) && typeof row[key] === "string" ? JSON.parse(row[key]) : row[key]]));
try {
  if (apply) console.log("変更前バックアップ:", (await createBackup(connection)).name);
  await connection.beginTransaction();
  const [rows] = await connection.query("SELECT * FROM literature_rules WHERE id IN (60001,60002) ORDER BY id FOR UPDATE");
  if (rows.length !== 2) throw new Error("対象文献2件を確認できません");
  const [outcomes] = await connection.query("SELECT id, name FROM outcomes WHERE id IN (?, ?)", rows.map(row => row.outcomeId));
  const afterRows = [];
  for (const row of rows) {
    const expectedOutcome = row.id === 60001 ? "地域歩行" : "歩行自立";
    if (row.sourceUrl !== LOUIE_SOURCE_URL || outcomes.find(o => o.id === row.outcomeId)?.name !== expectedOutcome)
      throw new Error(`ID ${row.id}の出典またはアウトカムが異なります`);
    const after = correctLouieRule(row);
    const changed = fingerprint(project(row)) !== fingerprint(project(after));
    if (apply && changed) {
      await connection.execute(`UPDATE literature_rules SET ${fields.map(key => `\`${key}\`=?`).join(",")} WHERE id=?`, [...fields.map(key => jsonFields.has(key) ? JSON.stringify(after[key]) : after[key]), row.id]);
    }
    const [readback] = await connection.execute("SELECT * FROM literature_rules WHERE id=?", [row.id]);
    if (apply && fingerprint(project(readback[0])) !== fingerprint(project(after))) {
      const actual = project(readback[0]), expected = project(after);
      const differing = fields.filter(key => fingerprint(actual[key]) !== fingerprint(expected[key]));
      throw new Error(`ID ${row.id}の読み戻し検証に失敗しました: ${differing.join(", ")}`);
    }
    afterRows.push(apply ? readback[0] : after);
    console.log(JSON.stringify({ id: row.id, outcome: expectedOutcome, name: after.name, changed, mode: apply ? "apply" : "dry-run" }));
  }
  if (apply) await connection.commit(); else await connection.rollback();
  if (apply) {
    // Keep all unrelated demo records and its version intact. Changing the version
    // would reset existing browser edits and history in demoStore.readState().
    const file = new URL("./demo-data.snapshot.json", import.meta.url);
    const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
    if (LOUIE_RULE_IDS.some(id => snapshot.rules.filter(rule => rule.id === id).length !== 1)) throw new Error("デモ用データの対象IDを確認できません");
    snapshot.rules = snapshot.rules.map(rule => {
      const updated = afterRows.find(row => row.id === rule.id);
      if (!updated) return rule;
      return { ...rule, ...project(updated), isActive: Boolean(updated.isActive), updatedAt: new Date(updated.updatedAt + "Z").toISOString() };
    });
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
    console.log("対象2件のデモ用データを同期しました（DB読み戻し検証済み）");
  }
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
