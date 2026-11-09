import { PATIENT_FIELDS, type FieldDef } from "./patientFields";
import { readNomogramReference } from "@shared/ruleAvailability";
import {
  applyConditionSchema,
  validateRuleDefinition,
} from "@shared/ruleValidation";

export type RuleDraft = Record<string, unknown>;
export const record = (value: unknown): RuleDraft =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RuleDraft)
    : {};
export const rows = (value: unknown): RuleDraft[] =>
  Array.isArray(value) ? value.map(record) : [];
export const fieldOptions: FieldDef[] = [
  ...new Map(
    [
      ...PATIENT_FIELDS.flatMap(section => section.fields),
      { key: "nihss", label: "NIHSS", type: "number" },
      { key: "fbs_score", label: "FBS", type: "number" },
      { key: "fim_motor", label: "FIM運動（旧項目）", type: "number" },
      { key: "fim_cognitive", label: "FIM認知（旧項目）", type: "number" },
      {
        key: "days_post_stroke",
        label: "発症後日数（旧項目）",
        type: "number",
      },
    ].map(field => [field.key, field])
  ).values(),
];
export const fieldInfo = (key: unknown) =>
  fieldOptions.find(field => field.key === key);
export const fieldName = (key: unknown) =>
  fieldInfo(key)?.label ?? String(key ?? "未選択");
export function describeCondition(node: RuleDraft, value = node.value): string {
  const name = String(node.fieldLabel || node.label || fieldName(node.field));
  const labels = fieldInfo(node.field)?.booleanLabels;
  if (node.operator === "boolean")
    return `${name}：${labels?.true || "あり・該当する"}`;
  if (node.operator === "boolean_negative")
    return `${name}：${labels?.false || "なし・該当しない"}`;
  if (node.operator === "in" || node.operator === "not_in")
    return `${name}：${Array.isArray(value) ? value.join(" または ") : "未選択"}${node.operator === "not_in" ? "を除く" : "のいずれか"}`;
  const names: Record<string, string> = {
    ">=": "以上",
    ">": "超",
    "<=": "以下",
    "<": "未満",
    "==": "と等しい",
    equals: "と等しい",
    "!=": "と等しくない",
  };
  const comparison =
    typeof value === "boolean"
      ? value
        ? labels?.true || "あり"
        : labels?.false || "なし"
      : String(value ?? "");
  return `${name}：${comparison} ${names[String(node.operator)] || node.operator}`;
}
export const isReferenceDraft = (def: RuleDraft) =>
  def.type === "nomogram" &&
  (record(def.evidenceReview).status === "blocked" ||
    Boolean(def.modelType && def.modelType !== "logistic"));

export function requiredNumber(value: unknown, label: string): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    String(value).trim() === "" ||
    !Number.isFinite(Number(value))
  )
    throw new Error(`${label}を数値で入力してください`);
  return Number(value);
}

export function conditionValue(
  field: unknown,
  value: unknown,
  operator: unknown
): unknown {
  if (operator === "boolean" || operator === "boolean_negative")
    return typeof value === "boolean" ? value : true;
  if (operator === "in" || operator === "not_in") {
    if (!Array.isArray(value) || !value.length)
      throw new Error(`${fieldName(field)}の対象を1つ以上選択してください`);
    return value.map(item => conditionValue(field, item, "=="));
  }
  const info = fieldInfo(field);
  if (info?.type === "boolean") {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    throw new Error(`${info.label}の有無を選択してください`);
  }
  if (info?.type === "select") {
    if (typeof value !== "string" || !value.trim())
      throw new Error(`${info.label}の値を選択してください`);
    return value;
  }
  if (
    info?.type === "number" ||
    ["<=", ">=", "<", ">"].includes(String(operator))
  )
    return requiredNumber(value, fieldName(field));
  if (value === "" || value === undefined)
    throw new Error(`${fieldName(field)}の値を入力してください`);
  return value;
}

