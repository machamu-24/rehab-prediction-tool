import { describe, expect, it } from "vitest";
import { runEngine } from "./ruleEngine";
import type { PatientInputs } from "../drizzle/schema";

// ---- テスト用ルールデータ ----

const cutoffRule = {
  id: 1,
  outcomeId: 1,
  name: "BBSカットオフ",
  ruleType: "cutoff" as const,
  source: "Test Source",
  sourceUrl: null,
  evidenceLevel: "Cohort Study",
  applyConditions: [],
  ruleDefinition: {
    type: "cutoff",
    field: "bbs_score",
    fieldLabel: "BBS",
    operator: ">=",
    threshold: 14,
    unit: "点",
    positiveMessage: "歩行自立の可能性が高い",
    negativeMessage: "歩行介助が必要な可能性",
  },
  accuracy: 0.85,
  sensitivity: 0.73,
  specificity: 0.89,
  auc: 0.81,
  consensusEligible: true,
  isActive: true,
  sortOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const decisionTreeRule = {
  id: 2,
  outcomeId: 1,
  name: "EPOSモデル",
  ruleType: "decision_tree" as const,
  source: "Veerbeek et al. (2011)",
  sourceUrl: null,
  evidenceLevel: "Systematic Review",
  applyConditions: [{ field: "days_since_onset", operator: "<=", value: 3 }],
  ruleDefinition: {
    type: "decision_tree",
    nodes: [
      { id: "root", field: "sitting_balance_30s", fieldLabel: "座位保持30秒", operator: "boolean", trueNodeId: "check_mi", falseNodeId: "leaf_neg" },
      { id: "check_mi", field: "motricity_index_lower", fieldLabel: "MI下肢", operator: ">=", threshold: 25, trueNodeId: "leaf_pos", falseNodeId: "leaf_neg" },
      { id: "leaf_pos", isLeaf: true, isPositive: true, message: "歩行自立の可能性が高い" },
      { id: "leaf_neg", isLeaf: true, isPositive: false, message: "歩行自立は不確実" },
    ],
  },
  accuracy: 0.92,
  sensitivity: 0.96,
  specificity: 0.75,
  auc: null,
  consensusEligible: true,
  isActive: true,
  sortOrder: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const scoringRule = {
  id: 3,
  outcomeId: 1,
  name: "NIHSSスコアリング",
  ruleType: "scoring_system" as const,
  source: "Test Source",
  sourceUrl: null,
  evidenceLevel: "Cohort Study",
  applyConditions: [],
  ruleDefinition: {
    type: "scoring_system",
    items: [
      { field: "nihss", fieldLabel: "NIHSS", unit: "点", bands: [
        { operator: "<=", value: 5, score: 3, label: "軽症" },
        { operator: "<=", value: 15, score: 2, label: "中等症" },
        { operator: ">", value: 15, score: 0, label: "重症" },
      ]},
    ],
    threshold: 2,
    maxScore: 3,
    positiveMessage: "良好な転帰が期待できる",
    negativeMessage: "転帰不良のリスクあり",
  },
  accuracy: null,
  sensitivity: null,
  specificity: null,
  auc: null,
  consensusEligible: true,
  isActive: true,
  sortOrder: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const compositeRule = {
  id: 4,
  outcomeId: 1,
  name: "NIHSS性別補正",
  ruleType: "composite_rule" as const,
  source: "Test Source",
  sourceUrl: null,
  evidenceLevel: "Cohort Study",
  applyConditions: [],
  ruleDefinition: {
    type: "composite_rule",
    root: {
      logic: "OR",
      children: [
        { logic: "AND", children: [
          { logic: "CONDITION", field: "sex", operator: "==", value: "男性" },
          { logic: "CONDITION", field: "nihss", operator: "<=", value: 7.5 },
        ]},
        { logic: "AND", children: [
          { logic: "CONDITION", field: "sex", operator: "==", value: "女性" },
          { logic: "CONDITION", field: "nihss", operator: "<=", value: 5.5 },
        ]},
      ],
    },
    positiveMessage: "カットオフ以下",
    negativeMessage: "カットオフ超過",
  },
  accuracy: null,
  sensitivity: null,
  specificity: null,
  auc: null,
  consensusEligible: true,
  isActive: true,
  sortOrder: 4,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const kimuraUsnCognitiveRule = {
  id: 60008,
  outcomeId: 1,
  name: "半側空間無視と認知障害の複合が歩行自立回復に与える影響",
  ruleType: "composite_rule" as const,
  source: "Kimura Y, Yamada M et al. J Rehabil Med",
  sourceUrl: "https://medicaljournalssweden.se/jrm/article/view/9437",
  evidenceLevel: "Cohort Study",
  applyConditions: [],
  ruleDefinition: {
    type: "composite_rule",
    root: {
      logic: "NOT",
      child: {
        logic: "AND",
        children: [
          { logic: "CONDITION", field: "spatial_neglect", fieldLabel: "半側空間無視", operator: "==", value: true },
          { logic: "CONDITION", field: "mmse_score", fieldLabel: "MMSE", operator: "<", value: 24 },
        ],
      },
    },
    positiveMessage: "USN+認知障害の合併なし → 歩行自立の可能性あり",
    negativeMessage: "USN+認知障害の合併 → 歩行自立困難リスク高",
  },
  accuracy: null,
  sensitivity: null,
  specificity: null,
  auc: null,
  consensusEligible: true,
  isActive: true,
  sortOrder: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ============================================================
// テストスイート
// ============================================================

describe("ruleEngine - カットオフルール", () => {
  it("BBS >= 14 のとき陽性を返す", () => {
    const inputs: PatientInputs = { bbs_score: 20 };
    const { results } = runEngine([cutoffRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(true);
    expect(results[0].literatureSummary.predictors).toContain("BBS");
    expect(results[0].matchExplanation.join("\n")).toContain("BBS");
  });

  it("BBS < 14 のとき陰性を返す", () => {
    const inputs: PatientInputs = { bbs_score: 10 };
    const { results } = runEngine([cutoffRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(false);
  });

  it("BBS が未入力のとき適用不可を返す", () => {
    const inputs: PatientInputs = {};
    const { results } = runEngine([cutoffRule], inputs);
    expect(results[0].isApplicable).toBe(false);
    expect(results[0].unavailableReason).toBeTruthy();
  });
});

describe("ruleEngine - 決定木ルール（時期依存）", () => {
  it("発症3日以内・座位保持あり・MI下肢>=25 のとき陽性を返す", () => {
    const inputs: PatientInputs = {
      days_since_onset: 2,
      sitting_balance_30s: true,
      motricity_index_lower: 30,
    };
    const { results } = runEngine([decisionTreeRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(true);
  });

  it("発症3日以内・座位保持なし のとき陰性を返す", () => {
    const inputs: PatientInputs = {
      days_since_onset: 2,
      sitting_balance_30s: false,
      motricity_index_lower: 0, // 座位保持なしの場合、MI下肢は評価されないが入力自体は必要
    };
    const { results } = runEngine([decisionTreeRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(false);
  });

  it("発症10日後は時期条件を満たさず適用不可を返す", () => {
    const inputs: PatientInputs = {
      days_since_onset: 10,
      sitting_balance_30s: true,
      motricity_index_lower: 50,
    };
    const { results } = runEngine([decisionTreeRule], inputs);
    expect(results[0].isApplicable).toBe(false);
  });
});

describe("ruleEngine - スコアリングシステム", () => {
  it("NIHSS <= 5 のとき陽性（スコア3）を返す", () => {
    const inputs: PatientInputs = { nihss: 3 };
    const { results } = runEngine([scoringRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(true);
  });

  it("NIHSS > 15 のとき陰性（スコア0）を返す", () => {
    const inputs: PatientInputs = { nihss: 20 };
    const { results } = runEngine([scoringRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(false);
  });
});

describe("ruleEngine - 複合条件ルール", () => {
  it("男性・NIHSS=5 のとき陽性を返す（7.5以下）", () => {
    const inputs: PatientInputs = { sex: "男性", nihss: 5 };
    const { results } = runEngine([compositeRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(true);
  });

  it("男性・NIHSS=10 のとき陰性を返す（7.5超過）", () => {
    const inputs: PatientInputs = { sex: "男性", nihss: 10 };
    const { results } = runEngine([compositeRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(false);
  });

  it("女性・NIHSS=5 のとき陽性を返す（5 <= 5.5）", () => {
    const inputs: PatientInputs = { sex: "女性", nihss: 5 };
    const { results } = runEngine([compositeRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(true);
  });

  it("女性・NIHSS=6 のとき陰性を返す（6 > 5.5）", () => {
    const inputs: PatientInputs = { sex: "女性", nihss: 6 };
    const { results } = runEngine([compositeRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(false);
  });

  it("女性・NIHSS=4 のとき陽性を返す（5.5以下）", () => {
    const inputs: PatientInputs = { sex: "女性", nihss: 4 };
    const { results } = runEngine([compositeRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(true);
  });

  it("Kimuraルール: USN単独では歩行自立側として扱う", () => {
    const inputs: PatientInputs = { spatial_neglect: true, mmse_score: 28 };
    const { results, consensus } = runEngine([kimuraUsnCognitiveRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(true);
    expect(results[0].prediction).toContain("歩行自立");
    expect(consensus.label).toBe("positive");
  });

  it("Kimuraルール: USNとMMSE<24の合併では歩行自立困難側として扱う", () => {
    const inputs: PatientInputs = { spatial_neglect: true, mmse_score: 23 };
    const { results, consensus } = runEngine([kimuraUsnCognitiveRule], inputs);
    expect(results[0].isApplicable).toBe(true);
    expect(results[0].isPositive).toBe(false);
    expect(results[0].prediction).toContain("歩行自立困難");
    expect(consensus.label).toBe("negative");
  });
});

describe("ruleEngine - コンセンサス分析", () => {
  it("全ルール陽性のとき consensus.label が positive になる", () => {
    const inputs: PatientInputs = {
      bbs_score: 20,
      nihss: 3,
      sex: "男性",
    };
    const { consensus } = runEngine([cutoffRule, scoringRule, compositeRule], inputs);
    expect(consensus.label).toBe("positive");
    expect(consensus.score).toBeGreaterThan(0.5);
  });

  it("全ルール陰性のとき consensus.label が negative になる", () => {
    const inputs: PatientInputs = {
      bbs_score: 5,
      nihss: 20,
      sex: "男性",
    };
    const { consensus } = runEngine([cutoffRule, scoringRule, compositeRule], inputs);
    expect(consensus.label).toBe("negative");
    expect(consensus.score).toBeLessThan(0.5);
  });

  it("ルールが空のとき consensus.score が 0 になる", () => {
    const inputs: PatientInputs = { bbs_score: 20 };
    const { consensus } = runEngine([], inputs);
    expect(consensus.score).toBe(0);
    expect(consensus.totalEligible).toBe(0);
  });
});

describe("ruleEngine - 追加評価提案", () => {
  it("BBS未入力のとき bbs_score の追加評価を提案する", () => {
    const inputs: PatientInputs = {};
    const { suggestions } = runEngine([cutoffRule], inputs);
    const missingInputSuggestions = suggestions.filter((s) => s.reason === "missing_input");
    expect(missingInputSuggestions.length).toBeGreaterThan(0);
    expect(missingInputSuggestions[0].missingFields).toContain("bbs_score");
  });
});
