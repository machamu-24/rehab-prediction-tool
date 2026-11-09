import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { runEngine } from "./ruleEngine";
import { evaluateFormula } from "./formula";
import { correctFimDefinition } from "../scripts/lib/fim-correction.mjs";
import { patientInputsSchema } from "../shared/patientValidation";
import { validateRuleDefinition } from "../shared/ruleValidation";
import type { LiteratureRule } from "../drizzle/schema";

// Existing literature snapshot is read as a regression fixture; never regenerated here.
const rules = JSON.parse(fs.readFileSync(new URL("../scripts/demo-data.snapshot.json", import.meta.url), "utf8")).rules as LiteratureRule[];
const find = (id: number) => {
  const r = structuredClone(rules.find(rule => rule.id === id)!);
  // Calculation fixture only: this does not change the reviewed production database.
  (r.ruleDefinition as any).evidenceReview = {status:"checked",reason:"計算テスト専用"};
  return r;
};
const sample = { age: 70, days_since_onset: 45, days_onset_to_admission: 17, fim_motor_total: 41, fim_cognitive_total: 24, bbs_score: 23, sit_up_independent: true };

describe("文献モデルと結果の信頼性", () => {
  it("FIMは原論文の計算例72.52点を返し、二値判定には含めない", () => {
    const rule = find(30008);
    rule.ruleDefinition = correctFimDefinition(rule.ruleDefinition);
    const output = runEngine([rule], sample);
    expect(output.results[0]).toMatchObject({ status: "evaluated", isApplicable: true, isPositive: null });
    expect(output.results[0].numericValue).toBeCloseTo(72.52, 8);
    expect(output.results[0].prediction).toBe("予測値: 72.52点");
    expect(output.consensus).toMatchObject({ score: null, label: "unavailable", totalEligible: 0 });
    expect(correctFimDefinition(rule.ruleDefinition)).toEqual(rule.ruleDefinition);
  });
  it("個別編集されたFIM係数を修正スクリプトが上書きしない", () => {
    const rule = find(30008);
    (rule.ruleDefinition as any).coefficients[0].coefficient = 0.7;
    expect(() => correctFimDefinition(rule.ruleDefinition)).toThrow("既知の値と異なります");
  });
  it("Coxモデルをロジスティック回帰として計算しない", () => {
    const output = runEngine([find(30005)], sample);
    expect(output.results[0]).toMatchObject({ status: "reference_only", isApplicable: false, isPositive: null, probability: null, consensusEligible: false });
    expect(output.consensus.negativeCount).toBe(0);
    expect(output.consensus.score).toBeNull();
  });
  it("確定済みの決定木経路に不要な入力を要求しない", () => {
    const output = runEngine([find(30003)], { bbs_score: 20 });
    expect(output.results[0]).toMatchObject({ isApplicable: true, isPositive: true });
    expect(output.suggestions).toEqual([]);
  });
  it("実際に通る分岐の未入力を提案する", () => {
    const output = runEngine([find(30003)], { bbs_score: 2 });
    expect(output.results[0].status).toBe("missing_input");
    expect(output.suggestions[0].missingFields).toEqual(["sit_up_independent"]);
  });
  it("発症日数の未入力を適用条件外として扱わない", () => {
    const output = runEngine([find(60001)], { bbs_score: 40 });
    expect(output.results[0].status).toBe("missing_input");
    expect(output.suggestions[0].reason).toBe("missing_input");
    expect(output.suggestions[0].missingFields).toContain("days_onset_to_admission");
  });
  it("対象外の場合は追加評価を勧めない", () => {
    const output = runEngine([find(60001)], { days_onset_to_admission: 45 });
    expect(output.results[0].status).toBe("outside");
    expect(output.suggestions.every(s => s.reason !== "missing_input")).toBe(true);
  });
  it("壊れたルールだけを除外し、ほかのルールを評価する", () => {
    const broken = find(30008);
    broken.ruleDefinition = { type: "regression", evidenceReview:{status:"checked"} } as any;
    const output = runEngine([broken, find(30001)], { knee_ext_paretic_nm_kg: 0.7 });
    expect(output.results[0].status).toBe("invalid_definition");
    expect(output.results[1].isPositive).toBe(true);
    expect(output.consensus).toMatchObject({ positiveCount: 1, negativeCount: 0, totalEligible: 1 });
  });
  it.each(["cycle", "missing"])("決定木の%sを判定不能にする", mode => {
    const rule = find(30003);
    (rule.ruleDefinition as any).nodes[0].trueNodeId = mode === "cycle" ? "root" : "missing";
    const output = runEngine([rule], { bbs_score: 20 });
    expect(output.results[0]).toMatchObject({ status: "invalid_definition", isPositive: null });
    expect(output.consensus.negativeCount).toBe(0);
  });
  it("範囲外の患者入力を拒否する", () => {
    expect(patientInputsSchema.safeParse({ bbs_score: 999 }).success).toBe(false);
    expect(patientInputsSchema.safeParse({ fim_motor_total: 12 }).success).toBe(false);
    expect(patientInputsSchema.safeParse({ days_since_onset: 10, days_onset_to_admission: 20 }).success).toBe(false);
    expect(patientInputsSchema.safeParse({ spatial_neglect: false, bbs_score: 0 }).success).toBe(true);
  });
  it("入院までの日数が未入力なら現在の発症日数で代用しない", () => {
    const rule = find(30008);
    rule.ruleDefinition = correctFimDefinition(rule.ruleDefinition);
    const { days_onset_to_admission, ...withoutAdmission } = sample;
    expect(runEngine([rule], withoutAdmission).results[0]).toMatchObject({ status: "missing_input", missingFields: ["days_onset_to_admission"] });
  });
  it("修正後の登録定義はCox以外すべて構造検証を通る", () => {
    for (const rule of rules.filter(r => r.id !== 30005)) {
      expect(validateRuleDefinition(rule.id === 30008 ? correctFimDefinition(rule.ruleDefinition) : rule.ruleDefinition), rule.name).toBeNull();
    }
  });
});

describe("四則演算・べき乗の厳密な評価", () => {
  it.each([
    ["2 + 3 * 4", {}, 14], ["-2^2", {}, -4], ["(-2)^2", {}, 4],
    ["2^-2", {}, 0.25], ["2^3^2", {}, 512], ["x^2", { x: -3 }, 9],
    ["1e-3 + .5", {}, 0.501],
  ])("%s", (formula, variables, answer) => expect(evaluateFormula(formula as string, variables as Record<string, number>)).toBeCloseTo(answer as number));
  it.each(["oops + 2", "1 / 0", "0 / 0", "2 + 3)", "2(3)", "1 2", "1.2.3", "", "2 +", "10^9999"])("不正な数式 %s を拒否する", formula => {
    expect(() => evaluateFormula(formula, {})).toThrow();
  });
  it("計算エラーを陰性として集計しない", () => {
    const rule = { ...find(30001), ruleType: "custom_formula", ruleDefinition: { evidenceReview:{status:"checked"}, type: "custom_formula", formula: "1/0", variables: [], threshold: 0, positiveMessage: "陽性", negativeMessage: "陰性" } } as LiteratureRule;
    const output = runEngine([rule], {});
    expect(output.results[0]).toMatchObject({ status: "calculation_error", isPositive: null });
    expect(output.consensus).toMatchObject({ label: "unavailable", negativeCount: 0 });
  });
});
