import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  compileRuleDraft,
  compileApplyConditions,
  previewFields,
  previewRuleLines,
  record,
  type RuleDraft,
} from "../client/src/lib/ruleForm";
import {
  ApplyConditionsEditor,
  RuleDefinitionEditor,
  emptyRuleDraft,
} from "../client/src/components/RuleDefinitionEditor";
import { reviewLiterature } from "../scripts/lib/literature-review.mjs";
import { RULE_TYPES } from "../shared/ruleTypes";
import { runEngine } from "./ruleEngine";
import { applyConditionSchema } from "../shared/ruleValidation";
import type { LiteratureRule } from "../drizzle/schema";

const fixtures = fs
  .readdirSync(new URL("../docs/manual-ui-fixtures/", import.meta.url))
  .filter(name => /^L\d+-/.test(name))
  .map(
    name =>
      [
        name,
        JSON.parse(
          fs.readFileSync(
            new URL(`../docs/manual-ui-fixtures/${name}`, import.meta.url),
            "utf8"
          )
        ),
      ] as const
  );
const baseline = JSON.parse(
  fs.readFileSync(
    new URL("../scripts/local-literature.baseline.json", import.meta.url),
    "utf8"
  )
);
const inputs = {
  admission_age: 70,
  days_onset_to_admission: 17,
  admission_sit_up_independent: false,
  admission_bbs_score: 23,
  admission_fim_motor_total: 41,
  admission_fim_cognitive_total: 24,
};
const baseRule = {
  id: 1,
  name: "合成GUIテスト",
  ruleType: "cutoff",
  isActive: true,
  consensusEligible: true,
  applyConditions: [],
  ruleDefinition: {
    type: "cutoff",
    field: "bbs_score",
    fieldLabel: "BBS",
    operator: ">=",
    threshold: 20,
    positiveMessage: "支持",
    negativeMessage: "困難",
  },
} as unknown as LiteratureRule;

describe("文献登録フォームの既存データ互換性", () => {
  it.each(fixtures)(
    "%sの定義をプレビューしても設定を失わない",
    (_name, def) => {
      expect(compileRuleDraft(def)).toEqual(def);
    }
  );
  it("原著照合済みの決定木・スコア・Coxの文献情報と係数を保持する", () => {
    for (const id of [30003, 30004, 30005, 30006, 30007, 60006]) {
      const rule = reviewLiterature(
        baseline.find((row: LiteratureRule) => row.id === id)
      ) as LiteratureRule;
      const before = structuredClone(rule.ruleDefinition);
      const definition = compileRuleDraft(record(before));
      expect(definition).toEqual(before);
      expect(rule.ruleDefinition).toEqual(before);
      expect(
        runEngine(
          [{ ...rule, ruleDefinition: definition } as LiteratureRule],
          inputs
        )
      ).toEqual(runEngine([rule], inputs));
    }
  });
  it("すべてのルールタイプがフォームで選べ、未入力の数値を0で補わない", () => {
    for (const type of RULE_TYPES.filter(
      type => !["cutoff", "regression"].includes(type)
    )) {
      const draft = emptyRuleDraft(type);
      const html = renderToStaticMarkup(
        createElement(RuleDefinitionEditor, {
          value: JSON.stringify(draft),
          onChange: () => {},
        })
      );
      expect(html).not.toContain("&quot;type&quot;");
      expect(html).toContain("詳細編集（JSON）を開く");
      expect(() => compileRuleDraft(draft)).toThrow();
    }
  });
});

