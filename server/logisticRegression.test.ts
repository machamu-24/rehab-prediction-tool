import { describe, expect, it, vi } from "vitest";
import { runEngine, extractRequiredFieldsFromDef } from "./ruleEngine";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { RULE_TYPE_LABELS } from "../shared/ruleTypes";
import { addLogisticRuleType } from "../scripts/lib/local-schema.mjs";
import type { LiteratureRule } from "../drizzle/schema";

const definition = {
  type: "logistic_regression" as const, outputMode: "probability" as const, intercept: -2,
  variables: [
    { field: "bbs_score", fieldLabel: "BBS", coefficient: 0.1 },
    { field: "sex", fieldLabel: "性別", coefficient: -1, categoryMap: { "男性": 0, "女性": 1 } },
  ],
};
const rule = { id: 1, ruleType: "logistic_regression", ruleDefinition: definition, isActive: true, consensusEligible: true, applyConditions: [] } as unknown as LiteratureRule;
const evaluate = (def = definition, inputs = { bbs_score: 20, sex: "男性" }) => runEngine([{ ...rule, ruleDefinition: def }], inputs).results[0];

describe("ロジスティック回帰ルール", () => {
  it("係数と切片から確率を返し、出力名・必要項目も独立した種別として扱う", () => {
    expect(validateRuleDefinition(definition)).toBeNull();
    expect(RULE_TYPE_LABELS[rule.ruleType]).toBe("ロジスティック回帰");
    expect(extractRequiredFieldsFromDef(definition)).toEqual(["bbs_score", "sex"]);
    const result = evaluate();
    expect(result).toMatchObject({ ruleType: "logistic_regression", status: "evaluated", probability: 0.5, isPositive: null });
    expect(result.literatureSummary.overview).toContain("ロジスティック回帰");
    expect(result.literatureSummary.predictors).toEqual(["BBS", "性別"]);
    expect(evaluate(definition, { bbs_score: 20, sex: "女性" }).probability).toBeCloseTo(0.2689414213699951);
  });

  it("二値判定は明示した閾値を用い、閾値やメッセージなしでは定義を拒否する", () => {
    const binary = { ...definition, outputMode: "binary", positiveMessage: "支持", negativeMessage: "支持せず", probabilityThreshold: 0.7 } as any;
    expect(evaluate(binary)).toMatchObject({ isPositive: false, prediction: "支持せず" });
    expect(evaluate(binary, { bbs_score: 30, sex: "男性" }).isPositive).toBe(true);
    for (const key of ["probabilityThreshold", "positiveMessage", "negativeMessage"]) {
      const invalid = { ...binary }; delete invalid[key];
      expect(validateRuleDefinition(invalid)).toContain("判定閾値");
      expect(evaluate(invalid).status).toBe("invalid_definition");
    }
  });

  it("未入力と未定義カテゴリを無断で0にしない", () => {
    expect(evaluate(definition, { sex: "男性" } as any)).toMatchObject({ status: "missing_input", probability: null, missingFields: ["bbs_score"] });
    expect(evaluate(definition, { bbs_score: 20, sex: "未定義" })).toMatchObject({ status: "calculation_error", probability: null });
  });

  it("係数が大きい場合も有限の0〜1の確率を返す", () => {
    for (const intercept of [-1000, 1000]) {
      const result = evaluate({ ...definition, intercept });
      expect(result.status).toBe("evaluated");
      expect(Number.isFinite(result.probability)).toBe(true);
      expect(result.probability).toBeGreaterThanOrEqual(0);
      expect(result.probability).toBeLessThanOrEqual(1);
    }
  });

  it("ロジスティック回帰にCoxモデルや範囲外の確率閾値を登録できない", () => {
    expect(validateRuleDefinition({ ...definition, modelType: "cox" })).not.toBeNull();
    expect(validateRuleDefinition({ ...definition, probabilityThreshold: 1.1 })).not.toBeNull();
  });
});

describe("ローカルDBのルールタイプ追加", () => {
  it("既存enumの順序と未知の値を保持して末尾に追加し、再実行では変更しない", async () => {
    const query = vi.fn().mockResolvedValueOnce([[{ Type: "enum('cutoff','nomogram','future_type')" }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ Type: "enum('cutoff','nomogram','future_type','logistic_regression')" }]]);
    expect(await addLogisticRuleType({ query })).toBe(true);
    expect(query.mock.calls[1][0]).toContain("enum('cutoff','nomogram','future_type','logistic_regression')");
    expect(await addLogisticRuleType({ query })).toBe(false);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("想定外の列定義では変更を実行しない", async () => {
    const query = vi.fn().mockResolvedValue([[{ Type: "varchar(255)" }]]);
    await expect(addLogisticRuleType({ query })).rejects.toThrow("enum定義");
    expect(query).toHaveBeenCalledTimes(1);
  });
});
