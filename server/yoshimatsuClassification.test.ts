import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { correctYoshimatsuClassification } from "../scripts/lib/yoshimatsu-classification.mjs";
import { reviewLiterature } from "../scripts/lib/literature-review.mjs";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { getResultStatus } from "../shared/resultStatus";
import { runEngine } from "./ruleEngine";
import type { LiteratureRule } from "../drizzle/schema";

const baseline = JSON.parse(fs.readFileSync(new URL("../scripts/local-literature.baseline.json", import.meta.url), "utf8"));
const original = baseline.find((rule: LiteratureRule) => rule.id === 30003);
const range = { min: 19, max: 45, basis: "管理者の照合範囲" };
const timeline = {
  version: 1,
  anchor: "stroke_onset",
  kind: "future",
  evaluation: { value: 32, unit: "day", precision: "mean", originalText: "表1", basis: "原著の平均値", matchRangeDays: range },
  target: { value: 122, unit: "day", precision: "mean", originalText: "入院3ヶ月後", basis: "発症起点へ換算", matchRangeDays: { ...range, min: 109, max: 135 } },
};
const rule = reviewLiterature(original) as LiteratureRule;
rule.ruleDefinition = { ...rule.ruleDefinition, timeline } as any;
const query = {
  kind: "future" as const,
  evaluation: { value: 32, unit: "day" as const, precision: "exact" as const },
  target: { value: 122, unit: "day" as const, precision: "exact" as const },
};

describe("吉松ら2018の原著分類と支持集計", () => {
  it.each([
    ["グループ1", { admission_bbs_score: 13 }, true, "68.3%"],
    ["グループ2", { admission_bbs_score: 12, admission_sit_up_independent: true }, true, "30.6%"],
    ["グループ3", { admission_bbs_score: 12, admission_sit_up_independent: false, admission_cognitive_impairment: false }, true, "22.2%"],
    ["グループ4", { admission_bbs_score: 12, admission_sit_up_independent: false, admission_cognitive_impairment: true }, false, "5.5%"],
  ] as const)("%sは原著の分類に従い、群別割合も残す", (_group, inputs, supports, rate) => {
    const output = runEngine([rule], { admission_fim_walk: 5, ...inputs }, query);
    const result = output.results[0];
    expect(result).toMatchObject({ status: "evaluated", isPositive: supports, probability: null, consensusEligible: true, timeMatch: { status: "within_range" } });
    expect(result.prediction).toContain(rate);
    expect(result.prediction).toContain("原著の分類");
    expect(getResultStatus(result)).toBe(supports ? "supports" : "against");
    expect(output.consensus).toMatchObject({ totalEligible: 1, positiveCount: supports ? 1 : 0, negativeCount: supports ? 0 : 1 });
  });
  it("入力不足は支持票にせず、日数差は時期確認付きで集計する", () => {
    expect(runEngine([rule], { admission_fim_walk: 5 }, query).consensus.totalEligible).toBe(0);
    const outside = runEngine([rule], { admission_fim_walk: 5, admission_bbs_score: 20 }, { ...query, target: { ...query.target, value: 136 } });
    expect(outside.results[0]).toMatchObject({ status: "evaluated", timeMatch: { status: "review" } });
    expect(outside.consensus.totalEligible).toBe(1);
  });
  it("元データを変更せず、管理者の時間軸と注記を保持し、繰り返し適用できる", () => {
    const before = { ...original.ruleDefinition, outputMode: "descriptive", timeline, notes: "既存の注記" };
    const snapshot = structuredClone(before);
    const after = correctYoshimatsuClassification(before);
    expect(before).toEqual(snapshot);
    expect(after.timeline).toEqual(timeline);
    expect(after.notes).toContain("既存の注記");
    expect(after.notes).toContain("本文p.147");
    expect(correctYoshimatsuClassification(after)).toEqual(after);
    expect(validateRuleDefinition(after)).toBeNull();
  });
  it("管理者が変更した別の決定木や割合を上書きしない", () => {
    for (const mutate of [
      (def: any) => { def.nodes[0].threshold = 20; },
      (def: any) => { def.nodes[0].trueNodeId = "leaf_group2"; },
      (def: any) => { def.nodes.find((node: any) => node.id === "leaf_group3").probability = 0.9; },
    ]) {
      const changed = structuredClone(original.ruleDefinition);
      mutate(changed);
      expect(() => correctYoshimatsuClassification(changed)).toThrow("既知の決定木と異なります");
    }
  });
});
