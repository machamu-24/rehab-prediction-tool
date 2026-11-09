import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { correctIshinoClassification } from "../scripts/lib/ishino-classification.mjs";
import { reviewLiterature } from "../scripts/lib/literature-review.mjs";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { getResultStatus } from "../shared/resultStatus";
import { runEngine } from "./ruleEngine";
import type { LiteratureRule } from "../drizzle/schema";

const baseline = JSON.parse(fs.readFileSync(new URL("../scripts/local-literature.baseline.json", import.meta.url), "utf8"));
const point = { unit: "day", precision: "median", originalText: "原著の時点", basis: "テスト専用の設定" };
const timeline = {
  version: 1, anchor: "stroke_onset", kind: "future",
  evaluation: { ...point, value: 60, matchRangeDays: { min: 50, max: 70, basis: "テスト用範囲" } },
  target: { ...point, value: 138, matchRangeDays: { min: 110, max: 160, basis: "テスト用範囲" } },
};
const query = {
  kind: "future" as const,
  evaluation: { value: 60, unit: "day" as const, precision: "exact" as const },
  target: { value: 138, unit: "day" as const, precision: "exact" as const },
};
const model = (id: number): LiteratureRule => {
  const rule = reviewLiterature(baseline.find((rule: LiteratureRule) => rule.id === id));
  rule.ruleDefinition.timeline = structuredClone(timeline);
  rule.applyConditions = [
    { field: "admission_fim_motor_total", operator: id === 30006 ? "<" : ">=", value: 50, label: "入棟時の重症度" },
    ...(id === 30007 ? [{ field: "admission_fim_motor_total", operator: "<", value: 70, label: "中等度群の上限" }] : []),
    { field: "admission_fim_walk", operator: "<=", value: 5, label: "入棟時非自立" },
  ];
  return rule;
};

describe("石野ら2023の群別人数に基づく集計", () => {
  it.each([
    [30006, { delta_bbs: 21, admission_age: 67 }, true, "86.5%"],
    [30006, { delta_bbs: 21, admission_age: 68 }, false, "42.3%"],
    [30006, { delta_bbs: 20, delta_fim_motor: 24 }, true, "71.4%"],
    [30006, { delta_bbs: 20, delta_fim_motor: 23, admission_fim_motor_total: 43 }, false, "8.1%"],
    [30006, { delta_bbs: 20, delta_fim_motor: 23, admission_fim_motor_total: 44 }, false, "33.3%"],
    [30007, { delta_fim_motor: 13 }, true, "95.4%"],
    [30007, { delta_fim_motor: 12, admission_cba_score: 18, delta_fim_cognitive: 1 }, false, "14.3%"],
    [30007, { delta_fim_motor: 12, admission_cba_score: 18, delta_fim_cognitive: 2 }, null, "50%"],
    [30007, { delta_fim_motor: 12, admission_cba_score: 19, admission_age: 67 }, true, "91.6%"],
    [30007, { delta_fim_motor: 12, admission_cba_score: 19, admission_age: 68 }, true, "54.7%"],
  ] as const)("ID %s %j の終端と件数・割合を照合する", (id, inputs, supports, rate) => {
    const output = runEngine([model(id)], { admission_fim_motor_total: id === 30006 ? 40 : 55, admission_fim_walk: 5, ...inputs }, query);
    const result = output.results[0];
    expect(result).toMatchObject({ status: "evaluated", isPositive: supports, probability: null, timeMatch: { status: "within_range" } });
    expect(result.prediction).toContain(rate);
    expect(output.consensus).toMatchObject({ positiveCount: supports === true ? 1 : 0, negativeCount: supports === false ? 1 : 0, totalEligible: supports === null ? 0 : 1 });
    expect(getResultStatus(result)).toBe(supports === null ? "estimate" : supports ? "supports" : "against");
    if (supports === null) {
      expect(result.prediction).toContain("判定保留");
      expect(result.details.join()).toContain("同数");
    }
  });
  it("範囲外の日数は時期確認にし、重症度対象外・未入力・集計除外を維持する", () => {
    const rule = model(30006);
    const inputs = { admission_fim_motor_total: 40, admission_fim_walk: 5, delta_bbs: 21, admission_age: 60 };
    const differentTime = runEngine([rule], inputs, { ...query, target: { ...query.target, value: 161 } });
    expect(differentTime.results[0]).toMatchObject({ status: "evaluated", timeMatch: { status: "review" } });
    expect(differentTime.consensus.totalEligible).toBe(1);
    expect(runEngine([rule], { ...inputs, admission_fim_motor_total: 50 }, query).results[0].status).toBe("outside");
    expect(runEngine([rule], { ...inputs, admission_fim_walk: 6 }, query).results[0].status).toBe("outside");
    expect(runEngine([rule], { ...inputs, admission_age: undefined }, query).results[0].status).toBe("missing_input");
    expect(runEngine([{ ...rule, consensusEligible: false }], inputs, query).consensus.totalEligible).toBe(0);
    expect(runEngine([model(30007)], { admission_fim_motor_total: 70, admission_fim_walk: 5, delta_fim_motor: 13 }, query).results[0].status).toBe("outside");
  });
  it.each([30006, 30007])("ID %s の既存時間軸・注記を保持し、繰り返し適用できる", id => {
    const before = model(id).ruleDefinition;
    const snapshot = structuredClone(before);
    const after = correctIshinoClassification(before, id);
    expect(before).toEqual(snapshot);
    expect(after.timeline).toEqual(timeline);
    expect(correctIshinoClassification(after, id)).toEqual(after);
    expect(validateRuleDefinition(after)).toBeNull();
  });
  it("未知の決定木・分岐・割合は修正しない", () => {
    const changed: any = structuredClone(model(30006).ruleDefinition);
    changed.nodes[0].threshold = 19;
    expect(() => correctIshinoClassification(changed, 30006)).toThrow("既知の決定木と異なります");
    const other: any = structuredClone(model(30007).ruleDefinition);
    other.nodes.find((node: any) => node.id === "c").probability = 0.6;
    expect(() => correctIshinoClassification(other, 30007)).toThrow("既知の決定木と異なります");
    expect(() => correctIshinoClassification(model(30006).ruleDefinition, 30007)).toThrow("既知の決定木と異なります");
  });
  it("分類モードでは各終端の判定を明示し、二値モードに保留を混入させない", () => {
    const missing: any = structuredClone(model(30006).ruleDefinition);
    delete missing.nodes.find((node: any) => node.id === "a").isPositive;
    expect(validateRuleDefinition(missing)).not.toBeNull();
    const binary: any = structuredClone(model(30007).ruleDefinition);
    binary.outputMode = "binary";
    expect(validateRuleDefinition(binary)).not.toBeNull();
  });
});
