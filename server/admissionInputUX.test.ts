import { describe, expect, it } from "vitest";
import { admissionSharedInputs, initiallyLinkAdmissionDays, switchAdmissionPhase } from "../client/src/lib/admissionSharedInputs";
import { getRequiredPatientFields, getVisiblePatientSections, PATIENT_FIELDS } from "../client/src/lib/patientFields";
import { groupSavedInputs } from "../client/src/lib/savedAssessment";
import { withWalkingEligibilityInputs } from "../shared/patientInputAliases";
import { createStrokeWalkingRules } from "../scripts/lib/stroke-walking-2026.mjs";
import { evaluateRule, runEngine } from "./ruleEngine";
import type { LiteratureRule } from "../drizzle/schema";
import type { TimeQuery } from "../shared/literatureTimeline";

const query: TimeQuery = { kind: "future", evaluation: { value: 20, unit: "day", precision: "exact" }, target: { value: 120, unit: "day", precision: "exact" } };
const later = { ...query, evaluation: { ...query.evaluation!, value: 75 } };
const jenkin = { ...createStrokeWalkingRules(1)[0], id: 60019 } as LiteratureRule;
const base = { admission_ward_type: "回復期リハビリテーション病棟", stroke_type: "脳梗塞", admission_age: 70, admission_bbs_score: 14, admission_independent_10m: false };

describe("入院時の日数の共通入力", () => {
  it("測定時点を入院日数へ反映し、元の入力と予測対象日を変えない", () => {
    const entered = { age: 70 };
    expect(admissionSharedInputs(entered, query, "admission", true)).toEqual({ age: 70, days_onset_to_admission: 20 });
    expect(entered).toEqual({ age: 70 });
    expect(query.target?.value).toBe(120);
    expect(admissionSharedInputs(entered, later, "admission", true).days_onset_to_admission).toBe(75);
  });

  it("測定日と入院日が異なる個別入力・空欄を優先し、連動へ戻せる", () => {
    for (const entered of [{ days_onset_to_admission: "18" }, { days_onset_to_admission: "" }]) {
      expect(admissionSharedInputs(entered, query, "admission", false)).toEqual(entered);
      expect(admissionSharedInputs(entered, query, "admission", true).days_onset_to_admission).toBe(20);
    }
    expect(initiallyLinkAdmissionDays({ days_onset_to_admission: 18 }, query)).toBe(false);
    expect(initiallyLinkAdmissionDays({ days_onset_to_admission: "20" }, query)).toBe(true);
    expect(initiallyLinkAdmissionDays({}, query)).toBe(true);
    expect(initiallyLinkAdmissionDays({ days_onset_to_admission: "" }, query)).toBe(false);
  });

  it("入院時を離れたら日数を固定し、経過評価の測定日で上書きしない", () => {
    const switched = switchAdmissionPhase({}, query, "admission", "followup", true);
    expect(switched.inputs.days_onset_to_admission).toBe(20);
    expect(admissionSharedInputs(switched.inputs, later, "followup", true).days_onset_to_admission).toBe(20);
    const returned = switchAdmissionPhase(switched.inputs, later, "followup", "admission", true);
    expect(returned.timeContext.evaluation?.value).toBe(20);
    expect(returned.timeContext.target).toEqual(query.target);
  });

  it.each(["week3", "month1", "followup", "discharge"] as const)("%sでは入院日数を推測・変更しない", phase => {
    expect(admissionSharedInputs({}, query, phase, true)).toEqual({});
    expect(admissionSharedInputs({ days_onset_to_admission: 10 }, query, phase, true).days_onset_to_admission).toBe(10);
  });

  it("発症当日0日を含め、無効値・月単位・未指定は自動転記しない", () => {
    expect(admissionSharedInputs({}, { ...query, evaluation: { ...query.evaluation!, value: 0 } }, "admission", true).days_onset_to_admission).toBe(0);
    for (const value of [-1, 0.5, 100001, Infinity, NaN]) {
      expect(admissionSharedInputs({}, { ...query, evaluation: { ...query.evaluation!, value } }, "admission", true)).toEqual({});
    }
    expect(admissionSharedInputs({}, { ...query, evaluation: { ...query.evaluation!, unit: "month" } }, "admission", true)).toEqual({});
    expect(admissionSharedInputs({}, { kind: "future" }, "admission", true)).toEqual({});
  });
});

describe("歩行・片麻痺入力の整理", () => {
  it("5mの直下に10mを置き、全項目表示でも旧片側性障害欄を表示しない", () => {
    const fields = PATIENT_FIELDS.find(section => section.fields.some(field => field.key === "admission_unassisted_5m"))!.fields.map(field => field.key);
    expect(fields.indexOf("admission_independent_10m")).toBe(fields.indexOf("admission_unassisted_5m") + 1);
    const visible = getVisiblePatientSections(new Set(["admission_unilateral_impairment"]), true).flatMap(section => section.fields.map(field => field.key));
    expect(visible).not.toContain("admission_unilateral_impairment");
    expect(visible).toContain("hemiparesis_present");
  });

  it("旧フィールドを条件に持つ文献でも基本情報の片麻痺欄だけを要求する", () => {
    const required = getRequiredPatientFields([{ isActive: true, ruleDefinition: jenkin.ruleDefinition, requiredFields: ["admission_bbs_score"], applyConditionFields: jenkin.applyConditions }]);
    expect(required.has("hemiparesis_present")).toBe(true);
    expect(required.has("admission_unilateral_impairment")).toBe(false);
    expect(runEngine([jenkin], base).suggestions[0].missingFields).toEqual(["hemiparesis_present"]);
  });

  it("共通の片麻痺入力をバックエンドで適用し、古い別欄の値より現在の入力を優先する", () => {
    expect(evaluateRule(jenkin, { ...base, hemiparesis_present: true })).toMatchObject({ status: "evaluated", isPositive: true });
    expect(evaluateRule(jenkin, { ...base, hemiparesis_present: false })).toMatchObject({ status: "outside", isPositive: null });
    expect(evaluateRule(jenkin, { ...base, hemiparesis_present: true, admission_unilateral_impairment: false }).status).toBe("evaluated");
    expect(evaluateRule(jenkin, { ...base, hemiparesis_present: false, admission_unilateral_impairment: true }).status).toBe("outside");
    expect(evaluateRule(jenkin, { ...base, hemiparesis_present: true }).literatureSummary.clinicalNote).toContain("片麻痺より広い概念");
  });

  it("旧入力だけの保存症例も照合でき、片側性障害から片麻痺を逆推定しない", () => {
    const historical = { ...base, admission_unilateral_impairment: true };
    const before = structuredClone(historical);
    expect(evaluateRule(jenkin, historical).status).toBe("evaluated");
    expect(withWalkingEligibilityInputs(historical)).not.toHaveProperty("hemiparesis_present");
    expect(historical).toEqual(before);
    const saved = groupSavedInputs({ admission_unilateral_impairment: true });
    expect(saved.flatMap(group => group.rows)).toContainEqual({ key: "admission_unilateral_impairment", label: "入院時 片側性の機能障害（旧入力）", value: "片側性" });
  });
});