describe("GUIで登録する条件の評価", () => {
  it("病型を正の複数選択で限定し、未入力・その他を通さない", () => {
    const conditions = compileApplyConditions([
      {
        field: "stroke_type",
        operator: "in",
        value: ["脳梗塞", "脳出血"],
        label: "病型",
      },
    ]);
    const rule = { ...baseRule, applyConditions: conditions };
    for (const stroke_type of ["脳梗塞", "脳出血"])
      expect(
        runEngine([rule], { bbs_score: 25, stroke_type }).results[0].status
      ).toBe("evaluated");
    for (const stroke_type of ["くも膜下出血", "その他"])
      expect(
        runEngine([rule], { bbs_score: 25, stroke_type }).results[0].status
      ).toBe("outside");
    expect(runEngine([rule], { bbs_score: 25 }).results[0].status).toBe(
      "missing_input"
    );
    expect(
      renderToStaticMarkup(
        createElement(ApplyConditionsEditor, {
          value: conditions,
          onChange: () => {},
        })
      )
    ).toContain("脳出血");
    expect(
      compileApplyConditions(JSON.parse(JSON.stringify(conditions)))
    ).toEqual(conditions);
  });
  it("複数選択の除外とAND条件を維持し、空の選択肢を拒否する", () => {
    const conditions = compileApplyConditions([
      { field: "stroke_type", operator: "not_in", value: ["その他"] },
      { field: "age", operator: ">=", value: "65" },
    ]);
    const rule = { ...baseRule, applyConditions: conditions };
    expect(
      runEngine([rule], { age: 70, stroke_type: "脳出血", bbs_score: 25 })
        .results[0].isPositive
    ).toBe(true);
    expect(
      runEngine([rule], { age: 60, stroke_type: "脳出血", bbs_score: 25 })
        .results[0].status
    ).toBe("outside");
    expect(() =>
      compileApplyConditions([
        { field: "stroke_type", operator: "in", value: [] },
      ])
    ).toThrow("1つ以上");
    expect(
      applyConditionSchema.safeParse({
        field: "stroke_type",
        operator: "in",
        value: "脳梗塞",
      }).success
    ).toBe(false);
    expect(
      applyConditionSchema.safeParse({
        field: "stroke_type",
        operator: "==",
        value: ["脳梗塞"],
      }).success
    ).toBe(false);
  });
  it("0とfalseを未入力にせず、数値欄の空欄は保存しない", () => {
    expect(
      compileApplyConditions([
        { field: "age", operator: ">=", value: 0 },
        { field: "diabetes", operator: "==", value: false },
      ]).map(condition => condition.value)
    ).toEqual([0, false]);
    expect(() =>
      compileApplyConditions([{ field: "age", operator: ">=", value: "" }])
    ).toThrow("数値");
    expect(() =>
      compileApplyConditions([
        { field: "age", operator: ">=", value: Infinity },
      ])
    ).toThrow("数値");
  });
  it("スコア区分の順序と加点を保存し、重なる条件を勝手に並べ替えない", () => {
    const fixture = fixtures.find(([name]) =>
      name.includes("scoring_system")
    )![1];
    const definition = compileRuleDraft({
      ...fixture,
      threshold: "3",
      maxScore: "3",
    });
    const result = runEngine(
      [
        {
          ...baseRule,
          ruleType: "scoring_system",
          ruleDefinition: definition,
        } as LiteratureRule,
      ],
      { bbs_score: 20, mmse_score: 24 }
    ).results[0];
    expect(result).toMatchObject({ status: "evaluated", isPositive: true });
    expect(result.details.join(" ")).toContain("合計スコア: 3点");
  });
  it("決定木の参照切れ・循環と未定義の終端分類を保存しない", () => {
    const fixture = fixtures.find(([name]) =>
      name.includes("decision_tree")
    )![1];
    for (const target of ["missing", "root"]) {
      const draft = structuredClone(fixture);
      draft.nodes[0].trueNodeId = target;
      expect(() => compileRuleDraft(draft)).toThrow("決定木");
    }
    const draft = structuredClone(fixture);
    delete draft.nodes.find((node: RuleDraft) => node.isLeaf).isPositive;
    expect(() => compileRuleDraft(draft)).toThrow("決定木");
  });
  it("カテゴリ変換・確率の閾値・原文注記を保持して計算する", () => {
    const draft = {
      type: "logistic_regression",
      outputMode: "binary",
      intercept: "-2",
      probabilityThreshold: 0.7,
      variables: [
        {
          field: "sex",
          coefficient: "1",
          categoryMap: { 男性: "0", 女性: "1" },
          notes: "原著の参照カテゴリ",
        },
      ],
      positiveMessage: "支持",
      negativeMessage: "困難",
      notes: "原著の注記",
    };
    const definition = compileRuleDraft(draft);
    const result = runEngine(
      [
        {
          ...baseRule,
          ruleType: "logistic_regression",
          ruleDefinition: definition,
        } as LiteratureRule,
      ],
      { sex: "女性" }
    ).results[0];
    expect(result).toMatchObject({
      isPositive: false,
      probability: expect.closeTo(1 / (1 + Math.exp(1))),
    });
    expect(definition.notes).toBe(draft.notes);
    expect(previewRuleLines(definition).join(" ")).toContain("70%");
    expect(() => compileRuleDraft({ ...draft, intercept: "" })).toThrow("切片");
  });
  it("Coxの参考登録に切片や係数を作らず、必要項目と原文参照を案内する", () => {
    const draft = emptyRuleDraft("nomogram");
    draft.variables = [{ field: "admission_age", fieldLabel: "入院時年齢" }];
    const def = compileRuleDraft(draft);
    expect(def.intercept).toBeUndefined();
    expect(previewFields(def)).toEqual(["admission_age"]);
    expect(previewRuleLines(def).join(" ")).toContain("原文確認");
  });
  it("複合条件の日本語プレビューにOR・NOT・必要項目を反映する", () => {
    const fixture = fixtures.find(([name]) =>
      name.includes("composite_rule")
    )![1];
    const def = compileRuleDraft(fixture);
    expect(previewFields(def)).toEqual(["bbs_score", "mmse_score", "diabetes"]);
    expect(previewRuleLines(def).join(" ")).toContain("または");
    expect(previewRuleLines(def).join(" ")).toContain("満たさない");
  });
});
