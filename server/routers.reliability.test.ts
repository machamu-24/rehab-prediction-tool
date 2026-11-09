import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import { getEditToken } from "./ruleReview";
import { runEngine } from "./ruleEngine";
import { createGianellaRule } from "../scripts/lib/gianella-2019.mjs";
import fs from "node:fs";
import { reviewLiterature } from "../scripts/lib/literature-review.mjs";

vi.mock("./db", () => ({
  getAllOutcomes: vi.fn(),
  getOutcomeById: vi.fn(),
  createOutcome: vi.fn(),
  updateOutcome: vi.fn(),
  deleteOutcome: vi.fn(),
  getAllRules: vi.fn(),
  getRuleById: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  savePredictionWithResults: vi.fn(),
  getAllPredictions: vi.fn(),
  getPredictionById: vi.fn(),
  updatePredictionOutcome: vi.fn(),
  getPredictionResultsByPredictionId: vi.fn(),
}));
const caller = appRouter.createCaller({
  user: null,
  req: { headers: {} },
  res: {},
} as TrpcContext);
const rule = {
  id: 1,
  outcomeId: 1,
  name: "BBS",
  source: "Test",
  sourceUrl: null,
  evidenceLevel: "Other",
  isActive: true,
  consensusEligible: true,
  ruleType: "cutoff",
  applyConditions: [],
  ruleDefinition: {
    evidenceReview: { status: "checked", reason: "合成テスト" },
    type: "cutoff",
    field: "bbs_score",
    fieldLabel: "BBS",
    operator: ">=",
    threshold: 14,
    positiveMessage: "支持",
    negativeMessage: "困難",
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.getOutcomeById).mockResolvedValue({ id: 1 } as any);
  vi.mocked(db.getAllRules).mockResolvedValue([rule] as any);
  vi.mocked(db.savePredictionWithResults).mockResolvedValue(123);
});

describe("ロジスティック回帰の登録・編集API", () => {
  it("新規登録と編集で独立したルールタイプを保存する", async () => {
    const logistic = createGianellaRule(1);
    await caller.rules.create(logistic as any);
    expect(db.createRule).toHaveBeenCalledWith(expect.objectContaining({
      ruleType: "logistic_regression",
      ruleDefinition: expect.objectContaining({ type: "logistic_regression", outputMode: "probability" }),
    }));
    vi.mocked(db.getRuleById).mockResolvedValue(rule as any);
    await caller.rules.update({ id: 1, editToken: getEditToken(rule as any), data: {
      ruleType: "logistic_regression", ruleDefinition: logistic.ruleDefinition,
    } });
    expect(db.updateRule).toHaveBeenCalledWith(1, expect.objectContaining({
      ruleType: "logistic_regression", ruleDefinition: expect.objectContaining({ type: "logistic_regression" }),
    }), getEditToken(rule as any));
  });

  it("タイプの不一致や閾値なしの二値判定を登録しない", async () => {
    const logistic = createGianellaRule(1);
    await expect(caller.rules.create({ ...logistic, ruleType: "nomogram" } as any)).rejects.toThrow("一致しません");
    await expect(caller.rules.create({ ...logistic, ruleDefinition: { ...logistic.ruleDefinition, outputMode: "binary" } } as any)).rejects.toThrow("判定閾値");
    expect(db.createRule).not.toHaveBeenCalled();
  });
});

