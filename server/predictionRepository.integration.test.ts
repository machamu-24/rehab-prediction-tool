import { afterEach, beforeEach, describe, expect, it } from "vitest";
import mysql, { type Connection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { literatureRules, predictions, predictionResults } from "../drizzle/schema";
import { persistPrediction, savedResultCount } from "./predictionRepository";
import { removeLiteratureRule } from "./literatureRepository";
import dotenv from "dotenv";

// Opt-in only. Temporary tables shadow the real tables on this dedicated connection.
// No test writes to permanent patient/history tables.
describe.runIf(process.env.RUN_DB_INTEGRATION === "1")("MySQLの保存トランザクション", () => {
  let connection: Connection;
  beforeEach(async () => {
    dotenv.config({ quiet: true });
    connection = await mysql.createConnection(process.env.DATABASE_URL!);
    for (const table of ["literature_rules", "predictions", "prediction_results"]) {
      const [rows] = await connection.query<any[]>(`SHOW CREATE TABLE ${table}`);
      const ddl = String(rows[0]["Create Table"]);
      if (!ddl.startsWith("CREATE TABLE")) throw new Error("テーブル定義を取得できません");
      await connection.query(ddl.replace(/^CREATE TABLE/, "CREATE TEMPORARY TABLE"));
    }
  });
  afterEach(async () => { await connection?.end(); });
  const result = { ruleId: 1, ruleName: "テスト", isApplicable: true, isPositive: true, details: ["計算過程"] };
  it("MySQLの実際のinsertIdで個別結果を保存し、再取得できる", async () => {
    const savedRule = { id: 1, name: "保存時の文献", ruleDefinition: { type: "cutoff", threshold: 14 } };
    const snapshot = { status: "evaluated", numericValue: 72.52, prediction: "数値推定" };
    await connection.query("ALTER TABLE predictions AUTO_INCREMENT = 100");
    const id = await persistPrediction(drizzle(connection), {
      outcomeId: 1, patientInputs: { age: 70 }, caseId: "TEST_CASE", assessedOn: "2026-10-07",
      assessmentPhase: "admission", engineVersion: "test-v2", outcomeSnapshot: { id: 1, name: "保存時のアウトカム" } as any,
    }, [{ ...result, ruleSnapshot: savedRule as any, resultSnapshot: snapshot }]);
    savedRule.ruleDefinition.threshold = 99;
    expect(id).toBeGreaterThan(0);
    const [parents] = await connection.query<any[]>("SELECT * FROM predictions WHERE id = ?", [id]);
    const [children] = await connection.query<any[]>("SELECT * FROM prediction_results WHERE predictionId = ?", [id]);
    expect(parents).toHaveLength(1);
    expect(children).toHaveLength(1);
    expect(children[0].ruleName).toBe("テスト");
    expect(parents[0]).toMatchObject({caseId:"TEST_CASE",assessedOn:"2026-10-07",assessmentPhase:"admission",engineVersion:"test-v2",outcomeSnapshot:{name:"保存時のアウトカム"}});
    expect(children[0].ruleSnapshot.ruleDefinition.threshold).toBe(14);
    expect(children[0].resultSnapshot).toEqual(snapshot);
    const listed = await drizzle(connection).select({id:predictions.id,resultCount:savedResultCount}).from(predictions);
    expect(listed).toEqual([{id,resultCount:1}]);
  });
  it("個別結果の保存が失敗したら履歴本体も取り消す", async () => {
    await expect(persistPrediction(drizzle(connection), { outcomeId: 1, patientInputs: {} }, [{ ...result, ruleName: null as unknown as string }])).rejects.toThrow();
    const [parents] = await connection.query<any[]>("SELECT COUNT(*) AS total FROM predictions");
    const [children] = await connection.query<any[]>("SELECT COUNT(*) AS total FROM prediction_results");
    expect(parents[0].total).toBe(0);
    expect(children[0].total).toBe(0);
  });
  it.each([true, false])("履歴で使用した文献を削除しても、保存済み情報を保持する（スナップショット有無：%s）", async withSnapshot => {
    const db = drizzle(connection);
    const definition = {
      type: "cutoff" as const, field: "bbs_score", fieldLabel: "BBS",
      operator: ">=" as const, threshold: 20,
      positiveMessage: "支持", negativeMessage: "困難",
    };
    const [target] = await db.insert(literatureRules).values({ outcomeId: 1, name: "削除対象の合成文献", ruleType: "cutoff", source: "テスト用出典", ruleDefinition: definition });
    const [other] = await db.insert(literatureRules).values({ outcomeId: 1, name: "残す合成文献", ruleType: "cutoff", source: "別の出典", ruleDefinition: definition });
    const [savedRule] = await db.select().from(literatureRules).where(eq(literatureRules.id, target.insertId));
    const resultSnapshot = { status: "evaluated", consensusEligible: true, isPositive: true, prediction: "支持", numericValue: null };
    const predictionId = await persistPrediction(db, {
      outcomeId: 1, patientInputs: { bbs_score: 30 }, consensusScore: 1, consensusLabel: "positive",
    }, [{
      ...result, ruleId: savedRule.id, ruleName: savedRule.name,
      ruleSnapshot: withSnapshot ? savedRule : null,
      resultSnapshot: withSnapshot ? resultSnapshot : null,
    }]);
    const headersBefore = await db.select().from(predictions);
    const resultsBefore = await db.select().from(predictionResults);

    await removeLiteratureRule(db, savedRule.id);

    expect(await db.select().from(literatureRules).where(eq(literatureRules.id, savedRule.id))).toEqual([]);
    expect(await db.select().from(literatureRules).where(eq(literatureRules.id, other.insertId))).toHaveLength(1);
    expect(await db.select().from(predictions)).toEqual(headersBefore);
    expect(await db.select().from(predictionResults)).toEqual(resultsBefore);
    const [history] = await db.select({ id: predictions.id, resultCount: savedResultCount }).from(predictions);
    expect(history).toEqual({ id: predictionId, resultCount: 1 });
    if (withSnapshot) {
      expect(resultsBefore[0].ruleSnapshot?.source).toBe("テスト用出典");
      expect(resultsBefore[0].resultSnapshot).toEqual(resultSnapshot);
    }
  });
});
