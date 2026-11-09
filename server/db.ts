import { TRPCError } from "@trpc/server";
import { getEditToken } from "./ruleReview";
import { persistPrediction, savedResultCount } from "./predictionRepository";
import { removeLiteratureRule } from "./literatureRepository";
import { eq, desc, and, sql } from "drizzle-orm";
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
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
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
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0)
      updateSet.lastSignedIn = new Date();
    await db
      .insert(users)
      .values(values)
      .onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ---- Outcomes ----

export async function getAllOutcomes() {
  const db = await getDb();
  if (!db)
    throw new Error(
      "データベースに接続できません。接続設定を確認してください。"
    );
  return db
    .select()
    .from(outcomes)
    .orderBy(outcomes.sortOrder, outcomes.createdAt);
}

export async function getOutcomeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(outcomes)
    .where(eq(outcomes.id, id))
    .limit(1);
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
  return db.transaction(async tx => {
    const [outcome] = await tx
      .select()
      .from(outcomes)
      .where(eq(outcomes.id, id))
      .for("update");
    if (!outcome) throw new Error("アウトカムが見つかりません");
    if (outcome.isDefault)
      throw new Error("デフォルトのアウトカムは削除できません");
    const rules = await tx
      .select({ id: literatureRules.id })
      .from(literatureRules)
      .where(eq(literatureRules.outcomeId, id))
      .limit(1);
    const history = await tx
      .select({ id: predictions.id })
      .from(predictions)
      .where(eq(predictions.outcomeId, id))
      .limit(1);
    if (rules.length || history.length)
      throw new Error("文献ルールまたは履歴が紐づいているため削除できません");
    return tx.delete(outcomes).where(eq(outcomes.id, id));
  });
}

// ---- Literature Rules ----

export async function getAllRules(outcomeId?: number, activeOnly = false) {
  const db = await getDb();
  if (!db)
    throw new Error(
      "データベースに接続できません。接続設定を確認してください。"
    );
  const conditions = [];
  if (outcomeId !== undefined)
    conditions.push(eq(literatureRules.outcomeId, outcomeId));
  if (activeOnly) conditions.push(eq(literatureRules.isActive, true));
  return db
    .select()
    .from(literatureRules)
    .where(and(...conditions))
    .orderBy(literatureRules.sortOrder, literatureRules.createdAt);
}

export async function getRuleById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(literatureRules)
    .where(eq(literatureRules.id, id))
    .limit(1);
  return result[0];
}

export async function createRule(data: InsertLiteratureRule) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.insert(literatureRules).values(data);
}

export async function updateRule(
  id: number,
  data: Partial<InsertLiteratureRule>,
  expectedEditToken?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(literatureRules)
      .where(eq(literatureRules.id, id))
      .for("update");
    if (!current)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "文献ルールが見つかりません",
      });
    if (expectedEditToken && getEditToken(current) !== expectedEditToken)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "編集中にルールが更新されました。入力内容を控え、一覧を再読み込みして開き直してください",
      });
    return tx
      .update(literatureRules)
      .set(data)
      .where(eq(literatureRules.id, id));
  });
}

export async function deleteRule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return removeLiteratureRule(db, id);
}

// ---- Predictions ----

export async function savePredictionWithResults(
  data: InsertPrediction,
  results: Array<Omit<InsertPredictionResult, "predictionId">>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return persistPrediction(db, data, results);
}

export async function getAllPredictions(
  limit = 100,
  filters: {
    offset?: number;
    outcomeId?: number;
    search?: string;
    caseId?: string;
  } = {}
) {
  const db = await getDb();
  if (!db)
    throw new Error(
      "データベースに接続できません。接続設定を確認してください。"
    );
  const search = filters.search?.trim();
  const searchId =
    search && /^\d+$/.test(search) && Number.isSafeInteger(Number(search))
      ? Number(search)
      : -1;
  const conditions = [
    filters.caseId ? eq(predictions.caseId, filters.caseId) : undefined,
    filters.outcomeId
      ? eq(predictions.outcomeId, filters.outcomeId)
      : undefined,
    search
      ? sql`(${predictions.id} = ${searchId} or locate(${search}, coalesce(${predictions.notes}, '')) > 0)`
      : undefined,
  ];
  return db
    .select({
      id: predictions.id,
      outcomeId: predictions.outcomeId,
      patientInputs: predictions.patientInputs,
      consensusScore: predictions.consensusScore,
      consensusLabel: predictions.consensusLabel,
      actualOutcome: predictions.actualOutcome,
      outcomeRecordedAt: predictions.outcomeRecordedAt,
      notes: predictions.notes,
      createdAt: predictions.createdAt,
      updatedAt: predictions.updatedAt,
      caseId: predictions.caseId,
      assessedOn: predictions.assessedOn,
      assessmentPhase: predictions.assessmentPhase,
      timeContext: predictions.timeContext,
      engineVersion: predictions.engineVersion,
      outcomeSnapshot: predictions.outcomeSnapshot,
      resultCount: savedResultCount,
    })
    .from(predictions)
    .where(and(...conditions))
    .orderBy(
      ...(filters.caseId
        ? [desc(predictions.assessedOn), desc(predictions.id)]
        : [desc(predictions.createdAt), desc(predictions.id)])
    )
    .limit(limit)
    .offset(filters.offset ?? 0);
}

export async function getPredictionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(predictions)
    .where(eq(predictions.id, id))
    .limit(1);
  return result[0];
}

export async function updatePredictionOutcome(
  id: number,
  actualOutcome: ActualOutcome,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(predictions)
      .where(eq(predictions.id, id))
      .for("update");
    if (!current)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "照合履歴が見つかりません",
      });
    return tx
      .update(predictions)
      .set({
        actualOutcome: { ...current.actualOutcome, ...actualOutcome },
        outcomeRecordedAt: new Date(),
        ...(notes !== undefined ? { notes } : {}),
      })
      .where(eq(predictions.id, id));
  });
}

// ---- Prediction Results ----

export async function getPredictionResultsByPredictionId(predictionId: number) {
  const db = await getDb();
  if (!db)
    throw new Error(
      "データベースに接続できません。接続設定を確認してください。"
    );
  return db
    .select()
    .from(predictionResults)
    .where(eq(predictionResults.predictionId, predictionId));
}