describe("Coxノモグラムの参考登録・編集API", () => {
  const baseline = JSON.parse(fs.readFileSync(new URL("../scripts/local-literature.baseline.json", import.meta.url), "utf8"));
  const existing = {
    ...reviewLiterature(baseline.find((row: { id: number }) => row.id === 30005)),
    evidenceLevel: "Cohort Study", isActive: true, consensusEligible: false,
  };
  const timeline = {
    version: 1, anchor: "stroke_onset", kind: "future",
    evaluation: { value: null, unit: "day", precision: "unknown", originalText: "入棟時", basis: "原著参照" },
    target: { value: null, unit: "day", precision: "unknown", originalText: "原文の予測対象時点を参照", basis: "原著参照" },
  };

  it("参考用の定義で登録・編集でき、切片等を補わず集計は無効にする", async () => {
    const definition = { ...existing.ruleDefinition, timeline };
    await caller.rules.create({ ...existing, ruleDefinition: definition, consensusEligible: true } as any);
    const created = vi.mocked(db.createRule).mock.calls[0][0];
    expect(created).toMatchObject({ ruleType: "nomogram", consensusEligible: false, ruleDefinition: definition });
    expect((created.ruleDefinition as any).intercept).toBeUndefined();
    vi.mocked(db.getRuleById).mockResolvedValue(existing);
    await caller.rules.update({ id: existing.id, editToken: getEditToken(existing), data: {
      ruleDefinition: definition, consensusEligible: true,
    } });
    expect(db.updateRule).toHaveBeenCalledWith(existing.id, expect.objectContaining({
      ruleDefinition: definition, consensusEligible: false,
    }), getEditToken(existing));
  });

  it("参考登録でも不正な数値を保存しない", async () => {
    await expect(caller.rules.create({ ...existing, ruleDefinition: {
      ...existing.ruleDefinition, timeline,
      variables: [{ field: "admission_age", coefficient: "不明" }],
    } } as any)).rejects.toThrow("係数");
    expect(db.createRule).not.toHaveBeenCalled();
  });
});

describe("GUIで選んだ複数の適用対象の保存", () => {
  it("病型の選択肢配列を変換せず保持し、照合でもORとして扱う", async () => {
    const timeline = { version: 1, anchor: "stroke_onset", kind: "future",
      evaluation: { value: null, unit: "day", precision: "unknown", originalText: "入院時", basis: "合成テスト" },
      target: { value: null, unit: "day", precision: "unknown", originalText: "退院時", basis: "合成テスト" } };
    const applyConditions = [{ field: "stroke_type", operator: "in", value: ["脳梗塞", "脳出血"], label: "病型" }];
    await caller.rules.create({ ...rule, sourceUrl: "", applyConditions, ruleDefinition: { ...rule.ruleDefinition, timeline } } as any);
    const saved = vi.mocked(db.createRule).mock.calls[0][0];
    expect(saved.applyConditions).toEqual(applyConditions);
    vi.mocked(db.getAllRules).mockResolvedValue([{ ...saved, id: 2 }] as any);
    expect((await caller.rules.list({}))[0].applyConditionFields[0].label).toBe("病型：脳梗塞 または 脳出血のいずれか");
    for (const stroke_type of ["脳梗塞", "脳出血"])
      expect(runEngine([{ ...saved, id: 2 } as any], { stroke_type, bbs_score: 20 }).results[0].isPositive).toBe(true);
    expect(runEngine([{ ...saved, id: 2 } as any], { stroke_type: "その他", bbs_score: 20 }).results[0].status).toBe("outside");
  });
});

