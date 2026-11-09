import "dotenv/config";
import mysql from "mysql2/promise";
import { createBackup } from "./lib/local-backup.mjs";
import { addLogisticRuleType } from "./lib/local-schema.mjs";
import { GIANELLA_SOURCE_URL } from "./lib/gianella-2019.mjs";
import { fingerprint } from "./lib/literature-review.mjs";

const apply = process.argv.includes("--apply");
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, dateStrings: true, connectTimeout: 5000 });
try {
  if (apply) {
    console.log("変更前バックアップ:", (await createBackup(connection)).name);
    console.log("ruleTypeのenum拡張:", await addLogisticRuleType(connection));
  }
  await connection.beginTransaction();
  const [rows] = await connection.execute(
    "SELECT * FROM literature_rules WHERE sourceUrl = ? OR source LIKE ? FOR UPDATE",
    [GIANELLA_SOURCE_URL, "%10.1016/j.jstrokecerebrovasdis.2019.104367%"],
  );
  if (rows.length > 1) throw new Error("Gianellaら2019の登録が重複しています。文献の変更を停止しました。");
  for (const row of rows) {
    const def = typeof row.ruleDefinition === "string" ? JSON.parse(row.ruleDefinition) : row.ruleDefinition;
    if (!["nomogram", "logistic_regression"].includes(row.ruleType) || def.type !== row.ruleType || def.modelType !== "logistic")
      throw new Error("対象文献のモデル定義が想定と異なります。文献の変更を停止しました。");
    const definition = { ...def, type: "logistic_regression", outputMode: def.outputMode ?? "probability" };
    const changed = row.ruleType !== "logistic_regression" || fingerprint(def) !== fingerprint(definition);
    if (apply && changed) {
      await connection.execute("UPDATE literature_rules SET ruleType = ?, ruleDefinition = ? WHERE id = ?", ["logistic_regression", JSON.stringify(definition), row.id]);
      const [readback] = await connection.execute("SELECT * FROM literature_rules WHERE id = ?", [row.id]);
      const actual = readback[0];
      const actualDef = typeof actual.ruleDefinition === "string" ? JSON.parse(actual.ruleDefinition) : actual.ruleDefinition;
      if (actual.ruleType !== "logistic_regression" || fingerprint(actualDef) !== fingerprint(definition))
        throw new Error("登録後のモデル定義の読み戻し検証に失敗しました。");
      for (const key of Object.keys(row).filter(key => !["ruleType", "ruleDefinition", "updatedAt"].includes(key)))
        if (fingerprint(actual[key]) !== fingerprint(row[key])) throw new Error(`変更対象外の項目が変化しました: ${key}`);
    }
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", id: row.id, name: row.name, outcomeId: row.outcomeId, from: row.ruleType, to: "logistic_regression", changed }));
  }
  if (apply) await connection.commit(); else await connection.rollback();
} catch (error) {
  await connection.rollback();
  throw error;
} finally { await connection.end(); }
