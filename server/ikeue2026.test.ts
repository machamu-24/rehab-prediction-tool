import { describe, expect, it } from "vitest";
import { createIkeueRules } from "../scripts/lib/ikeue-2026.mjs";
import type { LiteratureRule } from "../drizzle/schema";
import { evaluateRule, extractRequiredFieldsFromDef, runEngine } from "./ruleEngine";
import { assessmentSchema, getInputsForAssessmentPhase, isAssessmentFieldAvailable } from "../shared/assessment";
import { patientInputsSchema } from "../shared/patientValidation";
import { getVisiblePatientSections, PATIENT_FIELDS } from "../client/src/lib/patientFields";
import { createKoyamaRule } from "../scripts/lib/koyama-2005.mjs";

const rules = createIkeueRules(2).map((rule: unknown, i: number) => ({ ...rule as object, id: 70001 + i })) as LiteratureRule[];
const inputs = {
  admission_ward_type: "回復期リハビリテーション病棟", first_stroke: true, hemiparesis_present: true, stroke_type: "脳梗塞",
  admission_age: 75, days_onset_to_admission: 21, admission_bbs_score: 5,
  admission_fim_motor_total: 22, admission_fim_cognitive_total: 14, admission_fim_total: 36,
  week3_fim_motor_total: 35,
};