describe("照合APIと履歴保存", () => {
  it("新規文献には時間軸を要求し、原著表記と概算をそのまま保存する", async () => {
    await expect(
      caller.rules.create({ ...rule, sourceUrl: "" } as any)
    ).rejects.toThrow("時間軸");
    const point = {
      value: 1,
      unit: "month",
      precision: "approximate",
      originalText: "入院時",
      basis: "表1の発症後日数から約1ヶ月と記録",
    };
    const timeline = {
      version: 1,
      anchor: "stroke_onset",
      kind: "future",
      evaluation: point,
      target: { ...point, value: 3, originalText: "退院時" },
    };
    await caller.rules.create({
      ...rule,
      sourceUrl: "",
      ruleDefinition: { ...rule.ruleDefinition, timeline },
    } as any);
    expect(db.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleDefinition: expect.objectContaining({
          timeline,
        }),
      })
    );
    const [created] = vi.mocked(db.createRule).mock.calls[0];
    expect((created.ruleDefinition as any).evidenceReview).toBeUndefined();
    expect(
      runEngine([{ ...rule, ...created } as any], { bbs_score: 20 }).results[0]
    ).toMatchObject({ status: "evaluated", isPositive: true });
  });
  it("再照合待ちの文献を修正すると、保存した閾値で直ちに計算できる", async () => {
    const current = {
      ...rule,
      ruleDefinition: {
        ...rule.ruleDefinition,
        evidenceReview: { status: "pending" },
      },
    };
    vi.mocked(db.getRuleById).mockResolvedValue(current as any);
    await caller.rules.update({
      id: 1,
      editToken: getEditToken(current as any),
      data: { ruleDefinition: { ...current.ruleDefinition, threshold: 25 } },
    });
    expect(db.updateRule).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        ruleDefinition: expect.objectContaining({
          threshold: 25,
        }),
      }),
      getEditToken(current as any)
    );
    const [, saved] = vi.mocked(db.updateRule).mock.calls[0];
    expect((saved.ruleDefinition as any).evidenceReview).toBeUndefined();
    expect(
      runEngine([{ ...current, ...saved } as any], { bbs_score: 20 }).results[0]
    ).toMatchObject({ status: "evaluated", isPositive: false });
  });
  it("履歴と個別結果を一括保存し、保存IDを返す", async () => {
    const response = await caller.predict.run({
      outcomeId: 1,
      patientInputs: { bbs_score: 20 },
    });
    expect(response.predictionId).toBe(123);
    expect(db.getAllRules).toHaveBeenCalledWith(1, true);
    expect(db.savePredictionWithResults).toHaveBeenCalledWith(
      expect.objectContaining({
        outcomeId: 1,
        patientInputs: { bbs_score: 20 },
        consensusScore: 1,
      }),
      [
        expect.objectContaining({
          ruleId: 1,
          isPositive: true,
          isApplicable: true,
        }),
      ]
    );
  });
  it("保存なしプレビューはDBを変更しない", async () => {
    await caller.predict.preview({
      outcomeId: 1,
      patientInputs: { bbs_score: 20 },
    });
    expect(db.savePredictionWithResults).not.toHaveBeenCalled();
  });
  it("保存失敗を成功レスポンスにしない", async () => {
    vi.mocked(db.savePredictionWithResults).mockRejectedValue(
      new Error("保存失敗")
    );
    await expect(
      caller.predict.run({ outcomeId: 1, patientInputs: { bbs_score: 20 } })
    ).rejects.toThrow("保存失敗");
  });
  it("入力範囲外・存在しないアウトカム・ルール未登録では保存しない", async () => {
    await expect(
      caller.predict.run({ outcomeId: 1, patientInputs: { bbs_score: 999 } })
    ).rejects.toThrow();
    vi.mocked(db.getOutcomeById).mockResolvedValue(undefined);
    await expect(
      caller.predict.run({ outcomeId: 999, patientInputs: {} })
    ).rejects.toThrow("アウトカム");
    vi.mocked(db.getOutcomeById).mockResolvedValue({ id: 1 } as any);
    vi.mocked(db.getAllRules).mockResolvedValue([]);
    await expect(
      caller.predict.run({ outcomeId: 1, patientInputs: {} })
    ).rejects.toThrow("ルール");
    expect(db.savePredictionWithResults).not.toHaveBeenCalled();
  });
  it("欠測結果は集計対象なしとして保存する", async () => {
    const result = await caller.predict.run({
      outcomeId: 1,
      patientInputs: {},
    });
    expect(result.consensus.label).toBe("unavailable");
    expect(db.savePredictionWithResults).toHaveBeenCalledWith(
      expect.objectContaining({
        consensusScore: null,
        consensusLabel: "unavailable",
      }),
      [expect.objectContaining({ isPositive: null, isApplicable: false })]
    );
  });
  it("壊れたルール定義の登録を拒否する", async () => {
    await expect(
      caller.rules.create({
        ...rule,
        ruleDefinition: { type: "regression" },
      } as any)
    ).rejects.toThrow();
    expect(db.createRule).not.toHaveBeenCalled();
  });
  it("CSVに現在の入力項目名のFIM値を出力する", async () => {
    vi.mocked(db.getAllPredictions).mockResolvedValue([
      {
        id: 1,
        outcomeId: 1,
        resultCount: 1,
        createdAt: new Date(),
        patientInputs: { fim_motor_total: 41, fim_cognitive_total: 24 },
        consensusScore: null,
      },
    ] as any);
    const { csv } = await caller.history.exportCsv({ limit: 100 });
    expect(csv).toContain(",41,24,");
  });
  it("履歴検索とページ指定をDBへ渡し、不正な取得件数を拒否する", async () => {
    await caller.history.list({
      limit: 21,
      offset: 20,
      outcomeId: 3,
      search: "  123  ",
    });
    expect(db.getAllPredictions).toHaveBeenCalledWith(21, {
      offset: 20,
      outcomeId: 3,
      search: "123",
    });
    await expect(caller.history.list({ limit: -1 })).rejects.toThrow();
    await expect(caller.history.list({ limit: 1001 })).rejects.toThrow();
    await expect(
      caller.history.list({ limit: 20, offset: -1 })
    ).rejects.toThrow();
  });
  it("存在しない履歴の取得・実績更新を成功扱いにしない", async () => {
    vi.mocked(db.getPredictionById).mockResolvedValue(undefined);
    await expect(caller.history.get({ id: 999 })).rejects.toThrow(
      "照合履歴が見つかりません"
    );
    await expect(
      caller.history.updateOutcome({
        id: 999,
        actualOutcome: {
          value: 1,
          label: "自立",
          scale: "binary",
          measuredOn: "2026-10-08",
          daysSinceOnset: 90,
        },
      })
    ).rejects.toThrow("照合履歴が見つかりません");
    expect(db.updatePredictionOutcome).not.toHaveBeenCalled();
  });
  it("CSVでメモを数式として実行させず、改行・引用符を保持する", async () => {
    vi.mocked(db.getAllPredictions).mockResolvedValue([
      {
        id: 1,
        outcomeId: 1,
        resultCount: 0,
        createdAt: new Date(),
        patientInputs: {},
        notes: '=SUM(1,2)\r"メモ"',
        consensusScore: 1,
      },
    ] as any);
    const { csv } = await caller.history.exportCsv({
      outcomeId: 1,
      search: "メモ",
    });
    expect(db.getAllPredictions).toHaveBeenCalledWith(1000, {
      outcomeId: 1,
      search: "メモ",
    });
    expect(csv).toContain('"\'=SUM(1,2)\r""メモ"""');
    expect(csv).toContain("詳細未保存");
    expect(csv).not.toContain("1.000");
  });
});

