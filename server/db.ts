import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  outcomes,
  literatureRules,
  predictions,
  predictionResults,
  type InsertOutcome,
  type InsertLiteratureRule,
  type InsertPrediction,
  type InsertPredictionResult,
  type ActualOutcome,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ---- Users ----

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ---- Outcomes ----

export async function getAllOutcomes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(outcomes).orderBy(outcomes.sortOrder, outcomes.createdAt);
}

export async function getOutcomeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(outcomes).where(eq(outcomes.id, id)).limit(1);
  return result[0];
}

export async function createOutcome(data: InsertOutcome) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(outcomes).values(data);
  return result;
}

export async function updateOutcome(id: number, data: Partial<InsertOutcome>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.update(outcomes).set(data).where(eq(outcomes.id, id));
}

export async function deleteOutcome(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.delete(outcomes).where(eq(outcomes.id, id));
}

// ---- Literature Rules ----

export async function getAllRules(outcomeId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (outcomeId !== undefined) {
    return db
      .select()
      .from(literatureRules)
      .where(and(eq(literatureRules.outcomeId, outcomeId), eq(literatureRules.isActive, true)))
      .orderBy(literatureRules.sortOrder, literatureRules.createdAt);
  }
  return db.select().from(literatureRules).orderBy(literatureRules.sortOrder, literatureRules.createdAt);
}

export async function getRuleById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(literatureRules).where(eq(literatureRules.id, id)).limit(1);
  return result[0];
}

export async function createRule(data: InsertLiteratureRule) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.insert(literatureRules).values(data);
}

export async function updateRule(id: number, data: Partial<InsertLiteratureRule>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.update(literatureRules).set(data).where(eq(literatureRules.id, id));
}

export async function deleteRule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.delete(literatureRules).where(eq(literatureRules.id, id));
}

// ---- Predictions ----

export async function createPrediction(data: InsertPrediction) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.insert(predictions).values(data);
}

export async function getAllPredictions(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(predictions).orderBy(desc(predictions.createdAt)).limit(limit);
}

export async function getPredictionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(predictions).where(eq(predictions.id, id)).limit(1);
  return result[0];
}

export async function updatePredictionOutcome(
  id: number,
  actualOutcome: ActualOutcome,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db
    .update(predictions)
    .set({ actualOutcome, outcomeRecordedAt: new Date(), notes: notes ?? null })
    .where(eq(predictions.id, id));
}

// ---- Prediction Results ----

export async function createPredictionResults(data: InsertPredictionResult[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.length === 0) return;
  return db.insert(predictionResults).values(data);
}

export async function getPredictionResultsByPredictionId(predictionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(predictionResults)
    .where(eq(predictionResults.predictionId, predictionId));
}
