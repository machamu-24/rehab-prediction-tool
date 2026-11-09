import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getResultDisplayStatus,
  getExclusionReasonLabel,
  getResultStatus,
  isConsensusResult,
} from "../shared/resultStatus";
import {
  LiteratureSummary,
  LiteratureResults,
} from "../client/src/pages/PredictPage";
import type { RuleEvaluationResult } from "../shared/ruleEngine";
import { runEngine } from "./ruleEngine";
import type { LiteratureRule } from "../drizzle/schema";
import type { LiteratureTimeline } from "../shared/literatureTimeline";

describe("参考結果の表示分類", () => {
  const evaluated = {
    isApplicable: true,
    isPositive: true,
    consensusEligible: true,
    status: "evaluated",
  };

  it("期間等による集計対象外と数値・研究内割合を同じ参考結果として表示する", () => {
    const reference = { ...evaluated, consensusEligible: false };
    const descriptive = { ...evaluated, isPositive: null };
    expect(getResultDisplayStatus(reference)).toBe("reference");
    expect(getResultDisplayStatus(descriptive)).toBe("reference");
    // Only presentation changes; neither result enters the binary consensus.
    expect(isConsensusResult(reference)).toBe(false);
    expect(isConsensusResult(descriptive)).toBe(false);
    expect(getResultStatus(descriptive)).toBe("estimate");
    const html = renderToStaticMarkup(
      createElement(LiteratureSummary, {
        results: [reference, descriptive] as RuleEvaluationResult[],
      })
    );
    expect(html).toMatch(/参考結果<\/p><p[^>]*>2件<\/p>/);
    expect(html).toContain("対象期間・時点の違いや不明点");
    expect(html).toContain("支持・困難の集計には含めず");
  });

  it("支持・困難を維持し、入力不足・条件外は表示上の判定対象外にまとめる", () => {
    expect(getResultDisplayStatus(evaluated)).toBe("supports");
    expect(getResultDisplayStatus({ ...evaluated, isPositive: false })).toBe(
      "against"
    );
    expect(
      getResultDisplayStatus({
        ...evaluated,
        isApplicable: false,
        status: "missing_input",
      })
    ).toBe("excluded");
    expect(
      getResultDisplayStatus({
        ...evaluated,
        isApplicable: false,
        status: "outside",
      })
    ).toBe("excluded");
    expect(
      getResultStatus({
        ...evaluated,
        isApplicable: false,
        status: "missing_input",
      })
    ).toBe("unknown");
    expect(
      getResultStatus({ ...evaluated, isApplicable: false, status: "outside" })
    ).toBe("outside");
  });

  it.each([
    ["missing_input", "入力不足"],
    ["outside", "条件不一致"],
    ["unsupported", "計算未対応"],
    ["invalid_definition", "文献設定の不備"],
    ["calculation_error", "計算エラー"],
    [undefined, "理由未記録"],
  ])("対象外の理由を区別する: %s", (status, label) => {
    expect(getExclusionReasonLabel({ status })).toBe(label);
  });

  it("対象外を合計し、文献別の理由・不足項目を初期状態で閉じた詳細に表示する", () => {
    const results = ["missing_input", "outside", "unsupported"].map(
      (status, i) => ({
        ...evaluated,
        ruleId: i + 1,
        ruleName: `対象外文献${i + 1}`,
        isApplicable: false,
        isPositive: null,
        status,
        missingFields: status === "missing_input" ? ["bbs_score"] : [],
        unavailableReason:
          status === "outside"
            ? "評価時点が照合範囲外です。"
            : "モデル計算に必要な定義が不足しています。",
        literatureSummary: {
          overview: null,
          targetPopulation: null,
          predictors: [],
          clinicalNote: null,
        },
      })
    ) as RuleEvaluationResult[];
    const summary = renderToStaticMarkup(
      createElement(LiteratureSummary, { results })
    );
    expect(summary).toMatch(/判定対象外<\/p><p[^>]*>3件<\/p>/);
    expect(summary).not.toContain("判定不可");
    expect(summary).not.toContain("適用条件外");
    const html = renderToStaticMarkup(
      createElement(
        LiteratureResults,
        { results },
        createElement("p", null, "追加評価の提案")
      )
    );
    expect(html.match(/<details\b/g)).toHaveLength(1);
    expect(html).toMatch(/<details[^>]*><summary[^>]*>[\s\S]*?判定対象外/);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
    for (const label of [
      "入力不足",
      "条件不一致",
      "計算未対応",
      "対象外文献1",
      "対象外文献2",
      "対象外文献3",
      "BBS / FBS（Berg / Functional Balance Scale）",
      "評価時点が照合範囲外です。",
      "再照合できます",
    ]) {
      expect(html).toContain(label);
    }
    expect(html.indexOf("文献照合サマリー")).toBeLessThan(
      html.indexOf("追加評価の提案")
    );
    expect(html.indexOf("追加評価の提案")).toBeLessThan(
      html.indexOf("該当文献の照合結果")
    );
  });

  it.each([false, true])("全件が平均値=%sでも支持・困難と時期確認件数を分けて表示する", allMean => {
    const points = [
      { value: 30, unit: "day", precision: allMean ? "mean" : "exact", originalText: "回復期入院時", basis: "合成テスト" },
      { value: 90, unit: "day", precision: allMean ? "mean" : "exact", originalText: "退院時", basis: "合成テスト" },
    ] as const;
    const rules = [
      [30, 90, 20], [28, 92, 20], [32, 95, 40],
    ].map(([evaluationDay, targetDay, threshold], i) => ({
      id: i + 1, outcomeId: 1, name: `合成文献${i + 1}`,
      source: "合成テスト", evidenceLevel: "Other", ruleType: "cutoff",
      isActive: true, consensusEligible: true, applyConditions: [],
      ruleDefinition: {
        type: "cutoff", field: "bbs_score", fieldLabel: "BBS", operator: ">=", threshold,
        positiveMessage: "支持", negativeMessage: "困難",
        timeline: {
          version: 1, anchor: "stroke_onset", kind: "future",
          evaluation: { ...points[0], value: evaluationDay, precision: i > 0 ? "mean" : points[0].precision },
          target: { ...points[1], value: targetDay, precision: i > 0 ? "median" : points[1].precision },
        } satisfies LiteratureTimeline,
      },
    })) as LiteratureRule[];
    const output = runEngine(rules, { bbs_score: 30 }, {
      kind: "future",
      evaluation: { value: 30, unit: "day", precision: "exact" },
      target: { value: 90, unit: "day", precision: "exact" },
    });
    expect(output.consensus).toMatchObject({ positiveCount: 2, negativeCount: 1, totalEligible: 3 });
    const summary = renderToStaticMarkup(createElement(LiteratureSummary, { results: output.results }));
    expect(summary).toContain(`支持・困難の集計対象：3件 ／ うち評価時期の確認：${allMean ? 3 : 2}件`);
    expect(summary).toMatch(/目標アウトカムを支持<\/p><p[^>]*>2件<\/p>/);
    expect(summary).toMatch(/目標アウトカムの達成困難を示唆<\/p><p[^>]*>1件<\/p>/);
    const html = renderToStaticMarkup(createElement(LiteratureResults, { results: output.results }));
    expect(html).toContain("評価時点：");
    expect(html).toContain("アウトカム測定時点：");
    expect(html).toContain("回復期入院時");
    expect(html).toContain("退院時");
    expect(html).toContain("発症後28日・平均");
    expect(html).toContain("発症後95日・中央値");
    expect(html).toContain("評価時期の確認");
  });

  it("過去の参考扱いという保存結果を、新しい集計対象へ読み替えない", () => {
    const saved = { ...evaluated, consensusEligible: false, timeMatch: { status: "reference", reason: "保存時の参考判定" } };
    expect(getResultDisplayStatus(saved)).toBe("reference");
    expect(isConsensusResult(saved)).toBe(false);
  });

  it("FIMなどの連続値アウトカムは専用の数値予測表示を維持する", () => {
    expect(
      getResultDisplayStatus({
        ...evaluated,
        isPositive: null,
        outputMode: "continuous",
      })
    ).toBe("estimate");
  });
});