describe("改訂後のAPI境界", () => {
  it("一覧は同じ項目の上下限条件を両方返す", async () => {
    vi.mocked(db.getAllRules).mockResolvedValue([
      {
        ...rule,
        applyConditions: [
          { field: "bbs_score", operator: ">=", value: 10, label: "BBS" },
          { field: "bbs_score", operator: "<", value: 30, label: "BBS" },
        ],
      },
    ] as any);
    const [r] = await caller.rules.list({});
    expect(r.applyConditionFields.map(c => c.label)).toEqual([
      "BBS >= 10",
      "BBS < 30",
    ]);
  });
  it("古い編集画面から更新できず、最新トークンはロック時の照合にも渡す", async () => {
    const oldToken = getEditToken(rule as any);
    const newer = { ...rule, name: "変更後" };
    vi.mocked(db.getRuleById).mockResolvedValue(newer as any);
    await expect(
      caller.rules.update({
        id: 1,
        editToken: oldToken,
        data: { name: "古い画面" },
      })
    ).rejects.toThrow("編集中");
    expect(db.updateRule).not.toHaveBeenCalled();
    const editToken = getEditToken(newer as any);
    await caller.rules.update({ id: 1, editToken, data: { name: "変更後2" } });
    expect(db.updateRule).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: "変更後2" }),
      editToken
    );
  });
  it.each(["exact", "mean", "median"] as const)("%sの保存・プレビューで集計が一致し履歴に時期確認を残す", async precision => {
    const p = {
      value: 30,
      unit: "day",
      precision,
      originalText: "合成",
      basis: "テスト専用",
    };
    const timeContext = {
      kind: "future",
      evaluation: { value: 30, unit: "day", precision: "exact" },
      target: { value: 90, unit: "day", precision: "exact" },
    } as const;
    vi.mocked(db.getAllRules).mockResolvedValue([
      {
        ...rule,
        ruleDefinition: {
          ...rule.ruleDefinition,
          timeline: {
            version: 1,
            anchor: "stroke_onset",
            kind: "future",
            evaluation: p,
            target: { ...p, value: 90 },
          },
        },
      },
    ] as any);
    const input = {
      outcomeId: 1,
      patientInputs: { bbs_score: 20 },
      timeContext,
    };
    const preview = await caller.predict.preview(input);
    const saved = await caller.predict.run(input);
    expect(saved.consensus).toEqual(preview.consensus);
    expect(saved.consensus.positiveCount).toBe(1);
    expect(db.savePredictionWithResults).toHaveBeenCalledWith(
      expect.objectContaining({ timeContext }),
      [
        expect.objectContaining({
          resultSnapshot: expect.objectContaining({
            consensusEligible: true,
            timeMatch: { status: precision === "exact" ? "matched" : "review", reason: expect.any(String) },
          }),
        }),
      ]
    );
  });
  it("範囲外・測定時点なしの実績を保存しない", async () => {
    vi.mocked(db.getPredictionById).mockResolvedValue({ id: 1 } as any);
    const input = {
      value: 6,
      label: "FAC6",
      scale: "fac",
      measuredOn: "2026-10-08",
      daysSinceOnset: 90,
    };
    await expect(
      caller.history.updateOutcome({ id: 1, actualOutcome: input as any })
    ).rejects.toThrow();
    expect(db.updatePredictionOutcome).not.toHaveBeenCalled();
  });
  it("詳細CSVは保存時の数値・時間軸と旧履歴欠損を含める", async () => {
    vi.mocked(db.getAllPredictions).mockResolvedValue([
      {
        id: 1,
        patientInputs: { admission_fim_motor_total: 41 },
        outcomeSnapshot: { name: "保存時FIM" },
      },
      { id: 2, patientInputs: {} },
    ] as any);
    vi.mocked(db.getPredictionResultsByPredictionId)
      .mockResolvedValueOnce([
        {
          ruleId: 3,
          ruleName: "=合成",
          isApplicable: true,
          isPositive: null,
          ruleSnapshot: { source: "保存時出典" },
          resultSnapshot: {
            numericValue: 72.52,
            timeMatch: { reason: "参考" },
            consensusEligible: false,
          },
        },
      ] as any)
      .mockResolvedValueOnce([]);
    const { csv } = await caller.history.exportDetailedCsv({ caseId: "CASE" });
    expect(db.getAllPredictions).toHaveBeenCalledWith(1000, { caseId: "CASE" });
    for (const value of [
      "72.52",
      "保存時出典",
      "参考",
      "詳細未保存",
      "admission_fim_motor_total",
      "'=合成",
    ])
      expect(csv).toContain(value);
  });
});
