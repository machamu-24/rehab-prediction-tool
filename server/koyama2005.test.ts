import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createKoyamaRule } from "../scripts/lib/koyama-2005.mjs";
import { createJeongRule } from "../scripts/lib/jeong-2014.mjs";
import type { LiteratureRule } from "../drizzle/schema";
import { PATIENT_FIELDS } from "../client/src/lib/patientFields";
import { LiteratureResults } from "../client/src/pages/PredictPage";
import { patientInputsSchema } from "../shared/patientValidation";
import { readContinuousOutput } from "../shared/resultStatus";
import { validateRuleDefinition } from "../shared/ruleValidation";
import { KOYAMA_FORMULA } from "../shared/koyama";
import { predictionTimeContext, usesKoyamaTimeAxis } from "../client/src/lib/predictionTimeContext";
import { KoyamaTimeSummary } from "../client/src/components/KoyamaTimeSummary";
import { evaluateFormula } from "./formula";
import { runEngine } from "./ruleEngine";

const rule = { ...createKoyamaRule(4), id: 1 } as unknown as LiteratureRule;
const input = {
  admission_ward_type: "回復期リハビリテーション病棟", first_stroke: true,
  prestroke_adl_independent: true, supratentorial_stroke: true, admission_wheelchair: true, hemiparesis_present: true,
  stroke_type: "脳出血", koyama_day_a: 30, koyama_fim_total_a: 40,
  koyama_day_b: 45, koyama_fim_total_b: 55, koyama_target_day: 90,
};
const evaluate = (values: Record<string, unknown> = input) => runEngine([rule], values).results[0];

