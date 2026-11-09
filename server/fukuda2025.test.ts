import { describe, expect, it } from "vitest";
import { createFukudaRule } from "../scripts/lib/fukuda-2025.mjs";
import type { LiteratureRule } from "../drizzle/schema";
import { evaluateRule, runEngine } from "./ruleEngine";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { patientInputsSchema } from "../shared/patientValidation";
import { PATIENT_FIELDS } from "../client/src/lib/patientFields";

const rule = { ...createFukudaRule(5), id: 60016 } as unknown as LiteratureRule;
const inputs = { admission_ward_type: "回復期リハビリテーション病棟", stroke_type: "脳梗塞", stroke_onset_concurrent_disease: false, admission_age: 75, days_onset_to_admission: 40, admission_brs_upper: 3, admission_bbs_score: 14, admission_fim_total: 50, admission_albumin_g_dl: 3.5 };

describe("B-ADL：利用者指定のAlb≥3.5 g/dL", () => {
  it.each([[3.49, false, 5], [3.5, true, 6], [3.51, true, 6], [3.55, true, 6]])("Alb=%sで境界を含めて採点する", (albumin, positive, total) => {
    const result = evaluateRule(rule, { ...inputs, admission_albumin_g_dl: albumin });
    expect(result).toMatchObject({ status: "evaluated", isPositive: positive, probability: null, consensusEligible: false });
    expect(result.details.join("\n")).toContain(`合計スコア: ${total}点 / 12点`);
    expect(validateRuleDefinition(rule.ruleDefinition)).toBeNull();
  });
  it("6項目全て良好で12点、全て反対側で0点を返し、現在値で補完しない", () => {
    const high = { ...inputs, admission_age: 70, days_onset_to_admission: 37, admission_brs_upper: 4, admission_bbs_score: 15 };
    expect(evaluateRule(rule, high).details.join("\n")).toContain("合計スコア: 12点 / 12点");
    const low = { ...inputs, admission_fim_total: 49, admission_albumin_g_dl: 3.49, bbs_score: 56, fim_total: 126, age: 40 };
    expect(evaluateRule(rule, low).details.join("\n")).toContain("合計スコア: 0点 / 12点");
    const { admission_albumin_g_dl, ...missing } = inputs;
    expect(evaluateRule(rule, missing)).toMatchObject({ status: "missing_input", missingFields: ["admission_albumin_g_dl"] });
  });
  it("必要項目を入力でき、Albは小数・非負、上肢BRSは1〜6の整数で検証する", () => {
    const keys = PATIENT_FIELDS.flatMap(s => s.fields.map(f => f.key));
    for (const key of Object.keys(inputs)) expect(keys).toContain(key);
    expect(patientInputsSchema.safeParse(inputs).success).toBe(true);
    for (const value of [-1, Infinity, "3.5"]) expect(patientInputsSchema.safeParse({ ...inputs, admission_albumin_g_dl: value }).success).toBe(false);
    for (const value of [0, 7, 3.5, "4"]) expect(patientInputsSchema.safeParse({ ...inputs, admission_brs_upper: value }).success).toBe(false);
  });
  it("対象条件を守り、改変された境界と原著の性能値を区別する", () => {
    for (const patch of [{ days_onset_to_admission: 90 }, { admission_ward_type: "急性期病棟" }, { stroke_type: "その他" }, { stroke_onset_concurrent_disease: true }]) expect(evaluateRule(rule, { ...inputs, ...patch }).status).toBe("outside");
    expect(runEngine([rule], inputs).consensus.totalEligible).toBe(0);
    expect(rule.isActive).toBe(true);
    expect(rule.auc).toBeNull();
    expect((rule.ruleDefinition as any).localCustomization).toMatchObject({ operator: ">=", value: 3.5, authorizedBy: "user", originalEqualityConfirmed: false, localVariantValidated: false });
  });
});
