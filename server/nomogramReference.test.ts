import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LiteratureRule } from "../drizzle/schema";
import { reviewLiterature } from "../scripts/lib/literature-review.mjs";
import { getRequiredPatientFields } from "../client/src/lib/patientFields";
import { LiteratureResults, LiteratureSummary } from "../client/src/pages/PredictPage";
import { NomogramReferenceCard } from "../client/src/components/NomogramReferenceCard";
import { getResultDisplayStatus, getResultStatus } from "../shared/resultStatus";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { extractRequiredFieldsFromDef, runEngine } from "./ruleEngine";

const baseline = JSON.parse(fs.readFileSync(new URL("../scripts/local-literature.baseline.json", import.meta.url), "utf8"));
const reference = reviewLiterature(baseline.find((rule: LiteratureRule) => rule.id === 30005)) as LiteratureRule;
const inputs = {
  admission_age: 70, days_onset_to_admission: 17, admission_sit_up_independent: false,
  admission_bbs_score: 0, admission_fim_motor_total: 41, admission_fim_cognitive_total: 24,
};
const evaluate = (rule = reference, values: Record<string, number | boolean> = inputs) => runEngine([rule], values);

describe("自動計算できないノモグラムの原文参照", () => {
  it("登録プレビューの検証で既存Coxモデルに架空の切片・係数を要求しない", () => {
    expect(validateRuleDefinition(reference.ruleDefinition)).toBeNull();
    expect(validateRuleDefinition({
      type: "nomogram", modelType: "cox_proportional_hazards",
      variables: [{ field: "admission_age", fieldLabel: "入院時年齢" }],
    })).toBeNull();
    const incompleteCalculation = {
      type: "nomogram", modelType: "logistic",
      variables: [{ field: "admission_age", fieldLabel: "入院時年齢" }],
    };
    expect(validateRuleDefinition(incompleteCalculation)).toContain("切片");
    expect(validateRuleDefinition({ ...incompleteCalculation, intercept: 0,
      positiveMessage: "支持", negativeMessage: "困難",
    })).toContain("係数");
  });

  it("参考登録でも提供された数値・項目名・時間軸の不備は拒否する", () => {
    const minimal = { type: "nomogram", modelType: "cox", variables: [{ field: "admission_age" }] };
    for (const invalid of [
      { ...minimal, intercept: "不明" },
      { ...minimal, variables: [{ field: "admission_age", coefficient: "不明" }] },
      { ...minimal, variables: [] },
      { ...minimal, variables: [{ field: "不正な項目名" }] },
      { ...minimal, timeline: {} },
    ]) expect(validateRuleDefinition(invalid)).not.toBeNull();
  });

  it("項目が揃えば参考文献として表示し、予測・確率・支持票を作らない", () => {
    const before = structuredClone(reference);
    const output = evaluate({ ...reference, consensusEligible: true });
    expect(output.results[0]).toMatchObject({
      status: "reference_only", isApplicable: false, isPositive: null,
      prediction: null, probability: null, numericValue: null, consensusEligible: false,
      missingFields: [], referenceOnly: { reason: expect.stringContaining("ベースライン生存関数") },
    });
    expect(output.consensus).toMatchObject({ totalEligible: 0, positiveCount: 0, negativeCount: 0, applicableCount: 0, score: null });
    expect(getResultStatus(output.results[0])).toBe("literature");
    expect(getResultDisplayStatus(output.results[0])).toBe("literature");
    expect(reference).toEqual(before);
    const html = renderToStaticMarkup(createElement(LiteratureResults, { results: output.results }));
    expect(html).toContain("参考文献（原文確認）");
    expect(html).toContain("原文のノモグラムを確認する");
    expect(html).toContain(reference.sourceUrl);
    expect(html).toContain("予測値・確率は算出していません");
    expect(html).toContain("対象患者に適用できるとは限りません");
    expect(html).not.toContain("約70%");
    expect(html).not.toContain("ほかの集計条件を満たす場合に集計します");
    const summary = renderToStaticMarkup(createElement(LiteratureSummary, { results: output.results }));
    expect(summary).toMatch(/参考文献（原文確認）<\/p><p[^>]*>1件<\/p>/);
    expect(summary).toMatch(/評価できたルール:[\s\S]*?<strong[^>]*>0<\/strong>件/);
  });

  it("入院時モデルの日数を入院までの日数として要求し、現在の日数で補わない", () => {
    const { days_onset_to_admission, ...other } = inputs;
    const output = evaluate(reference, { ...other, days_since_onset: 45 });
    expect(output.results[0]).toMatchObject({ status: "missing_input", missingFields: ["days_onset_to_admission"], probability: null });
    expect(getResultDisplayStatus(output.results[0])).toBe("excluded");
    expect(output.suggestions[0].missingFields).toEqual(["days_onset_to_admission"]);
    const html = renderToStaticMarkup(createElement(LiteratureResults, { results: output.results }));
    expect(html).toContain("不足している評価項目：発症から入院までの日数");
    expect(html).toContain("原文のノモグラムを確認する");
  });

  it("計算対象外でも必要欄を表示候補にし、無効な文献は候補にしない", () => {
    const rule = { ...reference, requiredFields: extractRequiredFieldsFromDef(reference.ruleDefinition), applyConditionFields: [] };
    const fields = getRequiredPatientFields([rule], "future");
    for (const field of Object.keys(inputs)) expect(fields.has(field)).toBe(true);
    expect(fields.has("days_since_onset")).toBe(false);
    expect(getRequiredPatientFields([{ ...rule, isActive: false }], "future").size).toBe(0);
    expect(evaluate({ ...reference, isActive: false }).results).toEqual([]);
  });

  it("未入力と明らかな適用条件外を区別し、条件を満たさない文献を参考件数へ含めない", () => {
    const rule = { ...reference, applyConditions: [{ field: "first_stroke", operator: "==", value: true, label: "初発" }] } as LiteratureRule;
    expect(evaluate(rule).results[0]).toMatchObject({ status: "missing_input", missingFields: ["first_stroke"] });
    const output = evaluate(rule, { ...inputs, first_stroke: false });
    expect(output.results[0].status).toBe("outside");
    expect(getResultDisplayStatus(output.results[0])).toBe("excluded");
    expect(output.consensus.totalEligible).toBe(0);
    expect(evaluate(rule, { ...inputs, first_stroke: true }).results[0].status).toBe("reference_only");
  });

  it("予測種別の不一致は対象外にし、明確な時点が一致しても支持票に変換しない", () => {
    const point = { value: 30, unit: "day", precision: "exact", originalText: "合成テスト", basis: "テスト" };
    const rule = { ...reference, ruleDefinition: { ...reference.ruleDefinition, timeline: {
      version: 1, anchor: "stroke_onset", kind: "future", evaluation: point, target: { ...point, value: 90 },
    } } } as unknown as LiteratureRule;
    expect(runEngine([rule], inputs, { kind: "concurrent" }).results[0]).toMatchObject({ status: "outside", probability: null });
    expect(runEngine([rule], {}, { kind: "concurrent" }).results[0]).toMatchObject({ status: "outside", missingFields: expect.arrayContaining(["admission_age"]) });
    const matched = runEngine([rule], inputs, { kind: "future", evaluation: { value: 30, unit: "day", precision: "exact" }, target: { value: 90, unit: "day", precision: "exact" } });
    expect(matched.results[0]).toMatchObject({ status: "reference_only", timeMatch: { status: "matched" }, consensusEligible: false });
    expect(matched.consensus.totalEligible).toBe(0);
  });

  it("参考用の変数・適用条件・時間軸の不備を入力済み扱いにしない", () => {
    for (const variables of [[], [{ field: "bad field" }]]) {
      const rule = { ...reference, ruleDefinition: { ...reference.ruleDefinition, variables } } as unknown as LiteratureRule;
      expect(evaluate(rule).results[0].referenceOnly).toBeUndefined();
    }
    expect(evaluate({ ...reference, applyConditions: [{ field: "age", operator: "bad" }] } as unknown as LiteratureRule).results[0].status).toBe("invalid_definition");
    const invalidTimeline = { ...reference, ruleDefinition: { ...reference.ruleDefinition, timeline: {} } } as unknown as LiteratureRule;
    expect(evaluate(invalidTimeline).results[0].status).toBe("invalid_definition");
  });

  it("保存スナップショットだけで理由・入力状態・リンクを再表示できる", () => {
    const saved = JSON.parse(JSON.stringify(evaluate().results[0]));
    const html = renderToStaticMarkup(createElement(NomogramReferenceCard, { result: saved }));
    expect(html).toContain("必要項目入力済み");
    expect(html).toContain(saved.referenceOnly.reason);
    expect(html).toContain(saved.sourceUrl);
    expect(getResultStatus(saved)).toBe("literature");
  });
});
