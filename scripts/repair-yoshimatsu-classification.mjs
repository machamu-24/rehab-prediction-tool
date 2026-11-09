import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { correctYoshimatsuClassification } from "./lib/yoshimatsu-classification.mjs";
import { validateRuleDefinition } from "../shared/ruleValidation.ts";

const apply = process.argv.includes("--apply");
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, connectTimeout: 5000 });
try {
  await connection.beginTransaction();
  const [rows] = await connection.execute("SELECT * FROM literature_rules WHERE id = ? FOR UPDATE", [30003]);
  const row = rows[0];
  if (!row || row.ruleType !== "decision_tree" || !row.sourceUrl?.includes("/rika/33/1/33_145/"))
    throw new Error("対象の文献を特定できません。変更せずに停止しました。");
  const before = typeof row.ruleDefinition === "string" ? JSON.parse(row.ruleDefinition) : row.ruleDefinition;
  const after = correctYoshimatsuClassification(before);
  // Remove the obsolete review annotation; keep explicit exclusions intact.
  if (after.evidenceReview?.status === "blocked") throw new Error("計算対象外の設定があります。変更せずに停止しました。");
  delete after.evidenceReview;
  delete after.verification;
  const error = validateRuleDefinition(after);
  if (error) throw new Error(error);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", id: row.id, outputMode: after.outputMode, groups: after.nodes.filter(node => node.isLeaf).map(node => ({ id: node.id, supports: node.isPositive })), timelinePreserved: JSON.stringify(before.timeline) === JSON.stringify(after.timeline) }));
  if (!apply || (JSON.stringify(before) === JSON.stringify(after) && Boolean(row.consensusEligible))) {
    await connection.rollback();
  } else {
    const directory = path.resolve("backups");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const backup = path.join(directory, `yoshimatsu-rule-before-${Date.now()}.json`);
    await fs.writeFile(backup, JSON.stringify({ capturedAt: new Date().toISOString(), row }, null, 2), { mode: 0o600, flag: "wx" });
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
