import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { correctLouieRule } from "../scripts/lib/louie-2018.mjs";
import { reviewLiterature } from "../scripts/lib/literature-review.mjs";
import { runEngine } from "./ruleEngine";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { getResultStatus } from "../shared/resultStatus";
import type { LiteratureRule } from "../drizzle/schema";
import { migrateLouie2018Rules } from "../client/src/demo/louie2018Migration";
import legacyDemoRules from "../client/src/demo/louie2018Legacy.json";

const baseline = JSON.parse(fs.readFileSync(new URL("../scripts/local-literature.baseline.json", import.meta.url), "utf8"));
const rule = (id: number) => correctLouieRule(baseline.find((row: LiteratureRule) => row.id === id)) as LiteratureRule;
const inputs = { days_onset_to_admission: 20, admission_mmse_score: 20, stroke_type: "脳梗塞", admission_bbs_score: 12, admission_unassisted_5m: false };
const evaluate = (id: number, values = inputs) => runEngine([rule(id)], values).results[0];

describe("Louie・Eng 2018 原著と適用範囲", () => {
  it.each([60001, 60002])("%sの対象時期・認知機能・病型を守り、現在値で入院時値を代用しない", id => {
    expect(validateRuleDefinition(rule(id).ruleDefinition)).toBeNull();
    expect(evaluate(id).status).toBe("evaluated");
    expect(evaluate(id, { ...inputs, days_onset_to_admission: 27 }).status).toBe("evaluated");
    expect(evaluate(id, { ...inputs, days_onset_to_admission: 28 }).status).toBe("outside");
    expect(evaluate(id, { ...inputs, admission_mmse_score: 19 }).status).toBe("outside");
    for (const stroke_type of ["くも膜下出血", "その他"]) expect(evaluate(id, { ...inputs, stroke_type }).status).toBe("outside");
    for (const field of ["days_onset_to_admission", "admission_mmse_score", "admission_bbs_score", "stroke_type"]) {
      const values: any = { ...inputs, days_since_onset: 20, mmse_score: 30, bbs_score: 56 };
      delete values[field];
      expect(evaluate(id, values)).toMatchObject({ status: "missing_input", missingFields: expect.arrayContaining([field]) });
    }
  });
  it("12点は入院時非歩行者のみ、29点は入院時の歩行可否を問わない", () => {
    expect(evaluate(60002)).toMatchObject({ isPositive: true, probability: null });
    expect(evaluate(60002, { ...inputs, admission_bbs_score: 11 })).toMatchObject({ isPositive: false, prediction: expect.stringContaining("約40%") });
    expect(evaluate(60002, { ...inputs, admission_unassisted_5m: true }).status).toBe("outside");
    expect(evaluate(60001, { ...inputs, admission_bbs_score: 29, admission_unassisted_5m: true }).isPositive).toBe(true);
    expect(evaluate(60001, { ...inputs, admission_bbs_score: 28 }).isPositive).toBe(false);
  });
  it.each([60001, 60002])("%sの中央値に時期確認を付け、文献の集計除外設定も守る", id => {
    const output = runEngine([rule(id)], inputs, { kind: "future", evaluation: { value: 20, unit: "day", precision: "exact" }, target: { value: 120, unit: "day", precision: "exact" } });
    expect(output.results[0].timeMatch?.status).toBe("review");
    expect(getResultStatus(output.results[0])).toBe("reference");
    expect(output.consensus.totalEligible).toBe(0);
    const timeline = (rule(id).ruleDefinition as any).timeline;
    expect(timeline.evaluation.precision).toBe("median");
    expect(timeline.target.value - timeline.evaluation.value).toBe(28);
    expect(timeline.target.matchRangeDays).toBeUndefined();
    expect(runEngine([rule(id)], inputs, { kind: "concurrent" }).results[0].status).toBe("outside");
  });
  it("反復適用と既存レビュー経路で同じ定義を保持し、アウトカムIDを変更しない", () => {
    for (const id of [60001, 60002]) {
      const updated = rule(id);
      expect(correctLouieRule(updated)).toEqual(updated);
      expect(reviewLiterature(updated)).toEqual(updated);
      expect(updated.outcomeId).toBe(id === 60001 ? 3 : 1);
    }
  });
  it("デモの未編集の旧登録だけを更新し、個別編集・追加文献は保持する", () => {
    const legacy = structuredClone(legacyDemoRules);
    const migrated = migrateLouie2018Rules(legacy);
    expect(migrated.map(row => row.name)).toEqual([rule(60001).name, rule(60002).name]);
    expect(migrateLouie2018Rules(migrated)).toEqual(migrated);
    const custom = { ...legacy[0], name: "個別編集した登録" };
    const additional = { ...legacy[1], id: 99999 };
    const preserved = migrateLouie2018Rules([custom, additional]);
    expect(preserved[0]).toBe(custom);
    expect(preserved[1]).toBe(additional);
  });
});
