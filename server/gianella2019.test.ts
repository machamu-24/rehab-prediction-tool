import { describe, expect, it } from "vitest";
import { createGianellaRule } from "../scripts/lib/gianella-2019.mjs";
import type { LiteratureRule, PatientInputs } from "../drizzle/schema";
import { PATIENT_FIELDS } from "../client/src/lib/patientFields";
import { patientInputsSchema } from "../shared/patientValidation";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { getResultDisplayStatus } from "../shared/resultStatus";
import { runEngine } from "./ruleEngine";

const rule = { ...createGianellaRule(1), id: 1 } as unknown as LiteratureRule;
const input: PatientInputs = {
  admission_age: 65, sex: "男性", days_onset_to_admission: 29,
  admission_bbs_score: 3, admission_fugl_meyer_lower: 4, admission_fac: 0,
  first_stroke: true, unilateral_hemispheric_stroke: true,
  other_neuropsychiatric_condition: false, admission_clinically_stable: true,
};
const evaluate = (values: PatientInputs = input) => runEngine([rule], values).results[0];

describe("Gianellaら2019 身体介助なし歩行（FAC≥3）", () => {
  it("Table 3の切片・βと男性=0/女性=1を用いて確率のみを返す", () => {
    expect(validateRuleDefinition(rule.ruleDefinition)).toBeNull();
    expect(rule.ruleType).toBe("logistic_regression");
    const result = evaluate();
    // z = 7.191 - 8.45 - 0.928 + 1.272 + 0.64 = -0.275
    expect(result).toMatchObject({ status: "evaluated", isPositive: null, prediction: "推定確率: 43.2%" });
    expect(result.probability).toBeCloseTo(0.4316800165217519, 12);
    expect(evaluate({ ...input, sex: "女性" }).probability).toBeCloseTo(0.22097389222018782, 12);
    expect(result.details.join(" ")).not.toContain("判定閾値: 50%");
    expect((rule.ruleDefinition as any).probabilityThreshold).toBeUndefined();
  });

  it("高確率でもFAC≥4の歩行自立の支持票にせず、既存アウトカム内で参考表示する", () => {
    const output = runEngine([rule], { ...input, admission_age: 30, admission_bbs_score: 30, admission_fugl_meyer_lower: 30 });
    expect(rule.outcomeId).toBe(1);
    expect(output.results[0].probability).toBeGreaterThan(0.99);
    expect(output.results[0].isPositive).toBeNull();
    expect(getResultDisplayStatus(output.results[0])).toBe("reference");
    expect(output.consensus.totalEligible).toBe(0);
    expect(rule).toMatchObject({ consensusEligible: false, accuracy: null, sensitivity: null, specificity: null, auc: 0.93 });
  });

  it("現在値で入院時の年齢・BBS・FMAや未確認の対象条件を補完しない", () => {
    for (const field of Object.keys(input)) {
      const values = { ...input, age: 65, bbs_score: 3, fugl_meyer_lower: 4 };
      delete values[field];
      expect(evaluate(values)).toMatchObject({ status: "missing_input", probability: null, missingFields: [field] });
    }
  });

  it.each([
    ["admission_age", 17], ["days_onset_to_admission", 91], ["admission_fac", 3],
    ["first_stroke", false], ["unilateral_hemispheric_stroke", false],
    ["other_neuropsychiatric_condition", true], ["admission_clinically_stable", false],
  ])("対象条件外の%s=%sでは確率を計算しない", (field, value) => {
    expect(evaluate({ ...input, [field]: value })).toMatchObject({ status: "outside", probability: null });
  });

  it("組み入れ境界の18歳・90日・FAC2とFMA0点を受け付ける", () => {
    expect(evaluate({ ...input, admission_age: 18, days_onset_to_admission: 90, admission_fac: 2, admission_fugl_meyer_lower: 0 }).status).toBe("evaluated");
  });

  it("退院時発症後日数の中央値119日を固定の予測日にしない", () => {
    const query = { kind: "future" as const, evaluation: { value: 29, unit: "day" as const, precision: "exact" as const }, target: { value: 119, unit: "day" as const, precision: "exact" as const } };
    expect(runEngine([rule], input, query).results[0].timeMatch?.status).toBe("review");
    expect(runEngine([rule], input, query).consensus.totalEligible).toBe(0);
    expect(runEngine([rule], input, { kind: "concurrent" }).results[0]).toMatchObject({ status: "outside", probability: null });
    expect((rule.ruleDefinition as any).timeline.target.matchRangeDays).toBeUndefined();
  });

  it("全項目が画面入力でき、FMA・FAC・有無の不正な型や範囲を拒否する", () => {
    const fields = PATIENT_FIELDS.flatMap(section => section.fields);
    for (const field of Object.keys(input)) expect(fields.some(item => item.key === field), field).toBe(true);
    expect(patientInputsSchema.safeParse(input).success).toBe(true);
    for (const [field, values] of [
      ["admission_fugl_meyer_lower", [-1, 35, 2.5, "4"]],
      ["admission_fac", [-1, 6, 2.5, "0"]],
      ["first_stroke", [0, 1, "false"]],
      ["unilateral_hemispheric_stroke", [0, 1, "false"]],
      ["other_neuropsychiatric_condition", [0, 1, "false"]],
      ["admission_clinically_stable", [0, 1, "false"]],
    ] as const) for (const value of values) expect(patientInputsSchema.safeParse({ ...input, [field]: value }).success).toBe(false);
  });

  it("既存の二値ノモグラムの閾値判定を維持する", () => {
    const binary = { ...rule, ruleType: "nomogram", consensusEligible: true, ruleDefinition: { ...rule.ruleDefinition, type: "nomogram", outputMode: "binary", probabilityThreshold: 0.5 } } as LiteratureRule;
    expect(runEngine([binary], input).results[0].isPositive).toBe(false);
    expect(runEngine([binary], { ...input, admission_bbs_score: 20 }).results[0].isPositive).toBe(true);
  });
});
