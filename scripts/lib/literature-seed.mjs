import { createHash } from "node:crypto";

// The distribution is deliberately an allowlist of literature data, never a DB backup.
export const LITERATURE_COLUMNS = {
  outcomes: [
    "id",
    "name",
    "description",
    "unit",
    "positiveLabel",
    "negativeLabel",
    "isDefault",
    "sortOrder",
    "createdAt",
    "updatedAt",
  ],
  literature_rules: [
    "id",
    "outcomeId",
    "name",
    "ruleType",
    "source",
    "sourceUrl",
    "evidenceLevel",
    "applyConditions",
    "ruleDefinition",
    "accuracy",
    "sensitivity",
    "specificity",
    "auc",
    "consensusEligible",
    "isActive",
    "sortOrder",
    "createdAt",
    "updatedAt",
  ],
};
export const seedDigest = payload =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");
const sameKeys = (obj, keys) =>
  obj &&
  typeof obj === "object" &&
  !Array.isArray(obj) &&
  Object.keys(obj).sort().join() === [...keys].sort().join();

export function validateLiteratureSeed(data) {
  const p = data?.payload;
  if (
    !sameKeys(data, ["checksum", "payload"]) ||
    !sameKeys(p, ["format", "version", "exportedAt", "tables"]) ||
    p.format !== "rehab-literature-seed" ||
    p.version !== 1 ||
    data.checksum !== seedDigest(p)
  )
    throw new Error("文献データの形式・チェックサムが不正です");
  if (!sameKeys(p.tables, Object.keys(LITERATURE_COLUMNS)))
    throw new Error("文献以外のテーブル、または不足テーブルがあります");
  for (const [table, columns] of Object.entries(LITERATURE_COLUMNS)) {
    const rows = p.tables[table];
    if (
      !Array.isArray(rows) ||
      !rows.length ||
      rows.some(
        row =>
          !sameKeys(row, columns) ||
          !Number.isSafeInteger(row.id) ||
          row.id < 1 ||
          typeof row.name !== "string"
      ) ||
      new Set(rows.map(row => row.id)).size !== rows.length
    )
      throw new Error(`文献データの行が不正です: ${table}`);
  }
  const ids = new Set(p.tables.outcomes.map(row => row.id));
  if (
    p.tables.literature_rules.some(
      row =>
        !ids.has(row.outcomeId) ||
        !row.ruleDefinition ||
        typeof row.ruleDefinition !== "object" ||
        Array.isArray(row.ruleDefinition)
    )
  )
    throw new Error("文献のアウトカム・ルール定義が不正です");
  return p;
}

export async function exportLiteratureSeed(connection) {
  const tables = {};
  await connection.query("SET time_zone = '+00:00'");
  await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await connection.beginTransaction();
  try {
    for (const [table, columns] of Object.entries(LITERATURE_COLUMNS)) {
      const [rows] = await connection.query(
        `SELECT ${columns.map(column => `\`${column}\``).join(",")} FROM \`${table}\` ORDER BY id`
      );
      tables[table] = rows;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
  const payload = {
    format: "rehab-literature-seed",
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  };
  const data = { checksum: seedDigest(payload), payload };
  validateLiteratureSeed(data);
  return data;
}

export async function importLiteratureSeed(connection, data) {
  const p = validateLiteratureSeed(data);
  await connection.query("SET time_zone = '+00:00'");
  await connection.beginTransaction();
  try {
    // Refuse every nonempty target; a release must never reset an existing installation.
    for (const table of [
      ...Object.keys(LITERATURE_COLUMNS),
      "predictions",
      "prediction_results",
    ]) {
      const [count] = await connection.query(
        `SELECT COUNT(*) AS n FROM \`${table}\``
      );
      if (Number(count[0].n) !== 0)
        throw new Error(
          "既存データがあるため初期化しません。新しい空のDBを指定してください"
        );
    }
    for (const [table, columns] of Object.entries(LITERATURE_COLUMNS)) {
      for (const row of p.tables[table]) {
        const values = columns.map(key =>
          ["ruleDefinition", "applyConditions"].includes(key) &&
          row[key] !== null
            ? JSON.stringify(row[key])
            : row[key]
        );
        await connection.execute(
          `INSERT INTO \`${table}\` (${columns.map(key => `\`${key}\``).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
          values
        );
      }
      const [actual] = await connection.query(
        `SELECT ${columns.map(key => `\`${key}\``).join(",")} FROM \`${table}\` ORDER BY id`
      );
      // mysql2 returns booleans as 0/1. The export intentionally uses the same representation.
      if (JSON.stringify(actual) !== JSON.stringify(p.tables[table]))
        throw new Error(`取り込み後の文献データが一致しません: ${table}`);
    }
    for (const table of ["predictions", "prediction_results"]) {
      const [count] = await connection.query(
        `SELECT COUNT(*) AS n FROM \`${table}\``
      );
      if (Number(count[0].n) !== 0)
        throw new Error("初期履歴が空ではありません");
    }
    await connection.commit();
    return {
      outcomes: p.tables.outcomes.length,
      rules: p.tables.literature_rules.length,
      predictions: 0,
      predictionResults: 0,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
