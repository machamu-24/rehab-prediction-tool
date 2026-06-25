import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const OUTPUT = path.join(ROOT, "scripts/demo-data.snapshot.json");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const generatedAt = new Date().toISOString();
const defaultVersion = `${generatedAt
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z")}-db-snapshot`;
const version = process.env.DEMO_DATA_VERSION ?? defaultVersion;

function parseJsonMaybe(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toIso(value, fallback) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return new Date(value).toISOString();
  return fallback;
}

function normalizeOutcome(outcome, generatedAt) {
  return {
    id: Number(outcome.id),
    name: outcome.name,
    description: outcome.description ?? null,
    unit: outcome.unit ?? null,
    positiveLabel: outcome.positiveLabel,
    negativeLabel: outcome.negativeLabel,
    isDefault: Boolean(outcome.isDefault),
    sortOrder: Number(outcome.sortOrder ?? 0),
    createdAt: toIso(outcome.createdAt, generatedAt),
    updatedAt: toIso(outcome.updatedAt, generatedAt),
  };
}

function normalizeRule(rule, generatedAt) {
  return {
    id: Number(rule.id),
    outcomeId: Number(rule.outcomeId),
    name: rule.name,
    ruleType: rule.ruleType,
    source: rule.source,
    sourceUrl: rule.sourceUrl || null,
    evidenceLevel: rule.evidenceLevel,
    applyConditions: parseJsonMaybe(rule.applyConditions, []),
    ruleDefinition: parseJsonMaybe(rule.ruleDefinition, {}),
    accuracy: rule.accuracy ?? null,
    sensitivity: rule.sensitivity ?? null,
    specificity: rule.specificity ?? null,
    auc: rule.auc ?? null,
    consensusEligible: Boolean(rule.consensusEligible),
    isActive: Boolean(rule.isActive),
    sortOrder: Number(rule.sortOrder ?? 0),
    createdAt: toIso(rule.createdAt, generatedAt),
    updatedAt: toIso(rule.updatedAt, generatedAt),
  };
}

const connection = await mysql.createConnection(DATABASE_URL);

try {
  const [outcomeRows] = await connection.execute(
    `SELECT id, name, description, unit, positiveLabel, negativeLabel, isDefault,
            sortOrder, createdAt, updatedAt
       FROM outcomes
      ORDER BY sortOrder, id`,
  );
  const [ruleRows] = await connection.execute(
    `SELECT id, outcomeId, name, ruleType, source, sourceUrl, evidenceLevel,
            applyConditions, ruleDefinition, accuracy, sensitivity, specificity,
            auc, consensusEligible, isActive, sortOrder, createdAt, updatedAt
       FROM literature_rules
      ORDER BY sortOrder, id`,
  );

  const snapshot = {
    version,
    generatedAt,
    source: "local database outcomes and literature_rules",
    outcomes: outcomeRows.map((outcome) => normalizeOutcome(outcome, generatedAt)),
    rules: ruleRows.map((rule) => normalizeRule(rule, generatedAt)),
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(
    `Exported ${path.relative(ROOT, OUTPUT)} with ${snapshot.outcomes.length} outcomes and ${snapshot.rules.length} rules.`,
  );
} finally {
  await connection.end();
}
