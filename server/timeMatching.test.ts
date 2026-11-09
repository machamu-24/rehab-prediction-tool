import { describe, expect, it } from "vitest";
import {
  matchTimeline,
  literatureTimelineSchema,
  timeQuerySchema,
  formatTimeQuery,
  requiresTimingReview,
  timeMatchLabel,
  type LiteratureTimeline,
  type TimeQuery,
} from "../shared/literatureTimeline";
import { runEngine } from "./ruleEngine";
import { getResultStatus } from "../shared/resultStatus";
import { actualOutcomeSchema } from "../shared/actualOutcome";
import { getEditToken } from "./ruleReview";
import type { LiteratureRule } from "../drizzle/schema";
const point = {
  value: 30,
  unit: "day",
  precision: "exact",
  originalText: "30日",
  basis: "合成テスト専用",
} as const;
const timeline: LiteratureTimeline = {
  version: 1,
  anchor: "stroke_onset",
  kind: "future",
  evaluation: point,
  target: { ...point, value: 90 },
};
const query: TimeQuery = {
  kind: "future",
  evaluation: { value: 30, unit: "day", precision: "exact" },
  target: { value: 90, unit: "day", precision: "exact" },
};
const rule = {
  id: 1,
  name: "合成文献",
  ruleType: "cutoff",
  isActive: true,
  consensusEligible: true,
  applyConditions: [],
  ruleDefinition: {
    type: "cutoff",
    field: "bbs_score",
    fieldLabel: "BBS",
    threshold: 20,
    operator: ">=",
    positiveMessage: "支持",
    negativeMessage: "困難",
    evidenceReview: { status: "checked" },
    timeline,
  },
} as unknown as LiteratureRule;

