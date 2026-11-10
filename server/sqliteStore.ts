import type {
  DatabaseSync as NativeDatabase,
  SQLInputValue,
} from "node:sqlite";
import { createRequire } from "node:module";
// Vite 5 (used by the existing test runner) predates the node:sqlite builtin.
const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite"
) as typeof import("node:sqlite");
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { getEditToken } from "./ruleReview";
import { RULE_TYPES } from "../shared/ruleTypes";
import { validateLiteratureSeed } from "../scripts/lib/literature-seed.mjs";
import type {
  Outcome,
  LiteratureRule,
  Prediction,
  PredictionResult,
  User,
  InsertOutcome,
  InsertLiteratureRule,
  InsertPrediction,
  InsertPredictionResult,
  InsertUser,
  ActualOutcome,
} from "../drizzle/schema";

export const SQLITE_SCHEMA_VERSION = 1;
export const BACKUP_TABLES = [
  "outcomes",
  "literature_rules",
  "predictions",
  "prediction_results",
] as const;
type Table = "users" | (typeof BACKUP_TABLES)[number];
type RowTypes = {
  users: User;
  outcomes: Outcome;
  literature_rules: LiteratureRule;
  predictions: Prediction;
  prediction_results: PredictionResult;
};
type Row = Record<string, unknown>;
const columns = {
  users: {
    id: "int",
    openId: "text",
    name: "text",
    email: "text",
    loginMethod: "text",
    role: "text",
    createdAt: "date",
    updatedAt: "date",
    lastSignedIn: "date",
  },
  outcomes: {
    id: "int",
    name: "text",
    description: "text",
    unit: "text",
    positiveLabel: "text",
    negativeLabel: "text",
    isDefault: "bool",
    sortOrder: "int",
    createdAt: "date",
    updatedAt: "date",
  },
  literature_rules: {
    id: "int",
    outcomeId: "int",
    name: "text",
    ruleType: "text",
    source: "text",
    sourceUrl: "text",
    evidenceLevel: "text",
    applyConditions: "json",
    ruleDefinition: "json",
    accuracy: "real",
    sensitivity: "real",
    specificity: "real",
    auc: "real",
    consensusEligible: "bool",
    isActive: "bool",
    sortOrder: "int",
    createdAt: "date",
    updatedAt: "date",
  },
  predictions: {
    id: "int",
    patientInputs: "json",
    outcomeId: "int",
    consensusScore: "real",
    caseId: "text",
    assessedOn: "text",
    assessmentPhase: "text",
    timeContext: "json",
    engineVersion: "text",
    outcomeSnapshot: "json",
    consensusLabel: "text",
    actualOutcome: "json",
    outcomeRecordedAt: "date",
    notes: "text",
    createdAt: "date",
    updatedAt: "date",
  },
  prediction_results: {
    id: "int",
    predictionId: "int",
    ruleId: "int",
    ruleName: "text",
    isApplicable: "bool",
    unavailableReason: "text",
    isPositive: "bool",
    prediction: "text",
    probability: "real",
    details: "json",
    ruleSnapshot: "json",
    resultSnapshot: "json",
    createdAt: "date",
  },
} as const;
const now = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
const SCHEMA = `
CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,openId TEXT NOT NULL UNIQUE,name TEXT,email TEXT,loginMethod TEXT,role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),createdAt TEXT NOT NULL DEFAULT ${now},updatedAt TEXT NOT NULL DEFAULT ${now},lastSignedIn TEXT NOT NULL DEFAULT ${now}) STRICT;
CREATE TABLE outcomes(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT,unit TEXT,positiveLabel TEXT NOT NULL DEFAULT '自立',negativeLabel TEXT NOT NULL DEFAULT '非自立',isDefault INTEGER NOT NULL DEFAULT 0 CHECK(isDefault IN(0,1)),sortOrder INTEGER NOT NULL DEFAULT 0,createdAt TEXT NOT NULL DEFAULT ${now},updatedAt TEXT NOT NULL DEFAULT ${now}) STRICT;
CREATE TABLE literature_rules(id INTEGER PRIMARY KEY AUTOINCREMENT,outcomeId INTEGER NOT NULL REFERENCES outcomes(id),name TEXT NOT NULL,ruleType TEXT NOT NULL CHECK(ruleType IN (${RULE_TYPES.map(type => `'${type}'`).join(",")})),source TEXT NOT NULL,sourceUrl TEXT,evidenceLevel TEXT NOT NULL DEFAULT 'Cohort Study',applyConditions TEXT CHECK(applyConditions IS NULL OR json_valid(applyConditions)),ruleDefinition TEXT NOT NULL CHECK(json_valid(ruleDefinition)),accuracy REAL,sensitivity REAL,specificity REAL,auc REAL,consensusEligible INTEGER NOT NULL DEFAULT 1 CHECK(consensusEligible IN(0,1)),isActive INTEGER NOT NULL DEFAULT 1 CHECK(isActive IN(0,1)),sortOrder INTEGER NOT NULL DEFAULT 0,createdAt TEXT NOT NULL DEFAULT ${now},updatedAt TEXT NOT NULL DEFAULT ${now}) STRICT;
CREATE TABLE predictions(id INTEGER PRIMARY KEY AUTOINCREMENT,patientInputs TEXT NOT NULL CHECK(json_valid(patientInputs)),outcomeId INTEGER NOT NULL,consensusScore REAL,caseId TEXT,assessedOn TEXT,assessmentPhase TEXT,timeContext TEXT CHECK(timeContext IS NULL OR json_valid(timeContext)),engineVersion TEXT,outcomeSnapshot TEXT CHECK(outcomeSnapshot IS NULL OR json_valid(outcomeSnapshot)),consensusLabel TEXT,actualOutcome TEXT CHECK(actualOutcome IS NULL OR json_valid(actualOutcome)),outcomeRecordedAt TEXT,notes TEXT,createdAt TEXT NOT NULL DEFAULT ${now},updatedAt TEXT NOT NULL DEFAULT ${now}) STRICT;
CREATE TABLE prediction_results(id INTEGER PRIMARY KEY AUTOINCREMENT,predictionId INTEGER NOT NULL REFERENCES predictions(id),ruleId INTEGER NOT NULL,ruleName TEXT NOT NULL,isApplicable INTEGER NOT NULL CHECK(isApplicable IN(0,1)),unavailableReason TEXT,isPositive INTEGER CHECK(isPositive IS NULL OR isPositive IN(0,1)),prediction TEXT,probability REAL,details TEXT CHECK(details IS NULL OR json_valid(details)),ruleSnapshot TEXT CHECK(ruleSnapshot IS NULL OR json_valid(ruleSnapshot)),resultSnapshot TEXT CHECK(resultSnapshot IS NULL OR json_valid(resultSnapshot)),createdAt TEXT NOT NULL DEFAULT ${now}) STRICT;
CREATE INDEX idx_case_assessment ON predictions(caseId,assessedOn,id);
CREATE INDEX idx_prediction_results_parent ON prediction_results(predictionId);
CREATE INDEX idx_rules_outcome ON literature_rules(outcomeId,isActive);
`;