describe("Koyama対数曲線モデル・FIM総得点", () => {
  it("総説図2の自然対数式を再現し、点数を連続値として表示する", () => {
    expect(validateRuleDefinition(rule.ruleDefinition)).toBeNull();
    const output = runEngine([rule], input);
    expect(output.results[0]).toMatchObject({ status: "evaluated", prediction: "予測値: 80.64点", isPositive: null, probability: null, outputMode: "continuous", outputUnit: "点" });
    expect(output.results[0].numericValue).toBeCloseTo(80.64266937027182, 10);
    expect(output.results[0].timeline).toMatchObject({ evaluation: { value: 45 }, target: { value: 90 } });
    expect(output.consensus).toMatchObject({ score: null, totalEligible: 0, positiveCount: 0, negativeCount: 0 });
    expect(evaluate({ ...input, koyama_target_day: 180 }).numericValue).toBeCloseTo(106.28533874054365);
    // 100点を超えても総得点126点以内なら運動FIMの上限91点で止めない。
    expect(evaluate({ ...input, koyama_fim_total_a: 100, koyama_fim_total_b: 105 }).numericValue).toBeCloseTo(113.54755645675727);
  });

  it("すべての専用入力・対象条件を画面で入力でき、不明を推測補完しない", () => {
    const keys = new Set(PATIENT_FIELDS.flatMap(section => section.fields.map(field => field.key)));
    for (const field of Object.keys(input)) {
      expect(keys.has(field), field).toBe(true);
      const missing: Record<string, unknown> = { ...input, fim_total: 55, fim_motor_total: 40, days_since_onset: 45, days_onset_to_admission: 30 };
      delete missing[field];
      expect(evaluate(missing), field).toMatchObject({ status: "missing_input", numericValue: null, outputMode: "continuous" });
      expect(evaluate(missing).missingFields).toContain(field);
    }
  });

  it.each([
    ["first_stroke", false], ["prestroke_adl_independent", false], ["supratentorial_stroke", false],
    ["admission_wheelchair", false], ["hemiparesis_present", false],
    ["stroke_type", "くも膜下出血"], ["stroke_type", "その他"], ["admission_ward_type", "急性期病棟"],
  ])("対象条件外の%s=%sは予測しない", (field, value) => {
    expect(evaluate({ ...input, [field]: value })).toMatchObject({ status: "outside", numericValue: null, isPositive: null });
  });

  it.each([
    { koyama_day_a: 29 }, { koyama_day_a: 61, koyama_day_b: 80 },
    { koyama_day_a: 45 }, { koyama_day_b: 30 }, { koyama_day_b: 29 },
    { koyama_day_b: 43 }, { koyama_day_b: 73 },
    { koyama_target_day: 45 }, { koyama_target_day: 44 }, { koyama_target_day: 181 },
    { koyama_fim_total_b: 39 },
  ])("日数・間隔・低下の運用制限 %j", changes => {
    expect(evaluate({ ...input, ...changes })).toMatchObject({ status: "outside", numericValue: null, isPositive: null });
  });

  it("境界の14日・42日とAの60日を許可し、横ばいを将来の回復なしと断定しない", () => {
    for (const [a, b, x] of [[30, 44, 90], [60, 102, 180]])
      expect(evaluate({ ...input, koyama_day_a: a, koyama_day_b: b, koyama_target_day: x }).status).toBe("evaluated");
    const flat = evaluate({ ...input, koyama_fim_total_b: 40 });
    expect(flat).toMatchObject({ status: "evaluated", numericValue: 40 });
    expect(flat.details.join(" ")).toContain("今後回復しないことを意味しません");
  });

  it("天井を超えた式の計算値を126点に置き換えず、範囲外の理由を表示する", () => {
    const result = evaluate({ ...input, koyama_fim_total_a: 100, koyama_fim_total_b: 120, koyama_target_day: 180 });
    expect(result).toMatchObject({ status: "outside", numericValue: null, prediction: null });
    expect(result.unavailableReason).toContain("FIM総得点の範囲（18〜126点）外");
  });

  it("総得点の範囲・整数と専用日数の型を検証する", () => {
    expect(patientInputsSchema.safeParse(input).success).toBe(true);
    for (const field of ["koyama_fim_total_a", "koyama_fim_total_b"])
      for (const value of [17, 127, 40.5, "40"])
        expect(patientInputsSchema.safeParse({ ...input, [field]: value }).success).toBe(false);
    for (const field of ["koyama_day_a", "koyama_day_b", "koyama_target_day"])
      for (const value of [0, -1, 30.5, "30", Infinity, NaN])
        expect(patientInputsSchema.safeParse({ ...input, [field]: value }).success).toBe(false);
  });

  it("上部に他文献用の時間軸があっても、専用入力B/Xで将来予測する", () => {
    const query = { kind: "future" as const, evaluation: { value: 45, unit: "day" as const, precision: "exact" as const }, target: { value: 90, unit: "day" as const, precision: "exact" as const } };
    expect(runEngine([rule], input, query).results[0].status).toBe("evaluated");
    for (const bad of [
      { ...query, evaluation: { ...query.evaluation, value: 30 } },
      { ...query, target: { ...query.target, value: 120 } },
      { ...query, target: { ...query.target, value: 3, unit: "month" as const } },
      { kind: "concurrent" as const },
    ]) expect(runEngine([rule], input, bad).results[0]).toMatchObject({ status: "evaluated", numericValue: expect.closeTo(80.64266937027182, 10), timeline: { kind: "future", evaluation: { value: 45 }, target: { value: 90 } } });
  });

  it("専用フォームでは以前の手動時間軸が残っていてもB/Xを使って照合する", () => {
    const staleQueries = [
      { kind: "future" as const, evaluation: { value: 30, unit: "day" as const, precision: "exact" as const }, target: { value: 120, unit: "day" as const, precision: "exact" as const } },
      { kind: "concurrent" as const },
    ];
    for (const manual of staleQueries) {
      const query = predictionTimeContext([rule], input, manual);
      expect(query).toMatchObject({ kind: "future", evaluation: { value: 45, unit: "day" }, target: { value: 90, unit: "day" } });
      expect(runEngine([rule], input, query).results[0]).toMatchObject({ status: "evaluated", numericValue: expect.closeTo(80.64266937027182, 10) });
      const changed = { ...input, koyama_day_b: 44, koyama_target_day: 120 };
      expect(runEngine([rule], changed, predictionTimeContext([rule], changed, manual)).results[0]).toMatchObject({ status: "evaluated", timeline: { evaluation: { value: 44 }, target: { value: 120 } } });
    }
  });

  it("FIM総得点の他モデルと同時に照合しても、Koyamaの時間軸はB/Xを使う", () => {
    const other = { ...createJeongRule(4), id: 2 } as unknown as LiteratureRule;
    const rules = [rule, other];
    const manual = { kind: "future" as const, evaluation: { value: 30, unit: "day" as const, precision: "exact" as const }, target: { value: 120, unit: "day" as const, precision: "exact" as const } };
    const output = runEngine(rules, input, predictionTimeContext(rules, input, manual));
    expect(output.results[0]).toMatchObject({ status: "evaluated", numericValue: expect.closeTo(80.64266937027182, 10), timeline: { evaluation: { value: 45 }, target: { value: 90 } } });
    expect(output.results[1]).toEqual(runEngine([other], input, manual).results[0]);
  });

  it("B/Xを未入力のまま補完せず、対象条件や日数間隔の不一致理由を表示する", () => {
    const manual = { kind: "concurrent" as const };
    for (const field of ["koyama_day_b", "koyama_target_day"]) {
      const missing: Record<string, unknown> = { ...input };
      delete missing[field];
      expect(runEngine([rule], missing, predictionTimeContext([rule], missing, manual)).results[0]).toMatchObject({ status: "missing_input", missingFields: [field] });
    }
    const interval = { ...input, koyama_day_b: 43 };
    expect(runEngine([rule], interval, predictionTimeContext([rule], interval, manual)).results[0]).toMatchObject({ status: "outside", unavailableReason: expect.stringContaining("Bには発症後44〜72日") });
    const excluded = { ...input, first_stroke: false };
    expect(runEngine([rule], excluded, predictionTimeContext([rule], excluded, manual)).results[0]).toMatchObject({ status: "outside", unavailableReason: expect.stringContaining("初発脳卒中") });
  });

  it("他モデルの時間軸は手動指定を維持し、無効な文献は自動反映の対象にしない", () => {
    const other = { isActive: true, ruleDefinition: { type: "cutoff" } };
    const manual = { kind: "concurrent" as const };
    for (const rules of [undefined, [], [other], [rule, other], [{ ...rule, isActive: false }]]) {
      expect(usesKoyamaTimeAxis(rules)).toBe(false);
      expect(predictionTimeContext(rules, input, manual)).toBe(manual);
    }
    expect(usesKoyamaTimeAxis([rule, { ...other, isActive: false }])).toBe(true);
  });

  it("時間軸の自動反映と再評価日数の累計入力を画面で説明する", () => {
    const html = renderToStaticMarkup(createElement(KoyamaTimeSummary, { inputs: input }));
    expect(html).toContain("自動反映");
    expect(html).toContain("発症後45日");
    expect(html).toContain("発症後90日");
    const empty = renderToStaticMarkup(createElement(KoyamaTimeSummary, { inputs: { koyama_day_b: "", koyama_target_day: undefined } }));
    expect(empty).toContain("B欄に入力してください");
    expect(empty).toContain("X欄に入力してください");
    const field = PATIENT_FIELDS.flatMap(section => section.fields).find(field => field.key === "koyama_day_b");
    expect(field?.description).toContain("Bには44を入力");
  });

  it("原著未確認・総得点・他モデルの精度の区別を保存し、数値カードに表示する", () => {
    expect(rule).toMatchObject({ evidenceLevel: "Other", accuracy: null, sensitivity: null, specificity: null, auc: null, consensusEligible: false });
    expect(rule.ruleDefinition).toMatchObject({ verification: { originalFullTextReviewed: false }, study: { sampleSize: 18, acrossSubjectRSquared: 0.945 } });
    const html = renderToStaticMarkup(createElement(LiteratureResults, { results: runEngine([rule], input).results }));
    expect(html).toContain("数値予測の照合結果");
    expect(html).toContain("80.64");
    expect(html).toContain("原著本文未確認");
    expect(html).toContain("FIM総得点");
    expect(html).not.toContain("予測確率");
    expect(html.match(/<article\b/g)).toHaveLength(1);
    expect(readContinuousOutput(rule.ruleDefinition)).toMatchObject({ outputMode: "continuous", outputUnit: "点" });
  });

  it("専用モデルの数式・尺度・出力設定の取り違えを拒否する", () => {
    for (const change of [{ formula: "fim_motor_total" }, { outputMode: "binary" }, { outputUnit: "%" }, { variables: [] }])
      expect(validateRuleDefinition({ ...rule.ruleDefinition, ...change })).not.toBeNull();
    expect(evaluateFormula(KOYAMA_FORMULA, input)).toBeCloseTo(80.64266937027182);
  });
});

