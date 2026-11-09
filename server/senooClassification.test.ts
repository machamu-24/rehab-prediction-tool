import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { correctSenooClassification } from "../scripts/lib/senoo-classification.mjs";
import { reviewLiterature } from "../scripts/lib/literature-review.mjs";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { getResultStatus } from "../shared/resultStatus";
import { runEngine } from "./ruleEngine";
import type { LiteratureRule } from "../drizzle/schema";

const baseline = JSON.parse(fs.readFileSync(new URL("../scripts/local-literature.baseline.json", import.meta.url), "utf8"));
const point = { unit: "day", precision: "median", originalText: "原著の時点", basis: "表示確認用" };
const timeline = {
  version: 1, anchor: "stroke_onset", kind: "future",
  evaluation: { ...point, value: 19, matchRangeDays: { min: 19, max: 34, basis: "管理者の設定" } },
  target: { ...point, value: 99, matchRangeDays: { min: 80, max: 150, basis: "管理者の設定" } },
};
const rule = reviewLiterature(baseline.find((row: LiteratureRule) => row.id === 60006)) as LiteratureRule;
rule.ruleDefinition = { ...rule.ruleDefinition, timeline } as any;
rule.applyConditions.push({ field: "admission_fim_walk", operator: "<=", value: 5, label: "入棟時非自立" });
const query = {
  kind: "future" as const,
  evaluation: { value: 25, unit: "day" as const, precision: "exact" as const },
  target: { value: 100, unit: "day" as const, precision: "exact" as const },
};

describe("妹尾・井上2022の各終端と支持集計", () => {
  it.each([
    [{ stroke_type: "脳出血", admission_fim_motor_total: 48 }, true, "100%"],
    [{ stroke_type: "脳出血", admission_fim_motor_total: 47 }, false, "8.7%"],
    [{ stroke_type: "脳梗塞", admission_care_level: 3 }, false, "11.8%"],
    [{ stroke_type: "脳梗塞", admission_care_level: 2, admission_fim_cognitive_total: 20 }, true, "97.4%"],
    [{ stroke_type: "脳梗塞", admission_care_level: 2, admission_fim_cognitive_total: 19 }, false, "42.9%"],
    [{ stroke_type: "脳梗塞", admission_care_level: 0, admission_fim_cognitive_total: 20 }, true, "97.4%"],
  ] as const)("%j の分類と群別割合を保持して集計する", (input, supports, rate) => {
    const output = runEngine([rule], { admission_fim_walk: 5, ...input }, query);
    const result = output.results[0];
    expect(result).toMatchObject({ status: "evaluated", isPositive: supports, probability: null, timeMatch: { status: "within_range" } });
    expect(result.prediction).toContain(rate);
    expect(getResultStatus(result)).toBe(supports ? "supports" : "against");
    expect(output.consensus).toMatchObject({ totalEligible: 1, positiveCount: supports ? 1 : 0, negativeCount: supports ? 0 : 1 });
  });
  it("対象外病型・FIM歩行・未入力・集計除外を維持し、日数差では除外しない", () => {
    const input = { stroke_type: "脳出血", admission_fim_motor_total: 48, admission_fim_walk: 5 };
    for (const stroke_type of ["その他", "くも膜下出血"])
      expect(runEngine([rule], { ...input, stroke_type }, query).results[0].status).toBe("outside");
    expect(runEngine([rule], { ...input, admission_fim_walk: 6 }, query).results[0].status).toBe("outside");
    const differentTime = runEngine([rule], input, { ...query, target: { ...query.target, value: 151 } });
    expect(differentTime.results[0]).toMatchObject({ status: "evaluated", timeMatch: { status: "review" } });
    expect(differentTime.consensus.totalEligible).toBe(1);
    expect(runEngine([rule], { stroke_type: "脳出血", admission_fim_walk: 5 }, query).results[0].status).toBe("missing_input");
    expect(runEngine([{ ...rule, consensusEligible: false }], input, query).consensus.totalEligible).toBe(0);
  });
  it("照合範囲・注記・元データを保持し、繰り返し適用できる", () => {
    const before = structuredClone(rule.ruleDefinition);
    const after = correctSenooClassification(before);
    expect(after.timeline).toEqual(timeline);
    expect(after.notes).toContain("要支援・未申請");
    expect(before).toEqual(rule.ruleDefinition);
    expect(correctSenooClassification(after)).toEqual(after);
    expect(validateRuleDefinition(after)).toBeNull();
  });
  it("未知の閾値・要介護分岐・割合を上書きしない", () => {
    for (const mutate of [
      (def: any) => { def.nodes.find((node: any) => node.id === "motor").threshold = 48; },
      (def: any) => { def.nodes.find((node: any) => node.id === "care").trueNodeId = "c"; },
      (def: any) => { def.nodes.find((node: any) => node.id === "e").probability = 0.8; },
    ]) {
      const changed = structuredClone(rule.ruleDefinition);
      mutate(changed);
      expect(() => correctSenooClassification(changed)).toThrow("既知の決定木と異なります");
    }
  });
});