export function defaultDataDirectory() {
  return path.resolve(
    process.env.REHAB_DATA_DIR ||
      (process.platform === "win32"
        ? path.join(
            process.env.LOCALAPPDATA ||
              path.join(os.homedir(), "AppData/Local"),
            "RehabPredict"
          )
        : process.platform === "darwin"
          ? path.join(os.homedir(), "Library/Application Support/RehabPredict")
          : path.join(os.homedir(), ".local/share/RehabPredict"))
  );
}
export function seedFilePath() {
  return (
    process.env.REHAB_SEED_PATH ||
    fileURLToPath(new URL("../release/literature.seed.json", import.meta.url))
  );
}

function encode(
  kind: string,
  value: unknown,
  legacyUTC = false
): SQLInputValue {
  if (value === null) return null;
  if (kind === "json") {
    const result = JSON.stringify(value);
    if (result === undefined) throw new Error("JSONの値が不正です");
    return result;
  }
  if (kind === "bool") {
    if (![true, false, 0, 1].includes(value as boolean))
      throw new Error("真偽値が不正です");
    return value === true || value === 1 ? 1 : 0;
  }
  if (kind === "date") {
    let raw = value;
    if (
      legacyUTC &&
      typeof raw === "string" &&
      /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(raw)
    )
      raw = raw.replace(" ", "T") + "Z";
    const date = raw instanceof Date ? raw : new Date(String(raw));
    if (!Number.isFinite(date.getTime())) throw new Error("保存日時が不正です");
    return date.toISOString();
  }
  if (kind === "text") {
    if (typeof value !== "string") throw new Error("文字列の形式が不正です");
    return value;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (kind === "int" && !Number.isSafeInteger(value))
  )
    throw new Error("数値の形式が不正です");
  return value;
}
function decode<K extends Table>(
  table: K,
  row: Row | undefined
): RowTypes[K] | undefined {
  if (!row) return undefined;
  const output: Row = { ...row };
  for (const [key, kind] of Object.entries(columns[table]))
    if (output[key] != null) {
      if (kind === "json") output[key] = JSON.parse(String(output[key]));
      else if (kind === "bool") output[key] = output[key] === 1;
      else if (kind === "date") output[key] = new Date(String(output[key]));
    }
  return output as RowTypes[K];
}