export function compileApplyConditions(drafts: readonly RuleDraft[]) {
  return drafts.map(draft => {
    const condition = {
      ...draft,
      value: conditionValue(draft.field, draft.value, draft.operator),
    };
    const parsed = applyConditionSchema.safeParse(condition);
    if (!parsed.success)
      throw new Error(
        `適用条件「${fieldName(draft.field)}」：${parsed.error.issues[0].message}`
      );
    return parsed.data;
  });
}

/** Convert only editable numeric fields; retain all literature metadata. */
export function compileRuleDraft(draft: RuleDraft, validate = true): RuleDraft {
  const def = structuredClone(draft);
  const numeric = (obj: RuleDraft, key: string, label: string) => {
    obj[key] = requiredNumber(obj[key], label);
  };
  const predicate = (obj: RuleDraft, field: unknown, key = "value") => {
    if (!["boolean", "boolean_negative"].includes(String(obj.operator)))
      obj[key] = conditionValue(field, obj[key], obj.operator);
  };
  if (def.type === "logistic_regression" || def.type === "nomogram") {
    const reference = isReferenceDraft(def);
    if (!reference || def.intercept !== undefined)
      numeric(def, "intercept", "切片");
    def.variables = rows(def.variables).map((variable, index) => {
      if (!reference || variable.coefficient !== undefined)
        numeric(variable, "coefficient", `評価項目${index + 1}の係数`);
      if (variable.categoryMap)
        variable.categoryMap = Object.fromEntries(
          Object.entries(record(variable.categoryMap)).map(([key, value]) => [
            key,
            requiredNumber(
              value,
              `${fieldName(variable.field)}・${key}の変換値`
            ),
          ])
        );
      return variable;
    });
    if (
      !reference &&
      def.outputMode !== "probability" &&
      !(
        def.type === "nomogram" &&
        def.outputMode === undefined &&
        def.probabilityThreshold === undefined
      )
    )
      numeric(def, "probabilityThreshold", "文献に基づく確率の判定閾値");
  }
  if (def.type === "cutoff" && def.secondaryConditions)
    def.secondaryConditions = rows(def.secondaryConditions).map(condition => {
      predicate(condition, condition.field);
      return condition;
    });
  if (def.type === "scoring_system") {
    numeric(def, "threshold", "合計点の判定閾値");
    numeric(def, "maxScore", "満点");
    def.items = rows(def.items).map(item => ({
      ...item,
      bands: rows(item.bands).map(band => {
        predicate(band, item.field);
        numeric(band, "score", "加点");
        return band;
      }),
    }));
  }
  if (def.type === "decision_tree")
    def.nodes = rows(def.nodes).map(node => {
      if (node.isLeaf) {
        if (node.probability !== undefined)
          numeric(node, "probability", "研究内の群別割合");
      } else predicate(node, node.field, "threshold");
      return node;
    });
  const compileLogic = (value: unknown, depth = 0): RuleDraft => {
    if (depth > 64) throw new Error("条件の入れ子が深すぎます");
    const node = record(value);
    if (node.logic === "CONDITION") predicate(node, node.field);
    else if (node.logic === "NOT")
      node.child = compileLogic(node.child, depth + 1);
    else
      node.children = rows(node.children).map(child =>
        compileLogic(child, depth + 1)
      );
    return node;
  };
  if (def.type === "composite_rule") def.root = compileLogic(def.root);
  if (def.type === "custom_formula" && def.outputMode !== "continuous")
    numeric(def, "threshold", "判定閾値");
  if (validate) {
    const error = validateRuleDefinition(def);
    if (error) throw new Error(error);
  }
  return def;
}

