import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  SqliteStore,
  getStore,
  closeStore,
  validateBackup,
  backupChecksum,
  restoreAsNewDatabase,
  defaultDataDirectory,
} from "./sqliteStore";
import { getEditToken } from "./ruleReview";
import { runEngine } from "./ruleEngine";
import type { LiteratureRule } from "../drizzle/schema";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const seed = JSON.parse(
  fs.readFileSync(
    new URL("../release/literature.seed.json", import.meta.url),
    "utf8"
  )
);
const caller = () =>
  appRouter.createCaller({
    user: null,
    req: { headers: {} },
    res: {},
  } as TrpcContext);
let dir: string;
let previous: string | undefined;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rehab-sqlite-test-"));
  previous = process.env.REHAB_DATA_DIR;
  process.env.REHAB_DATA_DIR = dir;
});
afterEach(() => {
  closeStore();
  if (previous === undefined) delete process.env.REHAB_DATA_DIR;
  else process.env.REHAB_DATA_DIR = previous;
  fs.rmSync(dir, { recursive: true, force: true });
});
const sample = {
  outcomeId: seed.payload.tables.outcomes[0].id,
  patientInputs: {
    bbs_score: 25,
    admission_fim_motor_total: 40,
    admission_fim_cognitive_total: 20,
  },
  caseId: "SQLITE-TEST-001",
  assessedOn: "2026-11-10",
  assessmentPhase: "followup",
};
const result = {
  ruleId: 123,
  ruleName: "保存時の文献",
  isApplicable: true,
  isPositive: false,
  details: ["合成テスト"],
  ruleSnapshot: {
    id: 123,
    name: "保存時の文献",
    ruleDefinition: { type: "cutoff", threshold: 20 },
  } as unknown as LiteratureRule,
  resultSnapshot: {
    status: "evaluated",
    isPositive: false,
    probability: 0,
    numericValue: 0,
  },
};