describe("Ikeueら2026 低FIM脳卒中の退院時運動FIM", () => {
  it("Tables 2–3の非標準化係数で2モデルを計算し、確率や二値判定を返さない", () => {
    // Hand-calculated fictional case: 64.36−51−5.88+1.8+18.04+15.68=43.00;
    // 52.56−39.75−4.62+7.98+32.2=48.37.
    const output = runEngine(rules, inputs);
    expect(output.results[0].numericValue).toBeCloseTo(43);
    expect(output.results[1].numericValue).toBeCloseTo(48.37);
    for (const result of output.results) expect(result).toMatchObject({ status: "evaluated", outputMode: "continuous", outputUnit: "点", isPositive: null, probability: null, consensusEligible: false });
    expect(output.consensus.totalEligible).toBe(0);
  });

  it("入棟時・3週後・現在のFIMと入棟までの日数を混同しない", () => {
    const current = { ...inputs, age: 90, days_since_onset: 42, bbs_score: 56, fim_motor_total: 91, fim_cognitive_total: 35 };
    expect(evaluateRule(rules[0], current).numericValue).toBeCloseTo(43);
    expect(evaluateRule(rules[1], current).numericValue).toBeCloseTo(48.37);
    const { week3_fim_motor_total, ...noWeek3 } = current;
    expect(evaluateRule(rules[1], noWeek3)).toMatchObject({ status: "missing_input", missingFields: ["week3_fim_motor_total"] });
    const admission = getInputsForAssessmentPhase(inputs, "admission");
    expect(evaluateRule(rules[0], admission).status).toBe("evaluated");
    expect(evaluateRule(rules[1], admission).status).toBe("missing_input");
    expect(evaluateRule(rules[1], getInputsForAssessmentPhase(inputs, "followup")).status).toBe("evaluated");
  });

  it("入棟時総FIM55点を含め、56点以上・再発・片麻痺なし・対象外病棟と病型を除く", () => {
    for (const rule of rules) {
      expect(evaluateRule(rule, { ...inputs, admission_fim_motor_total: 41, admission_fim_total: 55 }).status).toBe("evaluated");
      for (const patch of [
        { admission_fim_motor_total: 42, admission_fim_total: 56 }, { first_stroke: false }, { hemiparesis_present: false },
        { admission_ward_type: "急性期病棟" }, { stroke_type: "くも膜下出血" }, { stroke_type: "その他" },
      ]) expect(evaluateRule(rule, { ...inputs, ...patch }).status).toBe("outside");
      const { admission_fim_total, ...withoutTotal } = inputs;
      expect(evaluateRule(rule, withoutTotal)).toMatchObject({ status: "missing_input", missingFields: ["admission_fim_total"] });
    }
  });

  it("新設点数の範囲と合計の不一致を検出し、必要な入力を画面に用意する", () => {
    expect(patientInputsSchema.safeParse(inputs).success).toBe(true);
    expect(patientInputsSchema.safeParse({ ...inputs, admission_fim_total: 35 }).success).toBe(false);
    for (const value of [12, 92, 13.5, "35"]) expect(patientInputsSchema.safeParse({ week3_fim_motor_total: value }).success).toBe(false);
    for (const value of [17, 127, 18.5, "36"]) expect(patientInputsSchema.safeParse({ admission_fim_total: value }).success).toBe(false);
    const keys = PATIENT_FIELDS.flatMap(s => s.fields.map(f => f.key));
    for (const key of Object.keys(inputs)) expect(keys).toContain(key);
  });

  it("集団平均を固定日や適用範囲に変えず、モデル別の参照時点を保持する", () => {
    const query = { kind: "future" as const, evaluation: { value: 42, unit: "day" as const, precision: "exact" as const }, target: { value: 100, unit: "day" as const, precision: "exact" as const } };
    const output = runEngine(rules, inputs, query);
    for (const result of output.results) expect(result.timeMatch?.status).toBe("review");
    expect(output.consensus.totalEligible).toBe(0);
    expect(evaluateRule(rules[0], inputs).timeline?.evaluation.value).toBe(21.3);
    expect(evaluateRule(rules[1], inputs).timeline?.evaluation.value).toBe(42.3);
    expect(evaluateRule(rules[1], inputs).timeline?.target?.value).toBe(100.2);
  });

  it("FIM運動では3週後の入力欄を初期表示し、共通の片麻痺欄だけでKoyama欄を表示しない", () => {
    const requiredFields = new Set(rules.flatMap(rule => [
      ...extractRequiredFieldsFromDef(rule.ruleDefinition),
      ...rule.applyConditions.map(condition => condition.field),
    ]));
    const sections = getVisiblePatientSections(requiredFields, false);
    const keys = sections.flatMap(section => section.fields.map(field => field.key));
    expect(keys).toContain("week3_fim_motor_total");
    expect(keys).toContain("hemiparesis_present");
    expect(sections.some(section => section.section.startsWith("Koyama"))).toBe(false);
    expect(isAssessmentFieldAvailable("week3_fim_motor_total", "admission")).toBe(false);
    expect(isAssessmentFieldAvailable("week3_fim_motor_total", "week3")).toBe(true);
  });

  it("入棟3週間後は3週後FIMで照合し、1ヶ月後の変化量を使わない", () => {
    expect(assessmentSchema.parse({ assessmentPhase: "week3" }).assessmentPhase).toBe("week3");
    const entered = { ...inputs, delta_bbs: 21, delta_fim_motor: 12, delta_fim_cognitive: 3 };
    const week3 = getInputsForAssessmentPhase(entered, "week3");
    expect(week3.week3_fim_motor_total).toBe(35);
    for (const key of ["delta_bbs", "delta_fim_motor", "delta_fim_cognitive"])
      expect(week3).not.toHaveProperty(key);
    expect(evaluateRule(rules[1], week3).numericValue).toBeCloseTo(48.37);
    expect(getInputsForAssessmentPhase(entered, "admission")).not.toHaveProperty("week3_fim_motor_total");
    expect(getInputsForAssessmentPhase(entered, "month1").delta_fim_motor).toBe(12);
  });

  it("FIM総得点ではKoyama専用欄と共通条件を引き続き表示する", () => {
    const koyama = createKoyamaRule(4) as unknown as LiteratureRule;
    const requiredFields = new Set([
      ...extractRequiredFieldsFromDef(koyama.ruleDefinition),
      ...koyama.applyConditions.map(condition => condition.field),
    ]);
    const sections = getVisiblePatientSections(requiredFields, false);
    expect(sections.find(section => section.section.startsWith("Koyama"))?.fields.map(field => field.key))
      .toEqual(expect.arrayContaining(["koyama_day_a", "koyama_fim_total_a", "koyama_day_b", "koyama_fim_total_b", "koyama_target_day"]));
    expect(sections.flatMap(section => section.fields.map(field => field.key))).toContain("hemiparesis_present");
  });
});
