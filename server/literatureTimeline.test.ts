import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyTimeline, TimelineEditor, TimelineSummary } from "../client/src/components/LiteratureTimeline";
import {
  literatureTimelineSchema,
  timepointSchema,
  referenceDays,
  formatTimepoint,
  timelineWarnings,
  readTimeline,
  parseOptionalTimeline,
} from "../shared/literatureTimeline";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { prepareRuleEdit, getEditToken } from "./ruleReview";
import { runEngine } from "./ruleEngine";
const point = {
  value: 30,
  unit: "day" as const,
  precision: "exact" as const,
  originalText: "発症後30日",
  basis: "Methods: 評価日を発症後30日に固定",
};
const timeline = {
  version: 1 as const,
  anchor: "stroke_onset" as const,
  kind: "future" as const,
  evaluation: point,
  target: { ...point, value: 90, originalText: "発症後90日" },
};
const rule: any = {
  id: 1,
  outcomeId: 1,
  name: "時間軸テスト",
  source: "架空文献",
  ruleType: "cutoff",
  isActive: true,
  consensusEligible: true,
  applyConditions: [],
  ruleDefinition: {
    type: "cutoff",
    field: "bbs_score",
    fieldLabel: "BBS",
    operator: ">=",
    threshold: 20,
    positiveMessage: "支持",
    negativeMessage: "困難",
    timeline,
    evidenceReview: { status: "checked" },
  },
};