describe("SQLiteでの保存と移行", () => {
  it("初回だけ最新文献を取り込み、履歴を0件にする", () => {
    const s = getStore();
    expect(s.getAllOutcomes()).toHaveLength(
      seed.payload.tables.outcomes.length
    );
    expect(s.getAllRules()).toHaveLength(
      seed.payload.tables.literature_rules.length
    );
    expect(s.getAllPredictions()).toEqual([]);
    for (const source of seed.payload.tables.literature_rules) {
      const stored = s.getRuleById(source.id)!;
      expect(stored.ruleDefinition).toEqual(source.ruleDefinition);
      expect(stored.applyConditions).toEqual(source.applyConditions);
      expect(stored.isActive).toBe(Boolean(source.isActive));
      expect(stored.consensusEligible).toBe(Boolean(source.consensusEligible));
      expect(stored.createdAt).toBeInstanceOf(Date);
    }
  });
  it("文献の追加編集・履歴を終了後も保持し、別の同梱データで再初期化しない", () => {
    let s = getStore();
    const first = s.getAllRules()[0];
    s.updateRule(first.id, { name: "利用者が編集" }, getEditToken(first));
    const id = s.savePredictionWithResults(sample, [result]);
    const file = s.file;
    closeStore();
    const changed = structuredClone(seed);
    changed.payload.tables.literature_rules[0].name = "新しい同梱文献";
    changed.checksum = backupChecksum(changed.payload);
    s = new SqliteStore(file, changed);
    try {
      expect(s.getRuleById(first.id)!.name).toBe("利用者が編集");
      expect(s.getPredictionById(id)!.patientInputs.bbs_score).toBe(25);
      expect(
        s.getPredictionResultsByPredictionId(id)[0].resultSnapshot
      ).toEqual(result.resultSnapshot);
    } finally {
      s.close();
    }
  });
  it("個別結果で失敗した保存は親レコードごと取り消す", () => {
    const s = getStore();
    expect(() =>
      s.savePredictionWithResults(sample, [
        { ...result, ruleName: null as unknown as string },
      ])
    ).toThrow();
    expect(s.getAllPredictions()).toEqual([]);
    expect(
      s.db.prepare("SELECT COUNT(*) AS n FROM prediction_results").get()!.n
    ).toBe(0);
  });
  it("文献削除後も当時の結果・文献スナップショットを保持する", () => {
    const s = getStore();
    const rule = s.getAllRules()[0];
    const id = s.savePredictionWithResults(sample, [
      { ...result, ruleId: rule.id, ruleSnapshot: rule },
    ]);
    const before = s.getPredictionResultsByPredictionId(id);
    s.deleteRule(rule.id);
    expect(s.getRuleById(rule.id)).toBeUndefined();
    expect(s.getPredictionResultsByPredictionId(id)).toEqual(before);
    expect(s.getAllPredictions()[0].resultCount).toBe(1);
  });
  it("0・false・日本語・JSONと実績評価日を保持する", () => {
    const s = getStore();
    const id = s.savePredictionWithResults(
      {
        ...sample,
        patientInputs: {
          bbs_score: 0,
          spatial_neglect: false,
          stroke_type: "脳出血",
        },
      },
      [result]
    );
    s.updatePredictionOutcome(
      id,
      {
        value: 4,
        label: "FAC4",
        scale: "fac",
        measuredOn: "2026-11-10",
        daysSinceOnset: 60,
      },
      "日本語メモ"
    );
    expect(s.getPredictionById(id)).toMatchObject({
      patientInputs: {
        bbs_score: 0,
        spatial_neglect: false,
        stroke_type: "脳出血",
      },
      notes: "日本語メモ",
      actualOutcome: { measuredOn: "2026-11-10", value: 4 },
    });
    expect(s.getPredictionResultsByPredictionId(id)[0].isPositive).toBe(false);
  });
  it("症例の完全一致・メモ検索・評価日順・ページングを扱う", () => {
    const s = getStore();
    for (let i = 1; i <= 24; i++)
      s.savePredictionWithResults(
        {
          ...sample,
          caseId: i < 23 ? "SAME-CASE" : "OTHER",
          assessedOn: `2026-10-${String(i).padStart(2, "0")}`,
          notes: i === 1 ? "経過 TestMemo" : null,
        },
        []
      );
    expect(s.getAllPredictions(20, { caseId: "SAME-CASE" })).toHaveLength(20);
    expect(
      s.getAllPredictions(20, { caseId: "SAME-CASE", offset: 20 })
    ).toHaveLength(2);
    expect(s.getAllPredictions(20, { caseId: "same-case" })).toHaveLength(0);
    expect(s.getAllPredictions(20, { search: "testmemo" })).toHaveLength(1);
    expect(s.getAllPredictions(20, { caseId: "SAME-CASE" })[0].assessedOn).toBe(
      "2026-10-22"
    );
  });
  it("古い編集トークンで更新せず、参照中のアウトカムを削除しない", () => {
    const s = getStore();
    const rule = s.getAllRules()[0];
    const token = getEditToken(rule);
    s.updateRule(rule.id, { name: "先に更新" }, token);
    expect(() =>
      s.updateRule(rule.id, { name: "後から上書き" }, token)
    ).toThrow("編集中");
    expect(() => s.deleteOutcome(rule.outcomeId)).toThrow();
  });
  it("保存後に同じ文献・入力・時間軸の照合結果を維持する", () => {
    const s = getStore();
    for (const outcome of s.getAllOutcomes()) {
      const original = seed.payload.tables.literature_rules
        .filter((r: any) => r.outcomeId === outcome.id)
        .map((r: any) => ({
          ...r,
          isActive: Boolean(r.isActive),
          consensusEligible: Boolean(r.consensusEligible),
          createdAt: new Date(r.createdAt.replace(" ", "T") + "Z"),
          updatedAt: new Date(r.updatedAt.replace(" ", "T") + "Z"),
        }));
      for (const input of [
        {},
        { bbs_score: 0, spatial_neglect: false },
        {
          bbs_score: 40,
          age: 70,
          days_onset_to_admission: 30,
          admission_fim_motor_total: 40,
          admission_fim_cognitive_total: 20,
          admission_fim_total: 60,
          knee_ext_paretic_nm_kg: 0.7,
        },
      ])
        for (const kind of ["future", "concurrent"] as const)
          expect(runEngine(s.getAllRules(outcome.id), input, { kind })).toEqual(
            runEngine(original, input, { kind })
          );
    }
  });
  it("新しいDB版は上書きせず停止する", () => {
    const s = getStore();
    const file = s.file;
    s.db.exec("PRAGMA user_version=999");
    closeStore();
    expect(() => new SqliteStore(file, seed)).toThrow("新しい版");
  });
  it("未対応のDBを空のDBと誤認しない", () => {
    const s = getStore();
    const file = s.file;
    s.db.exec("PRAGMA user_version=0");
    closeStore();
    expect(() => new SqliteStore(file, seed)).toThrow("未対応");
  });
  it("バックアップの改ざん・余分なテーブル・参照切れを拒否する", () => {
    const s = getStore();
    s.savePredictionWithResults(sample, [result]);
    const payload = {
      format: "rehab-local-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      tables: s.exportTables(),
    };
    const data = { payload, checksum: backupChecksum(payload) };
    expect(
      validateBackup(JSON.parse(JSON.stringify(data))).tables.predictions
    ).toHaveLength(1);
    expect(() => validateBackup({ ...data, checksum: "bad" })).toThrow();
    const extra = { ...payload, tables: { ...payload.tables, users: [] } };
    expect(() =>
      validateBackup({ payload: extra, checksum: backupChecksum(extra) })
    ).toThrow("テーブル");
    const orphan = JSON.parse(JSON.stringify(data));
    orphan.payload.tables.prediction_results[0].predictionId = 999;
    orphan.checksum = backupChecksum(orphan.payload);
    const file = s.file;
    expect(() => restoreAsNewDatabase(orphan)).toThrow();
    expect(getStore().file).toBe(file);
    expect(getStore().getAllPredictions()).toHaveLength(1);
  });
  it("画面用APIからバックアップ・検証・別ファイル復元を行い、再起動後も復元先を使う", async () => {
    getStore().savePredictionWithResults(sample, [result]);
    const api = caller();
    const backup = await api.local.createBackup();
    expect(backup.counts.predictions).toBe(1);
    expect(
      (await api.local.verifyBackup({ name: backup.name })).counts.predictions
    ).toBe(1);
    const file = (await api.local.status()).databaseFile;
    const downloaded = await api.local.downloadBackup({ name: backup.name });
    expect(
      (await api.local.inspectBackup({ content: downloaded.content }))
        .legacyTimeZone
    ).toBe(false);
    await api.local.restoreBackup({
      content: downloaded.content,
      confirmed: true,
      legacyUTC: false,
    });
    expect(getStore().file).not.toBe(file);
    expect(fs.existsSync(file!)).toBe(true);
    const restored = getStore().file;
    closeStore();
    expect(getStore().file).toBe(restored);
    expect(getStore().getAllPredictions()).toHaveLength(1);
  });
  it("旧MySQLの0/1、JSON、時差情報のない日時も明示した解釈で移行する", () => {
    const s = getStore();
    s.savePredictionWithResults(sample, [result]);
    const tables = JSON.parse(JSON.stringify(s.exportTables()));
    for (const r of tables.outcomes) r.isDefault = r.isDefault ? 1 : 0;
    for (const r of tables.literature_rules) {
      r.isActive = r.isActive ? 1 : 0;
      r.consensusEligible = r.consensusEligible ? 1 : 0;
    }
    tables.predictions[0].createdAt = "2026-11-10 03:00:00";
    tables.prediction_results[0].isApplicable = 1;
    tables.prediction_results[0].isPositive = 0;
    const payload = {
      format: "rehab-local-backup",
      version: 1,
      createdAt: "2026-11-10T04:00:00Z",
      tables,
    };
    restoreAsNewDatabase({ payload, checksum: backupChecksum(payload) }, true);
    expect(getStore().getAllPredictions()[0].createdAt.toISOString()).toBe(
      "2026-11-10T03:00:00.000Z"
    );
    expect(getStore().getAllRules()[0].isActive).toBeTypeOf("boolean");
    expect(getStore().getPredictionResultsByPredictionId(1)[0].isPositive).toBe(
      false
    );
  });
  it("パスを含むバックアップ名と、失われた利用中DBの選択を拒否する", async () => {
    await expect(
      caller().local.downloadBackup({ name: "../data.json" })
    ).rejects.toThrow("バックアップ名");
    fs.mkdirSync(defaultDataDirectory(), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "active-db.json"),
      JSON.stringify({ file: "rehab-restored-1234.sqlite" })
    );
    expect(() => getStore()).toThrow("見つかりません");
  });
  it("利用中SQLiteの最新文献だけを書き出し、症例・履歴を配布データへ混ぜない", () => {
    const s = getStore();
    const rule = s.getAllRules()[0];
    s.updateRule(rule.id, { name: "NEWEST-FOR-RELEASE" }, getEditToken(rule));
    s.savePredictionWithResults({ ...sample, notes: "PRIVATE-TEST-MEMO" }, [
      result,
    ]);
    const output = path.join(dir, "export with spaces.json");
    execFileSync(
      process.execPath,
      [
        "scripts/export-release-literature.mjs",
        "--sqlite",
        s.file,
        "--output",
        output,
      ],
      { stdio: "pipe" }
    );
    const data = JSON.parse(fs.readFileSync(output, "utf8"));
    expect(Object.keys(data.payload.tables).sort()).toEqual([
      "literature_rules",
      "outcomes",
    ]);
    expect(
      data.payload.tables.literature_rules.find((r: any) => r.id === rule.id)
        .name
    ).toBe("NEWEST-FOR-RELEASE");
    expect(JSON.stringify(data)).not.toContain("PRIVATE-TEST-MEMO");
    expect(data.checksum).toBe(backupChecksum(data.payload));
  });
});