export class SqliteStore {
  readonly db: NativeDatabase;
  constructor(
    readonly file: string,
    seed?: unknown
  ) {
    if (file !== ":memory:")
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file, {
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
    });
    try {
      const version = Number(
        this.db.prepare("PRAGMA user_version").get()!.user_version
      );
      if (version > SQLITE_SCHEMA_VERSION)
        throw new Error(
          "このDBは新しい版のアプリで作られています。新しい版で開いてください。"
        );
      if (file !== ":memory:") {
        try {
          fs.chmodSync(file, 0o600);
        } catch {
          /* Windows uses profile ACLs. */
        }
      }
      this.db.exec(
        "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;"
      );
      if (version === 0)
        this.transaction(() => {
          if (
            this.db
              .prepare(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
              )
              .get()
          )
            throw new Error(
              "未対応のDB構造です。既存データを変更せず停止しました。"
            );
          this.db.exec(SCHEMA);
          if (seed) this.importSeed(seed);
          this.db.exec(`PRAGMA user_version=${SQLITE_SCHEMA_VERSION}`);
        });
      // Existing installations are never reseeded, even if the bundled literature changes.
      if (this.db.prepare("PRAGMA foreign_key_check").get())
        throw new Error("データの関連付けに不整合があります");
      if (file !== ":memory:") {
        try {
          fs.chmodSync(file, 0o600);
        } catch {
          /* Windows ACLs use the user profile. */
        }
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      if (result instanceof Promise)
        throw new Error("保存トランザクション内で非同期処理はできません");
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  rows<K extends Table>(
    table: K,
    suffix = "",
    params: SQLInputValue[] = []
  ): RowTypes[K][] {
    return this.db
      .prepare(`SELECT * FROM ${table} ${suffix}`)
      .all(...params)
      .map(row => decode(table, row)!);
  }
  byId<K extends Table>(table: K, id: number): RowTypes[K] | undefined {
    return decode(
      table,
      this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id)
    );
  }
  insert(table: Table, value: object, legacyUTC = false) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (
      !entries.length ||
      entries.some(([key]) => !Object.hasOwn(columns[table], key))
    )
      throw new Error("未対応の保存項目があります");
    const id = this.db
      .prepare(
        `INSERT INTO ${table} (${entries.map(([key]) => `"${key}"`).join(",")}) VALUES (${entries.map(() => "?").join(",")})`
      )
      .run(
        ...entries.map(([key, item]) =>
          encode(
            (columns[table] as Record<string, string>)[key],
            item,
            legacyUTC
          )
        )
      ).lastInsertRowid;
    if (!Number.isSafeInteger(Number(id)) || Number(id) < 1)
      throw new Error("保存IDを取得できません");
    return Number(id);
  }
  update(table: Table, id: number, data: object) {
    const entries = Object.entries(data).filter(
      ([key, v]) => key !== "id" && v !== undefined
    );
    if (entries.some(([key]) => !Object.hasOwn(columns[table], key)))
      throw new Error("未対応の保存項目があります");
    if (
      Object.hasOwn(columns[table], "updatedAt") &&
      !entries.some(([key]) => key === "updatedAt")
    )
      entries.push(["updatedAt", new Date()]);
    if (!entries.length) return;
    this.db
      .prepare(
        `UPDATE ${table} SET ${entries.map(([key]) => `"${key}"=?`).join(",")} WHERE id=?`
      )
      .run(
        ...entries.map(([key, value]) =>
          encode((columns[table] as Record<string, string>)[key], value)
        ),
        id
      );
  }
  private importSeed(data: unknown) {
    const seed = validateLiteratureSeed(data);
    for (const row of seed.tables.outcomes) this.insert("outcomes", row, true);
    for (const row of seed.tables.literature_rules)
      this.insert("literature_rules", row, true);
  }
  getAllOutcomes() {
    return this.rows("outcomes", "ORDER BY sortOrder, createdAt, id");
  }
  getOutcomeById(id: number) {
    return this.byId("outcomes", id);
  }
  createOutcome(data: InsertOutcome) {
    return this.insert("outcomes", data);
  }
  updateOutcome(id: number, data: Partial<InsertOutcome>) {
    return this.update("outcomes", id, data);
  }
  deleteOutcome(id: number) {
    return this.transaction(() => {
      const current = this.getOutcomeById(id);
      if (!current) throw new Error("アウトカムが見つかりません");
      if (current.isDefault)
        throw new Error("デフォルトのアウトカムは削除できません");
      if (
        this.db
          .prepare(
            "SELECT id FROM literature_rules WHERE outcomeId=? UNION ALL SELECT id FROM predictions WHERE outcomeId=? LIMIT 1"
          )
          .get(id, id)
      )
        throw new Error("文献ルールまたは履歴が紐づいているため削除できません");
      this.db.prepare("DELETE FROM outcomes WHERE id=?").run(id);
    });
  }
  getAllRules(outcomeId?: number, activeOnly = false) {
    const conditions: string[] = [];
    const params: SQLInputValue[] = [];
    if (outcomeId !== undefined) {
      conditions.push("outcomeId=?");
      params.push(outcomeId);
    }
    if (activeOnly) conditions.push("isActive=1");
    return this.rows(
      "literature_rules",
      `${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY sortOrder,createdAt,id`,
      params
    );
  }
  getRuleById(id: number) {
    return this.byId("literature_rules", id);
  }
  createRule(data: InsertLiteratureRule) {
    return this.insert("literature_rules", data);
  }
  updateRule(id: number, data: Partial<InsertLiteratureRule>, token?: string) {
    return this.transaction(() => {
      const current = this.getRuleById(id);
      if (!current)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文献ルールが見つかりません",
        });
      if (token && getEditToken(current) !== token)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "編集中にルールが更新されました。入力内容を控え、一覧を再読み込みして開き直してください",
        });
      this.update("literature_rules", id, data);
    });
  }
  deleteRule(id: number) {
    this.db.prepare("DELETE FROM literature_rules WHERE id=?").run(id);
  }
  savePredictionWithResults(
    data: InsertPrediction,
    results: Array<Omit<InsertPredictionResult, "predictionId">>
  ) {
    return this.transaction(() => {
      if (!this.getOutcomeById(data.outcomeId))
        throw new Error("アウトカムが見つかりません");
      const id = this.insert("predictions", data);
      for (const result of results)
        this.insert("prediction_results", { ...result, predictionId: id });
      return id;
    });
  }
  getAllPredictions(
    limit = 100,
    filters: {
      offset?: number;
      outcomeId?: number;
      search?: string;
      caseId?: string;
    } = {}
  ) {
    const conditions: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.caseId) {
      conditions.push("p.caseId=?");
      params.push(filters.caseId);
    }
    if (filters.outcomeId) {
      conditions.push("p.outcomeId=?");
      params.push(filters.outcomeId);
    }
    const search = filters.search?.trim();
    if (search) {
      const id =
        /^\d+$/.test(search) && Number.isSafeInteger(Number(search))
          ? Number(search)
          : -1;
      conditions.push(
        "(p.id=? OR instr(lower(coalesce(p.notes,'')),lower(?))>0)"
      );
      params.push(id, search);
    }
    const rows = this.db
      .prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM prediction_results pr WHERE pr.predictionId=p.id) AS resultCount FROM predictions p ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY ${filters.caseId ? "p.assessedOn" : "p.createdAt"} DESC,p.id DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, filters.offset ?? 0);
    return rows.map(row => ({
      ...decode("predictions", row)!,
      resultCount: Number(row.resultCount),
    }));
  }
  getPredictionById(id: number) {
    return this.byId("predictions", id);
  }
  getPredictionResultsByPredictionId(id: number) {
    return this.rows("prediction_results", "WHERE predictionId=? ORDER BY id", [
      id,
    ]);
  }
  updatePredictionOutcome(
    id: number,
    actualOutcome: ActualOutcome,
    notes?: string
  ) {
    return this.transaction(() => {
      const current = this.getPredictionById(id);
      if (!current)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "照合履歴が見つかりません",
        });
      this.update("predictions", id, {
        actualOutcome: { ...current.actualOutcome, ...actualOutcome },
        outcomeRecordedAt: new Date(),
        ...(notes !== undefined ? { notes } : {}),
      });
    });
  }
  getUserByOpenId(id: string) {
    return this.rows("users", "WHERE openId=? LIMIT 1", [id])[0];
  }
  upsertUser(data: InsertUser) {
    return this.transaction(() => {
      const current = this.getUserByOpenId(data.openId);
      if (current) this.update("users", current.id, data);
      else this.insert("users", data);
    });
  }
  exportTables() {
    return this.transaction(() =>
      Object.fromEntries(
        BACKUP_TABLES.map(table => [table, this.rows(table, "ORDER BY id")])
      )
    );
  }
  importBackup(tables: Record<string, Row[]>, legacyUTC = false) {
    return this.transaction(() => {
      for (const table of BACKUP_TABLES) {
        if (
          Number(
            this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n
          ) !== 0
        )
          throw new Error("既存データがあるため復元できません");
        for (const row of tables[table]) {
          const entries = Object.entries(row);
          if (entries.some(([key]) => !Object.hasOwn(columns[table], key)))
            throw new Error(`未対応のバックアップ項目: ${table}`);
          this.insert(table, row, legacyUTC);
        }
      }
      if (this.db.prepare("PRAGMA foreign_key_check").get())
        throw new Error("バックアップのデータ関連付けが不正です");
      for (const table of BACKUP_TABLES) {
        const actual = this.rows(table, "ORDER BY id") as unknown as Row[];
        const expected = [...tables[table]].sort(
          (a, b) => Number(a.id) - Number(b.id)
        );
        if (actual.length !== expected.length)
          throw new Error("復元件数が一致しません");
        for (let i = 0; i < actual.length; i++)
          for (const [key, value] of Object.entries(expected[i])) {
            const kind = (columns[table] as Record<string, string>)[key];
            const encoded = encode(kind, value, legacyUTC);
            const restored = encode(kind, actual[i][key]);
            if (encoded !== restored)
              throw new Error(`復元した値が一致しません: ${table}.${key}`);
          }
      }
    });
  }
}

