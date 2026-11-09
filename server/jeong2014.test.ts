import { describe, expect, it } from "vitest";
import { createJeongRule } from "../scripts/lib/jeong-2014.mjs";
import type { LiteratureRule } from "../drizzle/schema";
import { PATIENT_FIELDS } from "../client/src/lib/patientFields";
import { patientInputsSchema } from "../shared/patientValidation";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { runEngine } from "./ruleEngine";

const rule = { ...createJeongRule(4), id: 1 } as unknown as LiteratureRule;
const input = {
  admission_ward_type: "回復期リハビリテーション病棟",
  admission_age: 70, admission_complication: false, days_onset_to_admission: 34,
  admission_gcs: 15, prestroke_mrs: 1,
  admission_fim_motor_total: 41, admission_fim_cognitive_total: 24,
};
const evaluate = (values: Record<string, unknown>) => runEngine([rule], values).results[0];

describe("Jeongら2014 回復期退院時FIM総得点", () => {
  it("本文p.22の非標準化回帰式を使い、7項目から92.15点を返す", () => {
    expect(validateRuleDefinition(rule.ruleDefinition)).toBeNull();
    const result = evaluate(input);
    expect(result).toMatchObject({ status: "evaluated", isPositive: null, probability: null, prediction: "予測値: 92.15点" });
    expect(result.numericValue).toBeCloseTo(92.15);
    // A false flag and mRS zero are observations, not missing values.
    expect(evaluate({ ...input, prestroke_mrs: 0 }).numericValue).toBeCloseTo(93.83);
    expect(runEngine([rule], input).consensus.totalEligible).toBe(0);
    expect(rule).toMatchObject({ accuracy: null, auc: null, consensusEligible: false });
  });

  it.each([
    ["admission_age", 71, 91.81],
    ["admission_complication", true, 88.27],
    ["days_onset_to_admission", 35, 92.04],
    ["admission_gcs", 14, 89.71],
    ["prestroke_mrs", 2, 90.47],
    ["admission_fim_motor_total", 42, 92.68],
    ["admission_fim_cognitive_total", 25, 93.40],
  ])("%sの符号・係数とダミー変数を本文の式に合わせる", (field, value, expected) => {
    expect(evaluate({ ...input, [field]: value }).numericValue).toBeCloseTo(expected as number);
  });

  it("未確認の合併症や入院時値を現在値・糖尿病・NIHSSで補完しない", () => {
    for (const field of Object.keys(input)) {
      const values: Record<string, unknown> = { ...input, age: 70, fim_motor_total: 41, fim_cognitive_total: 24, diabetes: false, nihss: 0, gcs: 15, mrs: 1 };
      delete values[field];
      expect(evaluate(values)).toMatchObject({ status: "missing_input", numericValue: null, missingFields: [field] });
    }
    for (const ward of ["急性期病棟", "その他"])
      expect(evaluate({ ...input, admission_ward_type: ward }).status).toBe("outside");
  });

  it("FIM総得点の上限で原著の線形推定値を切り詰めない", () => {
    expect(evaluate({ ...input, admission_age: 20, days_onset_to_admission: 0, prestroke_mrs: 0, admission_fim_motor_total: 91, admission_fim_cognitive_total: 35 }).numericValue).toBeCloseTo(154.82);
  });

  it("集団平均の日数を固定日や根拠のない照合範囲に変えない", () => {
    const query = { kind: "future" as const, evaluation: { value: 34, unit: "day" as const, precision: "exact" as const }, target: { value: 131, unit: "day" as const, precision: "exact" as const } };
    expect(runEngine([rule], input, query).results[0]).toMatchObject({ status: "evaluated", timeMatch: { status: "review" } });
    expect(runEngine([rule], input, query).consensus.totalEligible).toBe(0);
    expect(runEngine([rule], input, { kind: "concurrent" }).results[0]).toMatchObject({ status: "outside", numericValue: null });
    const timeline = (rule.ruleDefinition as any).timeline;
    expect(timeline.evaluation.matchRangeDays).toBeUndefined();
    expect(timeline.target.matchRangeDays).toBeUndefined();
  });

  it("新規入力項目を画面で入力でき、GCS・発症前mRS・合併症の型と範囲を検証する", () => {
    const fields = PATIENT_FIELDS.flatMap(section => section.fields);
    for (const key of Object.keys(input)) expect(fields.some(field => field.key === key), key).toBe(true);
    expect(patientInputsSchema.safeParse(input).success).toBe(true);
    for (const [field, values] of [
      ["admission_gcs", [2, 16, 3.5, "15"]],
      ["prestroke_mrs", [-1, 6, 0.5, "0"]],
      ["admission_complication", [0, 1, "false"]],
    ] as const) {
      for (const value of values) expect(patientInputsSchema.safeParse({ ...input, [field]: value }).success).toBe(false);
    }
  });
});
