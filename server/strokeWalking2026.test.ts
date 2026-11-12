import { describe, expect, it } from "vitest";
import { createStrokeWalkingRules } from "../scripts/lib/stroke-walking-2026.mjs";
import type { LiteratureRule, PatientInputs } from "../drizzle/schema";
import { evaluateRule, extractRequiredFieldsFromDef, runEngine } from "./ruleEngine";
import { validateRuleDefinition, applyConditionSchema } from "../shared/ruleValidation";
import { patientInputsSchema } from "../shared/patientValidation";
import { getPatientScoreRange } from "../shared/patientScoreRanges";
import { commonPatientInputField } from "../shared/patientInputAliases";
import { PATIENT_FIELDS, getVisiblePatientSections } from "../client/src/lib/patientFields";

const rules = createStrokeWalkingRules(1).map((rule: object, i: number) => ({ ...rule, id: 71000 + i })) as LiteratureRule[];
const [jenkin, kimAll, kimInfarct, kimHemorrhage, sato, fact, tct] = rules;
const inputs = {
  admission_ward_type: "回復期リハビリテーション病棟", stroke_type: "脳梗塞", hemiparesis_present: true,
  admission_age: 70, admission_unilateral_impairment: true, admission_independent_10m: false,
  admission_bbs_score: 33, admission_fact_score: 12, admission_tct_score: 88,
  admission_sias_nonparetic: 4, admission_fim_motor_total: 40,
};
const evaluate = (rule: LiteratureRule, patch: PatientInputs = {}) => evaluateRule(rule, { ...inputs, ...patch });

