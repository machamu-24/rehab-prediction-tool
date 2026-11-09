import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { correctFimDefinition, FIM_SOURCE_URL } from "./lib/fim-correction.mjs";

const root = path.resolve(import.meta.dirname, "..");
dotenv.config({ path: path.join(root, ".env"), quiet: true });
const apply = process.argv.includes("--apply");
const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await connection.beginTransaction();
  const [rows] = await connection.execute("SELECT * FROM literature_rules WHERE id = ? FOR UPDATE", [30008]);
  const row = rows[0];
  if (!row || row.name !== "退院時FIM運動項目予測 重回帰式" || row.ruleType !== "regression") throw new Error("修正対象のFIMルールを特定できません");
  const before = typeof row.ruleDefinition === "string" ? JSON.parse(row.ruleDefinition) : row.ruleDefinition;
  const after = correctFimDefinition(before);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", id: row.id, coefficients: after.coefficients.map(c => ({ field: c.field, coefficient: c.coefficient })), outputMode: after.outputMode }));
  if (JSON.stringify(before) === JSON.stringify(after) && row.sourceUrl === FIM_SOURCE_URL && !row.consensusEligible) {
    console.log("Already repaired.");
    await connection.rollback();
  } else if (!apply) {
    await connection.rollback();
  } else {
    const backupDir = path.join(root, "backups");
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(backupDir, `fim-rule-before-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ capturedAt: new Date().toISOString(), row }, null, 2), { flag: "wx", mode: 0o600 });
    await connection.execute("UPDATE literature_rules SET ruleDefinition = ?, source = ?, sourceUrl = ?, consensusEligible = false WHERE id = ?", [JSON.stringify(after), "安部千秋ら（2026）理学療法学 53(2):111–119", FIM_SOURCE_URL, row.id]);
    await connection.commit();
    console.log(`Repaired rule ${row.id}. Backup: ${backupPath}`);
  }
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