describe("発症起点の文献時間軸", () => {
  it("発症日0日と小数の平均日数を保存できる", () => {
    expect(timepointSchema.safeParse({ ...point, value: 0 }).success).toBe(
      true
    );
    expect(
      timepointSchema.safeParse({ ...point, value: 17.5, precision: "mean" })
        .success
    ).toBe(true);
  });
  it.each([-1, NaN, Infinity, 100001])("不正な経過値 %s は拒否する", value => {
    expect(timepointSchema.safeParse({ ...point, value }).success).toBe(false);
  });
  it("時点表記と根拠は任意だが、値の種類を指定した場合の日数は検証する", () => {
    expect(
      timepointSchema.safeParse({
        ...point,
        precision: "approximate",
        basis: " ",
      }).success
    ).toBe(true);
    expect(
      timepointSchema.parse({ value: 30, unit: "day", precision: "mean" })
    ).toMatchObject({ originalText: "", basis: "" });
    expect(timepointSchema.safeParse({ ...point, value: null }).success).toBe(
      false
    );
  });
  it("時間軸が全て未入力でもプレビュー用定義を保存できる", () => {
    const definition = { ...rule.ruleDefinition };
    const draftTimeline = parseOptionalTimeline(emptyTimeline());
    expect(draftTimeline).toBeUndefined();
    if (draftTimeline) definition.timeline = draftTimeline;
    else delete definition.timeline;
    expect(validateRuleDefinition(definition)).toBeNull();
    const edited = prepareRuleEdit(rule, { ruleDefinition: definition });
    expect(readTimeline(edited)).toBeNull();
    expect(runEngine([{ ...rule, ruleDefinition: edited }], { bbs_score: 30 }).results[0].status).toBe("evaluated");
  });
  it("評価時点だけ入力し、原著表記・根拠・予測対象時点を空欄にできる", () => {
    const draft = emptyTimeline();
    draft.evaluation = { ...draft.evaluation, value: 30, precision: "mean" };
    const parsed = parseOptionalTimeline(draft);
    expect(parsed).toEqual(draft);
    const definition = { ...rule.ruleDefinition, timeline: parsed };
    expect(validateRuleDefinition(definition)).toBeNull();
    expect(readTimeline(prepareRuleEdit(rule, { ruleDefinition: definition }))).toEqual(draft);
    expect(() => parseOptionalTimeline({
      ...draft,
      evaluation: { ...draft.evaluation, value: -1 },
    })).toThrow("時間軸");
  });
  it("特定できない時点は理由を保持し数値に変えない", () => {
    const p = {
      ...point,
      precision: "unknown" as const,
      value: null,
      basis: "退院時と記載、発症からの経過は不明",
    };
    expect(timepointSchema.safeParse(p).success).toBe(true);
    expect(referenceDays(p)).toBeNull();
    expect(timepointSchema.safeParse({ ...p, value: 30 }).success).toBe(false);
  });
  it("旧月単位の文献は原著表記を保持して概算の日数に直す", () => {
    const t = {
      ...timeline,
      target: {
        ...point,
        value: 3,
        unit: "month" as const,
        precision: "approximate" as const,
      },
    };
    const converted = literatureTimelineSchema.parse(t).target!;
    expect(converted).toMatchObject({
      unit: "day",
      value: 90,
      precision: "approximate",
      originalText: point.originalText,
    });
    expect(converted.originalMonthValue).toBe(3);
    expect(converted.basis).toBe(point.basis);
    expect(referenceDays(t.target)).toBe(90);
    expect(formatTimepoint(t.target)).toBe("発症後約90日");
    expect(timelineWarnings(t).join()).toContain("30日");
  });
  it("旧月単位の明確な時点を、正確な日数に変えない", () => {
    const converted = readTimeline({
      timeline: {
        ...timeline,
        target: { ...point, value: 3, unit: "month", originalText: "3ヶ月" },
      },
    });
    expect(converted?.target).toMatchObject({
      value: 90,
      unit: "day",
      precision: "approximate",
      originalText: "3ヶ月",
    });
    expect(readTimeline({ timeline: converted })).toEqual(converted);
  });
  it("照合範囲とその理由を保持して保存・再読み込みできる", () => {
    const matchRangeDays = {
      min: 23,
      max: 37,
      basis: "管理者の試行設定：評価30日の前後7日",
    };
    const definition = {
      ...rule.ruleDefinition,
      timeline: { ...timeline, evaluation: { ...point, matchRangeDays } },
    };
    expect(validateRuleDefinition(definition)).toBeNull();
    const edited = prepareRuleEdit(rule, { ruleDefinition: definition });
    expect(readTimeline(edited)?.evaluation.matchRangeDays).toEqual(
      matchRangeDays
    );
    expect(getEditToken({ ...rule, ruleDefinition: edited })).not.toBe(
      getEditToken(rule)
    );
  });
  it.each([
    { min: -1, max: 30, basis: "根拠" },
    { min: 31, max: 30, basis: "根拠" },
    { min: 0, max: 100001, basis: "根拠" },
    { min: NaN, max: 30, basis: "根拠" },
    { min: 0, max: Infinity, basis: "根拠" },
    { min: 0, max: 30, basis: " " },
    { min: 0, basis: "根拠" },
  ])("不正な照合範囲は登録できない %j", matchRangeDays => {
    const definition = {
      ...rule.ruleDefinition,
      timeline: { ...timeline, evaluation: { ...point, matchRangeDays } },
    };
    expect(validateRuleDefinition(definition)).toContain("時間軸");
  });
  it("時点不明のまま照合範囲を設定できない", () => {
    expect(
      timepointSchema.safeParse({
        ...point,
        precision: "unknown",
        value: null,
        matchRangeDays: { min: 0, max: 30, basis: "根拠" },
      }).success
    ).toBe(false);
  });
  it("正確な日数の逆転と同日を将来予測として許可しない", () => {
    for (const value of [20, 30])
      expect(
        literatureTimelineSchema.safeParse({
          ...timeline,
          target: { ...point, value },
        }).success
      ).toBe(false);
  });
  it("同時点の判別は予測時点を重複保持しない", () => {
    const t = {
      version: 1,
      anchor: "stroke_onset",
      kind: "concurrent",
      evaluation: point,
    };
    expect(literatureTimelineSchema.safeParse(t).success).toBe(true);
    expect(
      literatureTimelineSchema.safeParse({ ...t, target: point }).success
    ).toBe(false);
  });
  it("範囲未設定の警告を出さず、時点が逆転した注意は表示する", () => {
    const t = {
      ...timeline,
      target: { ...point, value: 20, precision: "median" as const },
    };
    expect(literatureTimelineSchema.safeParse(t).success).toBe(true);
    expect(timelineWarnings(t)).toHaveLength(1);
    expect(timelineWarnings(t)[0]).toContain("評価時点以前");
  });
  it.each(["mean", "median"] as const)("%sの範囲未設定メッセージを編集画面と文献カードに表示しない", precision => {
    const t = {
      ...timeline,
      evaluation: { ...point, precision },
      target: { ...timeline.target, precision },
    };
    expect(timelineWarnings(t)).toEqual([]);
    const editor = renderToStaticMarkup(createElement(TimelineEditor, { value: t, onChange: () => {} }));
    const summary = renderToStaticMarkup(createElement(TimelineSummary, { definition: { timeline: t } }));
    for (const html of [editor, summary]) {
      expect(html).not.toContain("照合範囲の設定が未完了");
      expect(html).not.toContain("集計に含める場合は");
    }
    expect(summary).toContain("発症後30日");
    expect(timelineWarnings(t, true).join()).toContain("研究集団の平均値・中央値");
  });
  it("既存の時間軸なし文献は未登録として扱う", () => {
    const def = { ...rule.ruleDefinition };
    delete def.timeline;
    expect(validateRuleDefinition(def)).toBeNull();
    expect(readTimeline(def)).toBeNull();
  });
  it("JSON編集経由の不正な時間軸も拒否する", () => {
    expect(
      validateRuleDefinition({
        ...rule.ruleDefinition,
        timeline: { ...timeline, anchor: "admission" },
      })
    ).toContain("時間軸");
  });
  it("時間軸変更後も計算でき、古い編集トークンは失効する", () => {
    const definition = {
      ...rule.ruleDefinition,
      timeline: { ...timeline, target: { ...point, value: 120 } },
    };
    const edited = prepareRuleEdit(rule, { ruleDefinition: definition });
    const updated = { ...rule, ruleDefinition: edited };
    expect((edited as any).evidenceReview).toBeUndefined();
    expect(getEditToken(updated)).not.toBe(getEditToken(rule));
    const result = runEngine([updated], { bbs_score: 30 }).results[0];
    expect(result.status).toBe("evaluated");
    expect(result.timeline?.target?.value).toBe(120);
  });
  it("照合結果に元の時間軸を含めるが概算値で患者を除外しない", () => {
    const output = runEngine([rule], { bbs_score: 30, days_since_onset: 31 });
    expect(output.results[0].timeline).toEqual(timeline);
    expect(output.results[0].isApplicable).toBe(true);
  });
});