export function previewRuleLines(def: RuleDraft): string[] {
  const reference = readNomogramReference(def);
  if (reference)
    return [
      "参考文献として表示します（自動計算なし・原文確認）。",
      reference.reason,
      "支持・困難の集計とその分母には含めません。",
    ];
  const condition = describeCondition;
  if (def.type === "logistic_regression" || def.type === "nomogram")
    return [
      `切片：${def.intercept}`,
      ...rows(def.variables).map(
        variable =>
          `${variable.fieldLabel || fieldName(variable.field)} × ${variable.coefficient}${
            variable.categoryMap
              ? `（カテゴリ変換：${Object.entries(record(variable.categoryMap))
                  .map(([key, value]) => `${key}→${value}`)
                  .join("、")}）`
              : ""
          }`
      ),
      def.outputMode === "probability"
        ? "確率のみを表示し、支持・困難に分類しません。"
        : `確率 ${Number(def.probabilityThreshold) * 100}% 以上：${def.positiveMessage}／未満：${def.negativeMessage}`,
    ];
  if (def.type === "scoring_system")
    return [
      "各評価項目で、上から最初に満たした条件の点数を加算します。",
      ...rows(def.items).flatMap(item =>
        rows(item.bands).map(
          band =>
            `${condition({ ...band, field: item.field, fieldLabel: item.fieldLabel })} → ${band.score}点（${band.label}）`
        )
      ),
      `合計 ${def.threshold}点以上：${def.positiveMessage}／未満：${def.negativeMessage}（満点${def.maxScore}点）`,
    ];
  if (def.type === "decision_tree") {
    const nodes = rows(def.nodes);
    const name = (id: unknown) => {
      const index = nodes.findIndex(node => node.id === id);
      return index < 0 ? "未選択" : `${index + 1}番`;
    };
    return [
      "1番から開始し、条件に従って分岐します。",
      ...nodes.map((node, index) =>
        node.isLeaf
          ? `${index + 1}番：${node.message || "結果"}${node.probability !== undefined ? `（研究内割合${Number(node.probability) * 100}%）` : ""}／${node.isPositive === true ? "支持" : node.isPositive === false ? "困難" : "判定保留・割合のみ"}`
          : `${index + 1}番：${condition(node, node.threshold)} → 満たす：${name(node.trueNodeId)}／満たさない：${name(node.falseNodeId)}`
      ),
    ];
  }
  if (def.type === "composite_rule") {
    const describe = (value: unknown, depth = 0): string => {
      if (depth > 64) throw new Error("条件の入れ子が深すぎます");
      const node = record(value);
      if (node.logic === "CONDITION") return condition(node);
      if (node.logic === "NOT")
        return `「${describe(node.child, depth + 1)}」を満たさない`;
      return `（${rows(node.children)
        .map(child => describe(child, depth + 1))
        .join(node.logic === "OR" ? " または " : " かつ ")}）`;
    };
    return [
      describe(def.root),
      `満たす：${def.positiveMessage}／満たさない：${def.negativeMessage}`,
    ];
  }
  if (def.type === "custom_formula")
    return [
      String(def.formulaDescription || "文献に記載された数式"),
      String(def.formula),
      def.outputMode === "continuous"
        ? `数値予測（${def.outputUnit || "単位未指定"}）。支持・困難の集計には含めません。`
        : `判定閾値：${def.threshold}`,
    ];
  return [];
}

export function previewFields(def: RuleDraft): string[] {
  const reference = readNomogramReference(def);
  if (reference) return reference.variables.map(variable => variable.field);
  const fields = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (depth > 64) throw new Error("ルールが複雑すぎます");
    if (!value || typeof value !== "object") return;
    const obj = record(value);
    if (typeof obj.field === "string" && obj.field) fields.add(obj.field);
    if (Array.isArray(value)) value.forEach(child => visit(child, depth + 1));
    else
      for (const key of [
        "variables",
        "coefficients",
        "items",
        "nodes",
        "children",
        "child",
        "root",
        "secondaryConditions",
      ])
        visit(obj[key], depth + 1);
  };
  visit(def);
  return [...fields];
}
