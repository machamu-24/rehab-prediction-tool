import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { correctIshinoClassification, ISHINO_SOURCE_URL } from "./lib/ishino-classification.mjs";
import { validateRuleDefinition } from "../shared/ruleValidation.ts";

const apply = process.argv.includes("--apply");
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, connectTimeout: 5000 });
try {
  await connection.beginTransaction();
  const [rows] = await connection.execute("SELECT * FROM literature_rules WHERE id IN (30006, 30007) ORDER BY id FOR UPDATE");
  if (rows.length !== 2) throw new Error("石野らの2文献を特定できません。変更せずに停止しました。");
  const edits = rows.map(row => {
    if (row.ruleType !== "decision_tree" || row.sourceUrl !== ISHINO_SOURCE_URL)
      throw new Error("対象の文献を特定できません。変更せずに停止しました。");
    const before = typeof row.ruleDefinition === "string" ? JSON.parse(row.ruleDefinition) : row.ruleDefinition;
    const after = correctIshinoClassification(before, row.id);
    if (after.evidenceReview?.status === "blocked") throw new Error("計算対象外の設定があります。変更せずに停止しました。");
    delete after.evidenceReview;
    delete after.verification;
    const error = validateRuleDefinition(after);
    if (error) throw new Error(error);
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", id: row.id, outputMode: after.outputMode, leaves: after.nodes.filter(node => node.isLeaf).map(node => ({ id: node.id, supports: node.isPositive })), timelinePreserved: JSON.stringify(before.timeline) === JSON.stringify(after.timeline) }));
    return { row, before, after };
  });
  const changed = edits.filter(({ row, before, after }) => JSON.stringify(before) !== JSON.stringify(after) || !Boolean(row.consensusEligible));
  if (!apply || !changed.length) {
    await connection.rollback();
  } else {
    const directory = path.resolve("backups");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const backup = path.join(directory, `ishino-rules-before-${Date.now()}.json`);
    await fs.writeFile(backup, JSON.stringify({ capturedAt: new Date().toISOString(), rows }, null, 2), { mode: 0o600, flag: "wx" });
    for (const { row, after } of changed)
      await connection.execute("UPDATE literature_rules SET ruleDefinition = ?, consensusEligible = true WHERE id = ?", [JSON.stringify(after), row.id]);
    await connection.commit();
    console.log(`修正しました。変更前バックアップ：${backup}`);
  }
} catch (error) {
  await connection.rollback();
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}