describe("自然対数の安全な式評価と既存の二値カスタム数式", () => {
  it.each([["ln(1)", 0], ["ln(2 * 3)", Math.log(6)], ["ln(ln(10))", Math.log(Math.log(10))], ["2^3 + ln(1)", 8]])("%s", (expression, answer) => {
    expect(evaluateFormula(expression as string, {})).toBeCloseTo(answer as number);
  });
  it.each(["ln(0)", "ln(-1)", "ln(2", "ln(1,2)", "Math.log(2)", "log(2)", "process.exit()", "ln.constructor(1)"])("%sを拒否する", expression => {
    expect(() => evaluateFormula(expression, {})).toThrow();
  });
  it("既存の閾値方式は維持し、数値出力のない不完全な定義を拒否する", () => {
    const binary = { ...rule, ruleDefinition: { type: "custom_formula", formula: "x * 2", formulaDescription: "test", variables: [{ field: "x", fieldLabel: "X" }], threshold: 5, positiveMessage: "above", negativeMessage: "below" }, applyConditions: [] } as LiteratureRule;
    expect(validateRuleDefinition(binary.ruleDefinition)).toBeNull();
    expect(runEngine([binary], { x: 3 }).results[0]).toMatchObject({ isPositive: true, prediction: "above", numericValue: 6 });
    expect(runEngine([binary], { x: 2 }).results[0]).toMatchObject({ isPositive: false, prediction: "below", numericValue: 4 });
    expect(validateRuleDefinition({ type: "custom_formula", formula: "1", variables: [] })).not.toBeNull();
  });
});
