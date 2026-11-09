import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { predictions, predictionResults, type InsertPrediction, type InsertPredictionResult } from "../drizzle/schema";

/** The parent record and every rule result commit together or roll back together. */
export async function persistPrediction<TSchema extends Record<string, unknown>>(
  db: MySql2Database<TSchema>,
  data: InsertPrediction,
  results: Array<Omit<InsertPredictionResult, "predictionId">>,
): Promise<number> {
  return db.transaction(async tx => {
    const [header] = await tx.insert(predictions).values(data);
    const predictionId = header.insertId;
    if (!Number.isSafeInteger(predictionId) || predictionId <= 0) throw new Error("保存IDを取得できませんでした");
    if (results.length) {
      await tx.insert(predictionResults).values(results.map(result => ({ ...result, predictionId })));
    }
    return predictionId;
  });
}

// Keep the outer table qualifier explicit: Drizzle strips column qualifiers in
// select expressions, which otherwise turns this into a self-comparison.
export const savedResultCount = sql<number>`(select count(*) from prediction_results pr where pr.predictionId = predictions.id)`.mapWith(Number);
