import fs from "node:fs/promises";
// Additive migrations only. Existing rows retain null snapshots; no historical reconstruction.
export const LOCAL_COLUMNS = {
  predictions: {
    caseId: "varchar(64) NULL", assessedOn: "varchar(10) NULL", assessmentPhase: "varchar(32) NULL",
    timeContext: "json NULL", engineVersion: "varchar(64) NULL", outcomeSnapshot: "json NULL",
  },
  prediction_results: { ruleSnapshot: "json NULL", resultSnapshot: "json NULL" },
};

/** Extend the enum without changing existing values or their MySQL ordinals. */
export async function addLogisticRuleType(connection) {
  const [columns] = await connection.query("SHOW COLUMNS FROM `literature_rules` LIKE 'ruleType'");
  const type = columns[0]?.Type;
  if (typeof type !== "string" || !/^enum\('[a-z_]+'(?:,'[a-z_]+')*\)$/.test(type))
    throw new Error("ruleTypeのenum定義を確認できません。変更せず停止しました。");
  if (type.includes("'logistic_regression'")) return false;
  const extended = type.slice(0, -1) + ",'logistic_regression')";
  await connection.query(`ALTER TABLE \`literature_rules\` MODIFY COLUMN \`ruleType\` ${extended} NOT NULL`);
  return true;
}

export async function migrateLocalSchema(connection) {
  const [lock] = await connection.query("SELECT GET_LOCK('rehab_local_schema_v2', 10) AS acquired");
  if (Number(lock[0].acquired) !== 1) throw new Error("別のスキーマ更新が実行中です");
  try {
    await addLogisticRuleType(connection);
    for (const [table, columns] of Object.entries(LOCAL_COLUMNS)) {
      const [existing] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
      const names = new Set(existing.map(row => row.Field));
      for (const [name, definition] of Object.entries(columns)) {
        if (!names.has(name)) await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${definition}`);
      }
    }
    for (const [table, name, columns] of [
      ["predictions", "idx_case_assessment", "caseId, assessedOn, id"],
      ["prediction_results", "idx_prediction_results_parent", "predictionId"],
    ]) {
      const [indexes] = await connection.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
      if (!indexes.length) await connection.query(`CREATE INDEX \`${name}\` ON \`${table}\` (${columns})`);
    }
  } finally { await connection.query("SELECT RELEASE_LOCK('rehab_local_schema_v2')"); }
}

// Only version-controlled application migrations supply DDL. Backup files contain rows only.
export async function createLocalTables(connection) {
  for (const file of ["../../drizzle/0001_heavy_omega_red.sql", "../../drizzle/0002_wealthy_red_wolf.sql"]) {
    const source = await fs.readFile(new URL(file, import.meta.url), "utf8");
    for (const statement of source.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await connection.query(statement);
  }
  await migrateLocalSchema(connection);
}
