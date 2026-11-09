import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { getAssessmentFieldPhase, getInputsForAssessmentPhase, isAssessmentFieldAvailable } from "../shared/assessment";
import { getVisiblePatientSections } from "../client/src/lib/patientFields";
import { patientInputsSchema } from "../shared/patientValidation";
import { reviewLiterature } from "../scripts/lib/literature-review.mjs";
import { extractRequiredFieldsFromDef, runEngine } from "./ruleEngine";
import type { LiteratureRule } from "../drizzle/schema";

const baseline = JSON.parse(fs.readFileSync(new URL("../scripts/local-literature.baseline.json", import.meta.url), "utf8"));
const rule = reviewLiterature(baseline.find((row: LiteratureRule) => row.id === 30006)) as LiteratureRule;
const inputs = { admission_fim_motor_total: 40, admission_age: 60, delta_bbs: 21, delta_fim_motor: 0, delta_fim_cognitive: -1 };

describe("評価時点に応じた変化量の送信", () => {
  it("入院時は既存の変化量を使って変化量モデルを判定しない", () => {
    const admissionInputs = getInputsForAssessmentPhase(inputs, "admission");
    expect(admissionInputs).toEqual({ admission_fim_motor_total: 40, admission_age: 60 });
    expect(runEngine([rule], admissionInputs).results[0]).toMatchObject({ status: "missing_input", missingFields: ["delta_bbs"], isPositive: null });
  });
  it.each(["month1", "followup", "discharge"] as const)("%sではゼロ・負の変化量も保持し、照合できる", phase => {
    const laterInputs = getInputsForAssessmentPhase(inputs, phase);
    expect(laterInputs.delta_fim_motor).toBe(0);
    expect(laterInputs.delta_fim_cognitive).toBe(-1);
    expect(runEngine([rule], laterInputs).results[0]).toMatchObject({ status: "evaluated", isPositive: true });
  });
  it("入院時へ戻しても元の入力値を消さず、後の評価時点で再利用できる", () => {
    const before = structuredClone(inputs);
    getInputsForAssessmentPhase(inputs, "admission");
    expect(inputs).toEqual(before);
    expect(getInputsForAssessmentPhase(inputs, "month1")).toEqual(before);
  });
  it("入力無効の古い変化量で入院時の入力検証が失敗しない", () => {
    const stale = { ...inputs, delta_bbs: 999 };
    expect(patientInputsSchema.safeParse(getInputsForAssessmentPhase(stale, "admission")).success).toBe(true);
    expect(patientInputsSchema.safeParse(getInputsForAssessmentPhase(stale, "month1")).success).toBe(false);
  });
  it("歩行自立モデルに必要な1ヶ月後の変化量欄を初期表示する", () => {
    const walkingRules = [30006, 30007].map(id =>
      reviewLiterature(baseline.find((row: LiteratureRule) => row.id === id)) as LiteratureRule
    );
    const required = new Set(walkingRules.flatMap(rule => extractRequiredFieldsFromDef(rule.ruleDefinition)));
    const section = getVisiblePatientSections(required, false)
      .find(section => section.section === "変化量（入棟1ヶ月後評価）");
    expect(section?.fields.map(field => field.key))
      .toEqual(["delta_bbs", "delta_fim_motor", "delta_fim_cognitive"]);
    for (const field of section!.fields) {
      expect(getAssessmentFieldPhase(field.key)).toBe("month1");
      expect(isAssessmentFieldAvailable(field.key, "admission")).toBe(false);
      expect(isAssessmentFieldAvailable(field.key, "week3")).toBe(false);
      expect(isAssessmentFieldAvailable(field.key, "month1")).toBe(true);
    }
  });
  it("1ヶ月後の項目が不要なアウトカムでは通常表示せず、全項目表示では案内対象に含める", () => {
    expect(getVisiblePatientSections(new Set(["admission_age"]), false)
      .some(section => section.fields.some(field => field.key === "delta_bbs"))).toBe(false);
    expect(getVisiblePatientSections(new Set(), true)
      .flatMap(section => section.fields.map(field => field.key)))
      .toEqual(expect.arrayContaining(["delta_bbs", "delta_fim_motor", "delta_fim_cognitive"]));
    expect(getAssessmentFieldPhase("week3_fim_motor_total")).toBe("week3");
    expect(getAssessmentFieldPhase("admission_age")).toBeUndefined();
  });
});