let active: SqliteStore | undefined;
export function getStore() {
  if (active) return active;
  const dir = defaultDataDirectory();
  let filename = "rehab.sqlite";
  const config = path.join(dir, "active-db.json");
  if (fs.existsSync(config)) {
    const value = JSON.parse(fs.readFileSync(config, "utf8"));
    if (
      typeof value.file !== "string" ||
      !/^rehab(?:-restored-[a-f0-9-]+)?\.sqlite$/.test(value.file)
    )
      throw new Error("データベース選択情報が不正です");
    filename = value.file;
    if (!fs.existsSync(path.join(dir, filename)))
      throw new Error(
        "利用中のデータファイルが見つかりません。既存データを変更せず停止しました。"
      );
  }
  const seed = JSON.parse(fs.readFileSync(seedFilePath(), "utf8"));
  active = new SqliteStore(path.join(dir, filename), seed);
  return active;
}
export function closeStore() {
  active?.close();
  active = undefined;
}
export const backupChecksum = (payload: unknown) =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");
export function validateBackup(data: unknown) {
  const record = data as {
    checksum?: unknown;
    payload?: {
      format?: unknown;
      version?: unknown;
      createdAt?: unknown;
      timestampTimeZone?: unknown;
      tables?: unknown;
    };
  };
  const payload = record?.payload;
  if (
    payload?.format !== "rehab-local-backup" ||
    payload.version !== 1 ||
    record.checksum !== backupChecksum(payload)
  )
    throw new Error("バックアップの形式・チェックサムが一致しません");
  const tables = payload.tables as Record<string, Row[]>;
  if (
    !tables ||
    typeof tables !== "object" ||
    Object.keys(tables).sort().join() !== [...BACKUP_TABLES].sort().join()
  )
    throw new Error("バックアップのテーブルが不正です");
  for (const table of BACKUP_TABLES) {
    if (
      !Array.isArray(tables[table]) ||
      tables[table].some(
        row => !row || !Number.isSafeInteger(row.id) || Number(row.id) < 1
      ) ||
      new Set(tables[table].map(row => row.id)).size !== tables[table].length
    )
      throw new Error("バックアップの行が不正です");
  }
  return { ...payload, tables };
}
export function restoreAsNewDatabase(data: unknown, legacyUTC = false) {
  const payload = validateBackup(data);
  const dir = defaultDataDirectory();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = `rehab-restored-${randomUUID()}.sqlite`;
  const full = path.join(dir, file);
  const restored = new SqliteStore(full);
  try {
    restored.importBackup(
      payload.tables,
      legacyUTC || payload.timestampTimeZone === "UTC"
    );
    restored.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    restored.close();
  } catch (error) {
    restored.close();
    for (const suffix of ["", "-wal", "-shm"])
      fs.rmSync(full + suffix, { force: true });
    throw error;
  }
  const selected = path.join(dir, `active-db-${randomUUID()}.tmp`);
  fs.writeFileSync(selected, JSON.stringify({ file }), {
    mode: 0o600,
    flag: "wx",
  });
  fs.renameSync(selected, path.join(dir, "active-db.json"));
  closeStore();
  return {
    file,
    counts: Object.fromEntries(
      BACKUP_TABLES.map(table => [table, payload.tables[table].length])
    ),
  };
}
