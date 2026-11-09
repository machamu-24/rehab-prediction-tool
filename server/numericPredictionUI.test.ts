import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiteratureResults } from "../client/src/pages/PredictPage";
import { NumericPredictionValue } from "../client/src/components/NumericPredictionResults";
import { createJeongRule } from "../scripts/lib/jeong-2014.mjs";
import { createIkeueRules } from "../scripts/lib/ikeue-2026.mjs";
import { createFukudaRule } from "../scripts/lib/fukuda-2025.mjs";
import type { LiteratureRule } from "../drizzle/schema";
import { readContinuousOutput } from "../shared/resultStatus";
import { runEngine } from "./ruleEngine";

const rule = { ...createJeongRule(4), id: 1 } as unknown as LiteratureRule;
const input = {
  admission_ward_type: "回復期リハビリテーション病棟",
  admission_age: 70,
  admission_complication: false,
  days_onset_to_admission: 34,
  admission_gcs: 15,
  prestroke_mrs: 1,
  admission_fim_motor_total: 41,
  admission_fim_cognitive_total: 24,
};
const renderSummary = (results: ReturnType<typeof runEngine>["results"]) =>
  renderToStaticMarkup(createElement(LiteratureResults, { results }));

describe("数値アウトカムの照合結果UI", () => {
  it.each([3.49, 3.5, undefined])("FIM運動では連続値の下にFukuda分類を表示し、Alb=%sの境界・入力不足を維持する", albumin => {
    const numeric = { ...createIkeueRules(2)[0], id: 60014 } as unknown as LiteratureRule;
    const fukuda = { ...createFukudaRule(2), id: 60016 } as unknown as LiteratureRule;
    const inputs = { admission_ward_type: "回復期リハビリテーション病棟", stroke_type: "脳梗塞", first_stroke: true, hemiparesis_present: true, stroke_onset_concurrent_disease: false, admission_age: 75, days_onset_to_admission: 40, admission_bbs_score: 14, admission_fim_motor_total: 30, admission_fim_cognitive_total: 20, admission_fim_total: 50, admission_brs_upper: 3, ...(albumin === undefined ? {} : { admission_albumin_g_dl: albumin }) };
    // Deliberately pass Fukuda first to verify display order independently of DB order.
    const output = runEngine([fukuda, numeric], inputs);
    const html = renderToStaticMarkup(createElement(LiteratureResults, { results: output.results, outcomeName: "FIM運動項目" }));
    expect(html.indexOf("数値予測の照合結果")).toBeLessThan(html.indexOf("運動FIMの到達分類"));
    expect(html).toContain("発症90日後の運動FIM 62点以上");
    expect(html).not.toContain("文献照合サマリー");
    expect(html).not.toContain("目標アウトカムを支持");
    expect(output.consensus.totalEligible).toBe(0);
    if (albumin === undefined) expect(html).toContain("不足している評価項目");
    else {
      expect(html).toContain(albumin >= 3.5 ? "&gt;61点達成を示唆" : "&gt;61点非達成を示唆");
      expect(html).toContain("分類結果");
    }
  });
  it("FIMを1つのカードに統合し、点数と折りたたんだ根拠・計算詳細を表示する", () => {
    const output = runEngine([rule], input);
    expect(output.results[0]).toMatchObject({
      outputMode: "continuous",
      outputUnit: "点",
    });
    const html = renderSummary(output.results);
    expect(html).toContain("数値予測の照合結果");
    expect(html).toContain("92.15");
    expect(html).toContain("点");
    expect(html).toContain("130.7");
    expect(html).not.toContain("目標アウトカムを支持");
    expect(html).not.toContain("達成困難");
    expect(html).not.toContain("予測確率");
    expect(html).not.toContain("集計に含める場合");
    expect(html).toContain("研究集団の平均値・中央値");
    expect(html).not.toContain("数値予測サマリー");
    expect(html).not.toContain("該当文献の照合結果");
    expect(html.match(/<article\b/g)).toHaveLength(1);
    expect(html.match(/根拠・計算詳細/g)).toHaveLength(1);
    expect(html).toMatch(
      /<details[^>]*><summary[^>]*>根拠・計算詳細<\/summary>/
    );
    expect(html).not.toMatch(/<details[^>]*\bopen[=> ]/);
    expect(html).toContain("切片: 33.04");
    expect(html).toContain("70 × -0.34");
    expect(html).toContain(rule.sourceUrl);
    expect(html).toContain("文献の要点・適用対象");
    expect(output.consensus.totalEligible).toBe(0);
  });

  it.each([
    [{}, "missing_input", "入力不足"],
    [{ ...input, admission_ward_type: "急性期病棟" }, "outside", "適用条件外"],
  ])("予測不能でも連続変数用の表示を維持する", (values, status, label) => {
    const output = runEngine([rule], values);
    expect(output.results[0]).toMatchObject({
      outputMode: "continuous",
      status,
    });
    const html = renderSummary(output.results);
    expect(html).toContain("数値予測の照合結果");
    expect(html).toContain(label);
    expect(html).toContain("算出できた予測値はありません");
    expect(html).not.toContain("目標アウトカムを支持");
    expect(html).toContain(output.results[0].unavailableReason);
    expect(html.match(/<article\b/g)).toHaveLength(1);
    expect(html).not.toContain("該当文献の照合結果");
  });

  it("複数の点数は平均せず文献別に表示する", () => {
    const second = structuredClone(rule);
    second.id = 2;
    second.name = "別の数値モデル";
    (second.ruleDefinition as { intercept: number }).intercept += 10;
    const html = renderSummary(runEngine([rule, second], input).results);
    expect(html).toContain(rule.name);
    expect(html).toContain(second.name);
    expect(html).toContain("92.15");
    expect(html).toContain("102.15");
    expect(html).not.toContain("97.15");
    expect(html.match(/<article\b/g)).toHaveLength(2);
    expect(html.match(/根拠・計算詳細/g)).toHaveLength(2);
  });

  it("二値分類と研究内割合を数値アウトカムと混同せず、混在時も分類を表示する", () => {
    const numeric = runEngine([rule], input).results[0];
    const binary = {
      ...numeric,
      ruleId: 2,
      ruleName: "FIM歩行自立",
      outputMode: undefined,
      isPositive: true,
      numericValue: 6,
      consensusEligible: true,
    };
    const descriptive = {
      ...binary,
      ruleId: 3,
      isPositive: null,
      probability: 0.5,
      numericValue: null,
    };
    const binaryHtml = renderSummary([binary, descriptive]);
    expect(binaryHtml).not.toContain("数値予測の照合結果");
    expect(binaryHtml).toContain("目標アウトカムを支持");
    expect(binaryHtml).toContain("参考結果");
    expect(binaryHtml).toContain("必要な評価項目はそろっており");
    expect(binaryHtml).not.toContain("数値予測・研究内割合</p>");
    const mixedHtml = renderSummary([numeric, binary]);
    expect(mixedHtml).toContain("数値予測の照合結果");
    expect(mixedHtml).toContain("目標アウトカムを支持");
    expect(
      readContinuousOutput({ type: "regression", outputMode: "binary" })
    ).toBeNull();
    expect(
      readContinuousOutput({ type: "decision_tree", outputMode: "descriptive" })
    ).toBeNull();
  });

  it("ゼロ・範囲外の推定値を丸め込みや上限補正せず、旧履歴の欠落値をゼロにしない", () => {
    for (const [numericValue, text] of [
      [0, "0.00"],
      [154.82, "154.82"],
    ] as const) {
      expect(
        renderToStaticMarkup(
          createElement(NumericPredictionValue, {
            result: { numericValue, outputUnit: "点", prediction: null },
          })
        )
      ).toContain(text);
    }
    const html = renderToStaticMarkup(
      createElement(NumericPredictionValue, {
        result: {
          numericValue: null,
          outputUnit: "点",
          prediction: "予測値: 72.52点",
        },
      })
    );
    expect(html).toContain("予測値: 72.52点");
    expect(html).not.toContain("0.00");
  });
});
