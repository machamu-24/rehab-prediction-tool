// The app uses SQLite on every desktop. Legacy MySQL export tools are kept separately.
import { getStore } from "./sqliteStore";
import type {
  InsertUser,
  InsertOutcome,
  InsertLiteratureRule,
  InsertPrediction,
  InsertPredictionResult,
  ActualOutcome,
} from "../drizzle/schema";
export async function getDb() {
  return getStore();
}
export async function upsertUser(data: InsertUser) {
  return getStore().upsertUser(data);
}
export async function getUserByOpenId(id: string) {
  return getStore().getUserByOpenId(id);
}
export async function getAllOutcomes() {
  return getStore().getAllOutcomes();
}
export async function getOutcomeById(id: number) {
  return getStore().getOutcomeById(id);
}
export async function createOutcome(data: InsertOutcome) {
  return getStore().createOutcome(data);
}
export async function updateOutcome(id: number, data: Partial<InsertOutcome>) {
  return getStore().updateOutcome(id, data);
}
export async function deleteOutcome(id: number) {
  return getStore().deleteOutcome(id);
}
export async function getAllRules(id?: number, activeOnly = false) {
  return getStore().getAllRules(id, activeOnly);
}
export async function getRuleById(id: number) {
  return getStore().getRuleById(id);
}
export async function createRule(data: InsertLiteratureRule) {
  return getStore().createRule(data);
}
export async function updateRule(
  id: number,
  data: Partial<InsertLiteratureRule>,
  token?: string
) {
  return getStore().updateRule(id, data, token);
}
export async function deleteRule(id: number) {
  return getStore().deleteRule(id);
}
export async function savePredictionWithResults(
  data: InsertPrediction,
  results: Array<Omit<InsertPredictionResult, "predictionId">>
) {
  return getStore().savePredictionWithResults(data, results);
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
  return getStore().getAllPredictions(limit, filters);
}
export async function getPredictionById(id: number) {
  return getStore().getPredictionById(id);
}
export async function updatePredictionOutcome(
  id: number,
  outcome: ActualOutcome,
  notes?: string
) {
  return getStore().updatePredictionOutcome(id, outcome, notes);
}
export async function getPredictionResultsByPredictionId(id: number) {
  return getStore().getPredictionResultsByPredictionId(id);
}