describe("4文献・7歩行ルールの原著に基づく登録", () => {
  it("全ルールが有効な定義を持ち、Louieら2022を追加しない", () => {
    expect(rules).toHaveLength(7);
    expect(new Set(rules.map(rule => rule.sourceUrl)).size).toBe(4);
    for (const rule of rules) {
      expect(rule.isActive).toBe(true);
      expect(validateRuleDefinition(rule.ruleDefinition)).toBeNull();
      expect(applyConditionSchema.array().safeParse(rule.applyConditions).success).toBe(true);
      expect(evaluate(rule).status).not.toMatch(/invalid_definition|calculation_error/);
      expect(JSON.stringify(rule)).not.toContain("pzab246");
    }
  });

  it("JenkinのBBS14点境界と入院時10m非自立・片側性・成人の条件を守る", () => {
    expect(evaluate(jenkin, { admission_bbs_score: 13 }).isPositive).toBe(false);
    expect(evaluate(jenkin, { admission_bbs_score: 14 }).isPositive).toBe(true);
    expect(evaluate(jenkin).prediction).toContain("10m");
    for (const patch of [
      { admission_independent_10m: true }, { hemiparesis_present: false },
      { admission_age: 17 }, { admission_ward_type: "急性期病棟" }, { stroke_type: "くも膜下出血" },
    ]) expect(evaluate(jenkin, patch).status).toBe("outside");
    const { admission_independent_10m, ...missing } = inputs;
    expect(evaluateRule(jenkin, missing)).toMatchObject({ status: "missing_input", missingFields: ["admission_independent_10m"] });
    expect(jenkin).toMatchObject({ sensitivity: 0.73, specificity: 0.89, auc: 0.81 });
  });

  it.each([
    [kimAll, "脳梗塞", 24], [kimInfarct, "脳梗塞", 33], [kimHemorrhage, "脳出血", 12],
  ])("Kimの全体・病型別カットオフの等号を含める", (rule, strokeType, threshold) => {
    expect(evaluate(rule, { stroke_type: strokeType, admission_bbs_score: threshold - 1 }).isPositive).toBe(false);
    expect(evaluate(rule, { stroke_type: strokeType, admission_bbs_score: threshold }).isPositive).toBe(true);
  });

  it("Kimの病型別性能を全体表の別閾値性能と混同せず、1患者1件だけ集計する", () => {
    expect(kimAll).toMatchObject({ sensitivity: 0.907, specificity: 0.744, auc: 0.899, consensusEligible: false });
    expect(kimInfarct).toMatchObject({ sensitivity: 0.841, specificity: 0.770, auc: 0.890 });
    expect(kimHemorrhage).toMatchObject({ sensitivity: 0.963, specificity: 0.756, auc: 0.912 });
    for (const stroke_type of ["脳梗塞", "脳出血"]) {
      expect(runEngine([kimAll, kimInfarct, kimHemorrhage], { ...inputs, stroke_type }).consensus.totalEligible).toBe(1);
    }
    expect(evaluate(kimAll, { stroke_type: "くも膜下出血" }).status).toBe("outside");
    expect(evaluate(kimInfarct, { stroke_type: "脳出血" }).status).toBe("outside");
    expect(evaluate(kimHemorrhage, { stroke_type: "脳梗塞" }).status).toBe("outside");
    expect(evaluate(kimAll, { admission_ward_type: "その他" }).status).toBe("outside");
    expect(evaluate(kimInfarct, { admission_ward_type: "急性期病棟" }).status).toBe("evaluated");
  });

  it("SatoのFACT8点境界と脳梗塞限定、原著の表記不一致を保持する", () => {
    expect(evaluate(sato, { admission_fact_score: 7 }).isPositive).toBe(false);
    expect(evaluate(sato, { admission_fact_score: 8 }).isPositive).toBe(true);
    expect(evaluate(sato, { stroke_type: "脳出血" }).status).toBe("outside");
    expect(sato).toMatchObject({ sensitivity: 0.93, specificity: 0.59, auc: 0.82 });
    expect((sato.ruleDefinition as any).notes).toContain("Methodsの>6");
  });

  it.each([
    [19, 3, 11, 87, false, false, "0/99"],
    [20, 3, 11, 87, false, false, "0/25"],
    [30, 4, 11, 87, false, false, "7/14"],
    [31, 4, 11, 87, false, false, null],
    [31, 4, 12, 88, true, true, null],
    [50, 4, 12, 87, true, false, null],
    [50, 4, 11, 88, false, true, null],
    [51, 0, 0, 0, true, true, "18/19"],
  ])("Murakamiの運動FIM%s・SIAS%s・FACT%s・TCT%sを図の全分岐で照合する", (motor, sias, factScore, tctScore, factPositive, tctPositive, count) => {
    const patch = { admission_fim_motor_total: motor, admission_sias_nonparetic: sias, admission_fact_score: factScore, admission_tct_score: tctScore };
    for (const [rule, positive] of [[fact, factPositive], [tct, tctPositive]] as const) {
      const result = evaluate(rule, patch);
      expect(result).toMatchObject({ status: "evaluated", isPositive: positive, probability: null, consensusEligible: false });
      if (count) expect(result.prediction).toContain(count);
      if (count === "7/14") expect(result.prediction).toContain("同数");
    }
  });

  it("Murakamiは経路に必要な入力だけ要求し、現在の体幹評価で入院時を補わない", () => {
    expect(evaluateRule(fact, { admission_ward_type: inputs.admission_ward_type, stroke_type: "脳梗塞", hemiparesis_present: true, admission_fim_motor_total: 51 })).toMatchObject({ status: "evaluated", isPositive: true });
    const { admission_fact_score, admission_tct_score, ...noTrunk } = inputs;
    expect(evaluateRule(fact, { ...noTrunk, trunk_control: 20, tct_score: 100 })).toMatchObject({ status: "missing_input", missingFields: ["admission_fact_score"] });
    expect(evaluateRule(tct, { ...noTrunk, tct_score: 100 })).toMatchObject({ status: "missing_input", missingFields: ["admission_tct_score"] });
    expect(evaluate(fact, { hemiparesis_present: false }).status).toBe("outside");
    expect(runEngine([fact, tct], inputs).consensus.totalEligible).toBe(0);
    expect(fact).toMatchObject({ accuracy: 0.847, sensitivity: null, specificity: null, auc: null });
    expect(tct).toMatchObject({ accuracy: 0.832, sensitivity: null, specificity: null, auc: null });
  });

  it("BBS・FACTは入院時の値を使い、未入力を現在値から補わない", () => {
    const { admission_bbs_score, admission_fact_score, ...missing } = inputs;
    const current = { ...missing, bbs_score: 56, trunk_control: 20, fact_score: 20 };
    expect(evaluateRule(jenkin, current).missingFields).toContain("admission_bbs_score");
    expect(evaluateRule(sato, current).missingFields).toContain("admission_fact_score");
  });

  it("必要な全入力が画面にあり、FACT・TCT・SIASの点数範囲・整数・型を検証する", () => {
    const required = new Set(rules.flatMap(rule => [...extractRequiredFieldsFromDef(rule.ruleDefinition), ...rule.applyConditions.map(c => c.field)]));
    const visible = getVisiblePatientSections(required, false).flatMap(section => section.fields.map(field => field.key));
    for (const field of required) expect(visible).toContain(commonPatientInputField(field));
    for (const [field, max] of [["admission_fact_score", 20], ["admission_tct_score", 100], ["admission_sias_nonparetic", 6]] as const) {
      expect(getPatientScoreRange(field)).toEqual({ min: 0, max });
      expect(PATIENT_FIELDS.flatMap(s => s.fields).find(f => f.key === field)?.type).toBe("number");
      for (const value of [-1, max + 1, 0.5, "4", Infinity]) expect(patientInputsSchema.safeParse({ [field]: value }).success).toBe(false);
      for (const value of [0, max]) expect(patientInputsSchema.safeParse({ [field]: value }).success).toBe(true);
    }
  });

  it("平均・中央値を固定日や適用日数範囲に変換せず、退院日は未特定として保持する", () => {
    const query = { kind: "future" as const, evaluation: { value: 40, unit: "day" as const, precision: "exact" as const }, target: { value: 120, unit: "day" as const, precision: "exact" as const } };
    for (const result of runEngine(rules, inputs, query).results.filter(r => r.status === "evaluated")) {
      expect(result.timeline?.target).toMatchObject({ value: null, precision: "unknown" });
      expect(result.timeline?.evaluation.matchRangeDays).toBeUndefined();
      expect(result.timeMatch?.status).toBe("review");
    }
  });
});
