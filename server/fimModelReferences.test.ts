import { describe, expect, it } from "vitest";
import { createFimModelReferences, fimReferenceOutcomes } from "../scripts/lib/fim-model-references.mjs";
import type { LiteratureRule } from "../drizzle/schema";
import { evaluateRule, runEngine } from "./ruleEngine";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { getRuleExclusionReason } from "../shared/ruleAvailability";
import { prepareRuleEdit } from "./ruleReview";

const rules = createFimModelReferences([5, 6, 7]).map((rule: object, i: number) => ({ ...rule, id: i + 1 })) as unknown as LiteratureRule[];
describe("B-ADL・Maugeriの未確認パラメータを参考登録として扱う", () => {
  it.each(rules)("$nameは有効に切り替えても計算・集計せず理由を返す", rule => {
    expect(rule.isActive).toBe(false);
    expect(rule.consensusEligible).toBe(false);
    const active = { ...rule, isActive: true };
    const result = evaluateRule(active, {});
    expect(result).toMatchObject({ status: "unsupported", isApplicable: false, isPositive: null, probability: null, numericValue: null });
    expect(result.unavailableReason).toBe(getRuleExclusionReason(rule.ruleDefinition));
    expect(runEngine([active], {}).consensus.totalEligible).toBe(0);
    // Even removal of the explicit review block cannot make null a valid parameter.
    expect(validateRuleDefinition(rule.ruleDefinition)).not.toBeNull();
    expect(evaluateRule({ ...active, ruleDefinition: { ...rule.ruleDefinition, evidenceReview: undefined } } as unknown as LiteratureRule, {}).status).toBe("invalid_definition");
    expect(getRuleExclusionReason(prepareRuleEdit(rule, {}))).toBe(result.unavailableReason);
  });
  it("切片とAlb境界を0や片方の報告値で補完しない", () => {
    const def = rules[0].ruleDefinition as any;
    const albumin = def.items.find((item: any) => item.field === "admission_albumin_g_dl");
    expect(albumin.bands.map((band: any) => band.value)).toEqual([null, null]);
    expect(def.study.albuminCutoffInText).toBe(3.55);
    expect(def.study.albuminCutoffInTable2).toBe(3.5);
    expect(def.items.map((item: any) => Math.max(...item.bands.map((band: any) => band.score)))).toEqual([1, 1, 1, 1, 3, 5]);
    for (const rule of rules.slice(1)) expect((rule.ruleDefinition as any).intercept).toBeNull();
  });
  it("発症90日後・退院時・FISの3アウトカムを混ぜない", () => {
    expect(fimReferenceOutcomes.map((o: any) => o.name)).toEqual(["発症90日後の運動FIM >61点", "退院時の運動FIM >61点", "退院時FIS身体自立度 ≥5"]);
    expect(rules.map(r => r.outcomeId)).toEqual([5, 6, 7]);
    expect((rules[0].ruleDefinition as any).timeline.target).toMatchObject({ value: 90, precision: "exact" });
    for (const rule of rules.slice(1)) expect((rule.ruleDefinition as any).timeline.target).toMatchObject({ value: null, precision: "unknown" });
  });
});