describe("照合する時間軸と集計", () => {
  it("同じ評価・対象時点は時点一致として集計する", () => {
    const output = runEngine([rule], { bbs_score: 30 }, query);
    expect(output.consensus).toMatchObject({
      score: 1,
      positiveCount: 1,
      totalEligible: 1,
    });
    expect(output.results[0].timeMatch?.status).toBe("matched");
    expect(getResultStatus(output.results[0])).toBe("supports");
  });
  it.each(["evaluation", "target"] as const)(
    "%sの日数差に制限を設けず計算・集計する",
    key => {
      const output = runEngine(
        [rule],
        { bbs_score: 30 },
        {
          ...query,
          [key]: { ...query[key]!, value: key === "evaluation" ? 31 : 300 },
        }
      );
      expect(output.results[0]).toMatchObject({
        status: "evaluated",
        numericValue: null,
        prediction: "支持",
        isPositive: true,
        consensusEligible: true,
        timeMatch: { status: "review" },
      });
      expect(output.consensus).toMatchObject({ score: 1, totalEligible: 1 });
    }
  );
  it.each(["approximate", "mean", "median"] as const)(
    "%sは固定日や適用範囲に変換せず、時期確認付きで集計する",
    precision => {
      const r = {
        ...rule,
        ruleDefinition: {
          ...rule.ruleDefinition,
          timeline: {
            ...timeline,
            evaluation: { ...point, precision, value: 10 },
          },
        },
      };
      const output = runEngine([r], { bbs_score: 30 }, query);
      expect(output.results[0]).toMatchObject({
        isApplicable: true,
        isPositive: true,
        consensusEligible: true,
        timeMatch: { status: "review" },
      });
      expect(getResultStatus(output.results[0])).toBe("supports");
      expect(output.results[0].timeline?.evaluation).toMatchObject({ precision, value: 10 });
    }
  );
  it("90日と3ヶ月を厳密に一致させない", () =>
    expect(
      matchTimeline(timeline, {
        ...query,
        target: { value: 3, unit: "month", precision: "exact" },
      }).status
    ).toBe("review"));
  it("旧月単位どうしでも日数換算後は概算として扱う", () =>
    expect(
      matchTimeline(
        {
          ...timeline,
          evaluation: { ...point, value: 1, unit: "month" },
          target: { ...point, value: 3, unit: "month" },
        },
        {
          kind: "future",
          evaluation: { value: 1, unit: "month", precision: "exact" },
          target: { value: 3, unit: "month", precision: "exact" },
        }
      ).status
    ).toBe("review"));
  const rangedTimeline: LiteratureTimeline = {
    ...timeline,
    evaluation: {
      ...point,
      matchRangeDays: { min: 23, max: 37, basis: "試行：前後7日" },
    },
    target: {
      ...point,
      value: 90,
      precision: "approximate",
      matchRangeDays: { min: 76, max: 104, basis: "試行：前後14日" },
    },
  };
  const rangedRule = {
    ...rule,
    ruleDefinition: { ...rule.ruleDefinition, timeline: rangedTimeline },
  };
  it.each([
    [23, 76],
    [37, 104],
    [30, 90],
  ])(
    "両方の照合範囲内を境界日も含めて集計する (%s, %s)",
    (evaluation, target) => {
      const output = runEngine(
        [rangedRule],
        { bbs_score: 30 },
        {
          kind: "future",
          evaluation: { value: evaluation, unit: "day", precision: "exact" },
          target: { value: target, unit: "day", precision: "exact" },
        }
      );
      expect(output.results[0].timeMatch?.status).toBe("within_range");
      expect(getResultStatus(output.results[0])).toBe("supports");
      expect(output.consensus).toMatchObject({
        positiveCount: 1,
        totalEligible: 1,
        score: 1,
      });
    }
  );
  it.each([
    [22, 90],
    [38, 90],
    [30, 75],
    [30, 105],
  ])("設定範囲外でも時期確認付きで集計する (%s, %s)", (evaluation, target) => {
    const output = runEngine(
      [rangedRule],
      { bbs_score: 30 },
      {
        kind: "future",
        evaluation: { value: evaluation, unit: "day", precision: "exact" },
        target: { value: target, unit: "day", precision: "exact" },
      }
    );
    expect(output.results[0]).toMatchObject({
      status: "evaluated",
      prediction: "支持",
      consensusEligible: true,
      timeMatch: { status: "review" },
    });
    expect(output.consensus.totalEligible).toBe(1);
  });
  it.each(["approximate", "mean", "median"] as const)(
    "%sでも管理者が範囲を設定した場合は集計する",
    precision => {
      expect(
        matchTimeline(
          {
            ...rangedTimeline,
            evaluation: { ...rangedTimeline.evaluation, precision },
          },
          query
        ).status
      ).toBe("within_range");
    }
  );
  it("概算入力も設定範囲内なら集計する", () => {
    expect(
      matchTimeline(rangedTimeline, {
        ...query,
        evaluation: { ...query.evaluation!, precision: "approximate" },
      }).status
    ).toBe("within_range");
    expect(
      matchTimeline(timeline, {
        ...query,
        evaluation: { ...query.evaluation!, precision: "approximate" },
      }).status
    ).toBe("review");
  });
  it("範囲があっても両時点が明確に一致すれば時点一致とする", () => {
    expect(
      matchTimeline(
        {
          ...rangedTimeline,
          target: { ...rangedTimeline.target!, precision: "exact" },
        },
        query
      ).status
    ).toBe("matched");
  });
  it("片方だけ範囲設定し、もう片方は明確な時点一致でも集計する", () => {
    expect(
      matchTimeline({ ...rangedTimeline, evaluation: point }, query).status
    ).toBe("within_range");
  });
  it("範囲未設定のもう片方が概算の場合も時期確認付きで集計する", () => {
    expect(
      matchTimeline(
        { ...rangedTimeline, evaluation: { ...point, precision: "mean" } },
        query
      ).status
    ).toBe("review");
  });
  it("未指定・時点不明は範囲設定で補わない", () => {
    expect(
      matchTimeline(rangedTimeline, { ...query, target: undefined }).status
    ).toBe("review");
    expect(
      matchTimeline(
        {
          ...rangedTimeline,
          evaluation: { ...point, value: null, precision: "unknown" },
        },
        query
      ).status
    ).toBe("review");
  });
  it.each(["approximate", "mean", "median"] as const)("範囲内の%sも評価時期の確認を表示する", precision => {
    const match = matchTimeline({
      ...rangedTimeline,
      evaluation: { ...rangedTimeline.evaluation, precision },
    }, query);
    expect(match).toMatchObject({ status: "within_range", requiresReview: true });
    expect(requiresTimingReview(match)).toBe(true);
    expect(timeMatchLabel(match)).toBe("評価時期の確認");
  });
  it.each([true, false])("日数差が大きい平均値でも%sの判定を集計する", supports => {
    const output = runEngine([{
      ...rule,
      ruleDefinition: { ...rule.ruleDefinition, timeline: {
        ...timeline,
        evaluation: { ...point, value: 1000, precision: "mean" },
        target: { ...point, value: 2000, precision: "median" },
      } },
    }], { bbs_score: supports ? 30 : 10 }, query);
    expect(output.consensus).toMatchObject({
      positiveCount: supports ? 1 : 0,
      negativeCount: supports ? 0 : 1,
      totalEligible: 1,
    });
    expect(output.results[0].timeMatch?.status).toBe("review");
  });
  it.each([null, {
    ...timeline,
    evaluation: { ...point, value: null, precision: "unknown" as const, originalText: "入院時" },
    target: { ...point, value: null, precision: "unknown" as const, originalText: "退院時" },
  }])("文献の時間軸が未登録・不明でも値を推測せず集計する", registered => {
    const output = runEngine([{
      ...rule,
      ruleDefinition: { ...rule.ruleDefinition, timeline: registered ?? undefined },
    }], { bbs_score: 30 }, query);
    expect(output.consensus.totalEligible).toBe(1);
    expect(output.results[0].timeline).toEqual(registered);
    expect(output.results[0].timeMatch?.status).toBe("review");
  });
  it("時間軸の制限を外しても集計除外・適用条件・入力不足を尊重する", () => {
    const reviewed = {
      ...rule,
      ruleDefinition: { ...rule.ruleDefinition, timeline: {
        ...timeline, evaluation: { ...point, precision: "mean" as const },
      } },
    };
    const manuallyExcluded = runEngine([{ ...reviewed, consensusEligible: false }], { bbs_score: 30 }, query);
    expect(manuallyExcluded.consensus.totalEligible).toBe(0);
    expect(getResultStatus(manuallyExcluded.results[0])).toBe("reference");
    const missing = runEngine([reviewed], {}, query);
    expect(missing.results[0].status).toBe("missing_input");
    expect(missing.consensus.totalEligible).toBe(0);
    const outside = runEngine([{
      ...reviewed,
      applyConditions: [{ field: "days_onset_to_admission", operator: "<", value: 14, label: "発症14日未満" }],
    }], { bbs_score: 30, days_onset_to_admission: 20 }, query);
    expect(outside.results[0].status).toBe("outside");
    expect(outside.consensus.totalEligible).toBe(0);
  });
  it("不正な時間軸設定は未登録と区別し集計しない", () => {
    expect(matchTimeline({ ...timeline, anchor: "invalid" } as unknown as LiteratureTimeline, query).status).toBe("unknown");
    const output = runEngine([rule], { bbs_score: 30 }, {
      ...query, target: { ...query.target!, value: -1 },
    });
    expect(output.consensus.totalEligible).toBe(0);
    expect(output.results[0].timeMatch?.status).toBe("unknown");
  });
  it("非支持の判定も設定範囲内なら同じく集計する", () => {
    const output = runEngine([rangedRule], { bbs_score: 10 }, query);
    expect(getResultStatus(output.results[0])).toBe("against");
    expect(output.consensus).toMatchObject({
      negativeCount: 1,
      totalEligible: 1,
      score: 0,
    });
  });
  it("範囲設定でも文献の集計除外・対象条件・同時点の区別を維持する", () => {
    const excluded = runEngine(
      [{ ...rangedRule, consensusEligible: false }],
      { bbs_score: 30 },
      query
    );
    expect(excluded.consensus.totalEligible).toBe(0);
    const conditional = {
      ...rangedRule,
      applyConditions: [
        {
          field: "days_onset_to_admission",
          operator: "<",
          value: 14,
          label: "発症14日未満",
        },
      ],
    } as LiteratureRule;
    const outside = runEngine(
      [conditional],
      { bbs_score: 30, days_onset_to_admission: 20 },
      query
    );
    expect(outside.results[0].status).toBe("outside");
    expect(outside.consensus.totalEligible).toBe(0);
    expect(
      matchTimeline(
        { ...rangedTimeline, kind: "concurrent", target: undefined },
        query
      ).status
    ).toBe("mismatch");
  });
  it("同時点の判別は評価時点の範囲だけで照合する", () => {
    expect(
      matchTimeline(
        { ...rangedTimeline, kind: "concurrent", target: undefined },
        { kind: "concurrent", evaluation: { ...query.evaluation!, value: 23 } }
      ).status
    ).toBe("within_range");
  });
  it("旧月単位の下書きは概算の日数にし、範囲が設定されていれば照合できる", () => {
    const oldQuery = timeQuerySchema.parse({
      kind: "future",
      evaluation: query.evaluation,
      target: { value: 3, unit: "month", precision: "exact" },
    });
    expect(oldQuery.target).toEqual({
      value: 90,
      unit: "day",
      precision: "approximate",
    });
    expect(formatTimeQuery(oldQuery)).toContain("約90日");
    expect(matchTimeline(rangedTimeline, oldQuery).status).toBe("within_range");
  });
  it("照合時間軸が未指定でも時期確認付きで集計し、日数を補完しない", () => {
    const output = runEngine([rule], { bbs_score: 30 });
    expect(output.results[0].timeMatch?.status).toBe("review");
    expect(output.consensus.score).toBe(1);
  });
  it("同時点の判別を将来予測と混ぜない", () =>
    expect(
      matchTimeline(
        { ...timeline, kind: "concurrent", target: undefined },
        query
      ).status
    ).toBe("mismatch"));
  it("文献の集計設定がfalseなら一致しても参考扱い", () => {
    const output = runEngine(
      [{ ...rule, consensusEligible: false }],
      { bbs_score: 30 },
      query
    );
    expect(getResultStatus(output.results[0])).toBe("reference");
    expect(output.consensus.positiveCount).toBe(0);
  });
  it.each([undefined, "pending", "checked"])(
    "旧確認状態%sにかかわらず計算する",
    status => {
      const r = {
        ...rule,
        ruleDefinition: {
          ...rule.ruleDefinition,
          evidenceReview: status ? { status } : undefined,
        },
      };
      const output = runEngine([r], { bbs_score: 30 }, query);
      expect(output.results[0]).toMatchObject({
        status: "evaluated",
        isPositive: true,
      });
      expect(output.consensus.positiveCount).toBe(1);
    }
  );
  it("明示的に計算対象外とされた文献は理由を保持して除外する", () => {
    const r = {
      ...rule,
      ruleDefinition: {
        ...rule.ruleDefinition,
        evidenceReview: { status: "blocked", reason: "未対応モデル" },
      },
    };
    const output = runEngine([r], { bbs_score: 30 }, query);
    expect(output.results[0]).toMatchObject({
      status: "unsupported",
      isApplicable: false,
      isPositive: null,
      unavailableReason: "未対応モデル",
    });
    expect(output.consensus.positiveCount).toBe(0);
  });
  it("日・月の逆転と等しい時点を登録できない", () => {
    for (const unit of ["day", "month"] as const)
      for (const value of [1, 3]) {
        expect(
          literatureTimelineSchema.safeParse({
            ...timeline,
            evaluation: { ...point, unit, value: 3 },
            target: { ...point, unit, value },
          }).success
        ).toBe(false);
        expect(
          timeQuerySchema.safeParse({
            kind: "future",
            evaluation: { value: 3, unit, precision: "exact" },
            target: { value, unit, precision: "exact" },
          }).success
        ).toBe(false);
      }
  });
});
describe("実績の検証と編集世代", () => {
  const actual = {
    value: 3,
    label: "FAC3",
    scale: "fac",
    measuredOn: "2026-10-08",
    daysSinceOnset: 90,
  };
  it("尺度別範囲・測定日・発症日数を検証する", () => {
    expect(actualOutcomeSchema.safeParse(actual).success).toBe(true);
    for (const edit of [
      { value: 6 },
      { value: 1.5 },
      { value: "3" },
      { measuredOn: "2026-02-30" },
      { daysSinceOnset: -1 },
      { daysSinceOnset: undefined },
      { scale: "fim_motor", value: 12 },
      { scale: "fim_cognitive", value: 36 },
      { scale: "fim_total", value: 127 },
      { scale: "binary", value: 2 },
      { scale: "other", scaleName: "" },
    ])
      expect(
        actualOutcomeSchema.safeParse({ ...actual, ...edit }).success,
        JSON.stringify(edit)
      ).toBe(false);
  });
  it("自由尺度には名称が必要", () =>
    expect(
      actualOutcomeSchema.safeParse({
        ...actual,
        scale: "other",
        scaleName: "歩行距離（m）",
        value: "120",
      }).success
    ).toBe(true));
  it("名前・有効状態・時間軸変更も編集トークンを更新する", () => {
    const token = getEditToken(rule);
    for (const edit of [
      { name: "別名" },
      { isActive: false },
      {
        ruleDefinition: {
          ...rule.ruleDefinition,
          timeline: { ...timeline, target: { ...point, value: 120 } },
        },
      },
    ])
      expect(getEditToken({ ...rule, ...edit })).not.toBe(token);
    expect(getEditToken({ ...rule })).toBe(token);
  });
});
