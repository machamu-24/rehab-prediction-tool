import { isConsensusResult, readContinuousOutput } from "../shared/resultStatus";
import { getRuleExclusionReason } from "../shared/ruleAvailability";
import {
  matchTimeline,
  type TimeQuery,
  type TimeMatch,
  readTimeline,
  type LiteratureTimeline,
} from "../shared/literatureTimeline";
import { patientInputsSchema } from "../shared/patientValidation";
import { koyamaInputReason, koyamaResultTimeline, matchKoyamaTime } from "../shared/koyama";
/**
 * 文献ベースルールエンジン
 *
 * 対応ルールタイプ:
 *   1. cutoff          - カットオフ値（単一・複合条件）
 *   2. decision_tree   - 決定木
 *   3. regression      - 重回帰式
 *   4. scoring_system  - スコアリングシステム
 *   5. logistic_regression - ロジスティック回帰（確率算出）
 *      nomogram        - ノモグラム（ロジスティック回帰ベース確率算出）
 *   6. composite_rule  - 複合条件（AND/OR/NOT）
 *   7. custom_formula  - カスタム数式
 */

import {
  applyConditionSchema,
  validateRuleDefinition,
} from "../shared/ruleValidation";
import { evaluateFormula } from "./formula";

import type {
  LiteratureRule,
  PatientInputs,
  ApplyCondition,
  RuleDefinition,
  CutoffRuleDefinition,
  DecisionTreeRuleDefinition,
  DecisionTreeNode,
  RegressionRuleDefinition,
  ScoringSystemRuleDefinition,
  NomogramRuleDefinition,
  LogisticRegressionRuleDefinition,
  CompositeRuleDefinition,
  LogicNode,
  CustomFormulaRuleDefinition,
} from "../drizzle/schema";

// ============================================================
// 出力型定義
// ============================================================

export type EvaluationStatus =
  | "evaluated"
  | "missing_input"
  | "outside"
  | "unsupported"
  | "invalid_definition"
  | "calculation_error";

export type RuleEvaluationResult = {
  timeline?: LiteratureTimeline | null;
  timeMatch?: TimeMatch;
  status: EvaluationStatus;
  missingFields: string[];
  numericValue: number | null;
  outputMode?: "continuous";
  outputUnit?: string | null;
  ruleId: number;
  ruleName: string;
  ruleType: string;
  source: string;
  sourceUrl: string | null;
  evidenceLevel: string;
  literatureSummary: LiteratureSummary;
  matchExplanation: string[];
  consensusEligible: boolean;
  isApplicable: boolean;
  unavailableReason: string | null;
  isPositive: boolean | null;
  prediction: string | null;
  probability: number | null;
  details: string[];
  accuracy: number | null;
  sensitivity: number | null;
  specificity: number | null;
  auc: number | null;
};

export type LiteratureSummary = {
  overview: string | null;
  targetPopulation: string | null;
  predictors: string[];
  clinicalNote: string | null;
};

export type ConsensusAnalysis = {
  score: number | null;
  label: "positive" | "neutral" | "negative" | "unavailable";
  positiveCount: number;
  negativeCount: number;
  totalEligible: number;
  applicableCount: number;
};

export type SuggestionItem = {
  ruleId: number;
  ruleName: string;
  missingFields: string[];
  outcome: string;
  reason: "missing_input" | "time_condition";
};

export type EngineOutput = {
  results: RuleEvaluationResult[];
  consensus: ConsensusAnalysis;
  suggestions: SuggestionItem[];
};

// ============================================================
// 共通ユーティリティ
// ============================================================

function getVal(inputs: PatientInputs, field: string): unknown {
  return inputs[field];
}

function numVal(inputs: PatientInputs, field: string): number {
  const value = inputs[field];
  if (
    (typeof value !== "number" && typeof value !== "boolean") ||
    !Number.isFinite(Number(value))
  ) {
    throw new Error(`項目「${field}」には有限の数値が必要です`);
  }
  return Number(value);
}

function compareOp(
  val: unknown,
  operator: string,
  threshold: number | string | boolean | undefined
): boolean {
  if (
    ["<=", ">=", "<", ">"].includes(operator) &&
    ((typeof val !== "number" && typeof val !== "boolean") ||
      !Number.isFinite(Number(val)) ||
      (typeof threshold !== "number" && typeof threshold !== "boolean") ||
      !Number.isFinite(Number(threshold)))
  ) {
    throw new Error("比較する値の型・範囲が不正です");
  }
  if (operator.startsWith("boolean") && typeof val !== "boolean")
    throw new Error("有無の入力が不正です");
  const n = Number(val);
  const t = Number(threshold);
  switch (operator) {
    case "<=":
      return n <= t;
    case ">=":
      return n >= t;
    case "<":
      return n < t;
    case ">":
      return n > t;
    case "equals":
    case "==":
      return val === threshold;
    case "!=":
      return val !== threshold;
    case "boolean":
      return Boolean(val);
    case "boolean_negative":
      return !Boolean(val);
    default:
      throw new Error("未対応の比較演算子です");
  }
}

/**
 * 適用条件（前提条件）を評価する
 */
function checkApplyConditions(
  conditions: ApplyCondition[],
  inputs: PatientInputs
): { ok: boolean; reason: string | null } {
  for (const cond of conditions) {
    const v = getVal(inputs, cond.field);
    if (v === undefined || v === null || v === "") {
      return {
        ok: false,
        reason: `適用条件の評価に必要な項目「${cond.label ?? cond.field}」が未入力です。`,
      };
    }
    if (!compareOp(v, cond.operator, cond.value as number)) {
      return {
        ok: false,
        reason: `適用条件: ${cond.label ?? cond.field} ${cond.operator} ${cond.value}（現在値: ${v}）のため適用外です。`,
      };
    }
  }
  return { ok: true, reason: null };
}

/**
 * ルール定義から必要フィールドを抽出する（外部公開用ラッパー）
 */
export function extractRequiredFieldsFromDef(
  def: RuleDefinition | null | undefined
): string[] {
  if (!def) return [];
  try {
    return extractRequiredFields(def);
  } catch {
    return [];
  }
}
function extractRequiredFields(def: RuleDefinition): string[] {
  switch (def.type) {
    case "cutoff": {
      const fields = [def.field];
      if (def.secondaryConditions)
        fields.push(...def.secondaryConditions.map(c => c.field));
      return fields;
    }
    case "decision_tree": {
      if (!Array.isArray(def.nodes)) return [];
      const fieldSet = new Set(
        def.nodes.filter(n => !n.isLeaf).map(n => n.field)
      );
      return Array.from(fieldSet);
    }
    case "regression":
      return def.coefficients.map(c => c.field);
    case "scoring_system":
      return def.items.map(i => i.field);
    case "logistic_regression":
    case "nomogram":
      return def.variables.map(v => v.field);
    case "composite_rule":
      if (!def.root) return [];
      return extractFieldsFromLogicNode(def.root);
    case "custom_formula":
      return def.variables.map(v => v.field);
    default:
      return [];
  }
}

function extractFieldsFromLogicNode(node: LogicNode): string[] {
  if (node.logic === "CONDITION") return [node.field];
  if (node.logic === "NOT") return extractFieldsFromLogicNode(node.child);
  return node.children.flatMap(extractFieldsFromLogicNode);
}

type RuleDefinitionMetadata = RuleDefinition & {
  description?: unknown;
  notes?: unknown;
  usageExample?: unknown;
  formula?: unknown;
};

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map(v => v.trim()).filter(Boolean)));
}

function extractPredictorLabels(def: RuleDefinition): string[] {
  switch (def.type) {
    case "cutoff":
      return uniqueNonEmpty([
        def.fieldLabel || def.field,
        ...(def.secondaryConditions?.map(c => c.fieldLabel || c.field) ?? []),
      ]);
    case "decision_tree":
      return uniqueNonEmpty(
        def.nodes
          .filter(node => !node.isLeaf)
          .map(node => node.fieldLabel || node.field)
      );
    case "regression":
      return uniqueNonEmpty(
        def.coefficients.map(coef => coef.fieldLabel || coef.field)
      );
    case "scoring_system":
      return uniqueNonEmpty(
        def.items.map(item => item.fieldLabel || item.field)
      );
    case "logistic_regression":
    case "nomogram":
      return uniqueNonEmpty(
        def.variables.map(variable => variable.fieldLabel || variable.field)
      );
    case "composite_rule":
      return def.root
        ? uniqueNonEmpty(extractLabelsFromLogicNode(def.root))
        : [];
    case "custom_formula":
      return uniqueNonEmpty(
        def.variables.map(variable => variable.fieldLabel || variable.field)
      );
    default:
      return [];
  }
}

function extractLabelsFromLogicNode(node: LogicNode): string[] {
  if (node.logic === "CONDITION") return [node.fieldLabel || node.field];
  if (node.logic === "NOT") return extractLabelsFromLogicNode(node.child);
  return node.children.flatMap(extractLabelsFromLogicNode);
}

function buildFallbackOverview(
  rule: LiteratureRule,
  def: RuleDefinition
): string {
  switch (def.type) {
    case "cutoff":
      return `${def.fieldLabel}のカットオフ値を用いて、${rule.name}を判定する文献ルールです。`;
    case "decision_tree":
      return "複数の評価項目を順に照合する決定木型の文献ルールです。";
    case "regression":
      return "複数の評価項目を回帰式に代入して判定する文献ルールです。";
    case "scoring_system":
      return "複数の評価項目を点数化し、合計点で判定する文献ルールです。";
    case "logistic_regression":
      return "複数の評価項目をロジスティック回帰式に代入し、確率を推定する文献ルールです。";
    case "nomogram":
      return "複数の評価項目から確率や時期を推定するノモグラム型の文献ルールです。";
    case "composite_rule":
      return "複数の条件の組み合わせで判定する文献ルールです。";
    case "custom_formula":
      return "文献に基づく数式を用いて判定する文献ルールです。";
    default:
      return "登録済み文献に基づく判定ルールです。";
  }
}

function extractTargetPopulation(notes: string | null): {
  targetPopulation: string | null;
  clinicalNote: string | null;
} {
  if (!notes) return { targetPopulation: null, clinicalNote: null };
  const match = notes.match(/対象[:：]\s*[^。]+。?/);
  if (!match) return { targetPopulation: null, clinicalNote: notes };
  const targetPopulation = match[0].trim();
  const clinicalNote = notes.replace(match[0], "").trim() || null;
  return { targetPopulation, clinicalNote };
}

function buildLiteratureSummary(
  rule: LiteratureRule,
  def: RuleDefinition
): LiteratureSummary {
  const metadata = def as RuleDefinitionMetadata;
  const notes = textOrNull(metadata.notes);
  const { targetPopulation, clinicalNote } = extractTargetPopulation(notes);
  return {
    overview:
      textOrNull(metadata.description) ?? buildFallbackOverview(rule, def),
    targetPopulation,
    predictors: extractPredictorLabels(def),
    clinicalNote,
  };
}

function buildMatchExplanation(evalResult: EvalResult): string[] {
  return [
    ...evalResult.details,
    `上記の照合結果から「${evalResult.prediction}」と判定されました。`,
  ];
}

// ============================================================
// 各ルールタイプの評価関数
// ============================================================

class MissingInputError extends Error {
  constructor(public fields: string[]) {
    super(`必要な入力項目が未入力です: ${fields.join(", ")}`);
  }
}

function requireInput(inputs: PatientInputs, field: string) {
  if (
    inputs[field] === undefined ||
    inputs[field] === null ||
    inputs[field] === ""
  )
    throw new MissingInputError([field]);
}

type EvalResult = {
  numericValue?: number;
  isPositive: boolean | null;
  prediction: string;
  probability: number | null;
  details: string[];
};

// ---- 1. カットオフ値 ----
function evalCutoff(
  def: CutoffRuleDefinition,
  inputs: PatientInputs
): EvalResult {
  const v = getVal(inputs, def.field);
  const primaryPass = compareOp(v, def.operator, def.threshold);
  const unit = def.unit ?? "";
  const details: string[] = [
    `${def.fieldLabel}: ${v}${unit}（カットオフ: ${def.operator} ${def.threshold}${unit}）→ ${primaryPass ? "✓ 条件充足" : "✗ 条件未充足"}`,
  ];

  let secondaryPass = true;
  if (def.secondaryConditions) {
    for (const sc of def.secondaryConditions) {
      const sv = getVal(inputs, sc.field);
      const sp = compareOp(sv, sc.operator, sc.value as number);
      secondaryPass = secondaryPass && sp;
      details.push(
        `${sc.fieldLabel}: ${sv}${sc.unit ?? ""}（条件: ${sc.operator} ${sc.value}${sc.unit ?? ""}）→ ${sp ? "✓" : "✗"}`
      );
    }
  }

  const isPositive = primaryPass && secondaryPass;
  return {
    isPositive,
    prediction: isPositive ? def.positiveMessage : def.negativeMessage,
    probability: null,
    details,
  };
}

// ---- 2. 決定木 ----
function evalDecisionTree(
  def: DecisionTreeRuleDefinition,
  inputs: PatientInputs
): EvalResult {
  if (!Array.isArray(def.nodes) || def.nodes.length === 0) {
    throw new Error("決定木のノードがありません");
  }
  const nodeMap = new Map<string, DecisionTreeNode>(
    def.nodes.map(n => [n.id, n])
  );
  const rootNode = def.nodes[0];
  if (!rootNode) {
    throw new Error("決定木のノードがありません");
  }

  const details: string[] = [];
  let current: DecisionTreeNode | undefined = rootNode;

  const visited = new Set<string>();
  while (current && !current.isLeaf) {
    if (visited.has(current.id)) throw new Error("決定木に循環があります");
    visited.add(current.id);
    requireInput(inputs, current.field);
    const v: unknown = getVal(inputs, current.field);
    const pass = compareOp(v, current.operator, current.threshold);
    details.push(
      `${current.fieldLabel}: ${v} ${current.operator} ${current.threshold ?? ""}→ ${pass ? "Yes" : "No"}`
    );
    const nextId: string | undefined = pass
      ? current.trueNodeId
      : current.falseNodeId;
    current = nextId ? nodeMap.get(nextId) : undefined;
  }

  if (current?.isLeaf) {
    if (def.outputMode === "classified") {
      details.push(
        current.isPositive === null
          ? "研究内の該当群で自立者・非自立者が同数のため判定保留です。支持・困難の集計には含めません。"
          : "研究内の該当群で人数が多い側を支持／困難として集計します。群別割合は患者個人の予測確率ではありません。"
      );
      return {
        isPositive: current.isPositive ?? null,
        prediction: current.message!,
        probability: null,
        details,
      };
    }
    if (def.outputMode === "descriptive") {
      details.push(
        "原著の該当群で観測された割合です。患者個人の確率・二値判定には変換していません。"
      );
      return {
        isPositive: null,
        prediction: current.message!,
        probability: null,
        details,
      };
    }
    return {
      isPositive: current.isPositive ?? false,
      prediction:
        current.message ??
        (current.isPositive ? "陽性（自立寄り）" : "陰性（困難寄り）"),
      probability: null,
      details,
    };
  }
  throw new Error("決定木の終端がありません");
}

// ---- 3. 重回帰式 ----
function evalRegression(
  def: RegressionRuleDefinition,
  inputs: PatientInputs
): EvalResult {
  let score = def.intercept;
  const details: string[] = [`切片: ${def.intercept}`];
  for (const coef of def.coefficients) {
    const v = numVal(inputs, coef.field);
    const contrib = coef.coefficient * v;
    score += contrib;
    details.push(
      `${coef.fieldLabel}${coef.unit ? `（${coef.unit}）` : ""}: ${v} × ${coef.coefficient} = ${contrib.toFixed(3)}`
    );
  }
  if (!Number.isFinite(score))
    throw new Error("回帰式の計算結果が有限の数値ではありません");
  if (def.outputMode === "continuous") {
    const prediction = `予測値: ${score.toFixed(2)}${def.outputUnit ?? ""}`;
    details.push(prediction);
    return {
      isPositive: null,
      prediction,
      probability: null,
      numericValue: score,
      details,
    };
  }
  const threshold = def.threshold!;
  details.push(`予測値: ${score.toFixed(3)}（判定閾値: ${threshold}）`);
  const isPositive = score >= threshold;
  return {
    isPositive,
    prediction: (isPositive ? def.positiveMessage : def.negativeMessage)!,
    probability: null,
    numericValue: score,
    details,
  };
}

// ---- 4. スコアリングシステム ----
function evalScoringSystem(
  def: ScoringSystemRuleDefinition,
  inputs: PatientInputs
): EvalResult {
  let total = 0;
  const details: string[] = [];
  for (const item of def.items) {
    const v = getVal(inputs, item.field);
    let matched = false;
    for (const band of item.bands) {
      const pass = compareOp(v, band.operator, band.value);
      if (pass) {
        total += band.score;
        details.push(
          `${item.fieldLabel}${item.unit ? `（${item.unit}）` : ""}: ${v} → ${band.label}（+${band.score}点）`
        );
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new Error(`項目「${item.field}」に該当する点数区間がありません`);
    }
  }
  if (!Number.isFinite(total))
    throw new Error("合計スコアが有限の数値ではありません");
  details.push(
    `合計スコア: ${total}点 / ${def.maxScore}点（閾値: ${def.threshold}点）`
  );
  const isPositive = total >= def.threshold;
  return {
    isPositive,
    prediction: isPositive ? def.positiveMessage : def.negativeMessage,
    probability: null,
    details,
  };
}

// ---- 5. ロジスティック回帰・対応するノモグラム ----
function evalLogisticModel(
  def: NomogramRuleDefinition | LogisticRegressionRuleDefinition,
  inputs: PatientInputs
): EvalResult {
  let logOdds = def.intercept;
  const details: string[] = [`切片（log-odds）: ${def.intercept}`];
  for (const v of def.variables) {
    let rawVal: number;
    if (v.categoryMap) {
      const strVal = String(getVal(inputs, v.field) ?? "");
      if (!Object.hasOwn(v.categoryMap, strVal))
        throw new Error(`項目「${v.field}」に未定義のカテゴリがあります`);
      rawVal = v.categoryMap[strVal];
      details.push(
        `${v.fieldLabel}: "${strVal}" → マッピング値 ${rawVal} × ${v.coefficient}`
      );
    } else {
      rawVal = numVal(inputs, v.field);
      details.push(
        `${v.fieldLabel}${v.unit ? `（${v.unit}）` : ""}: ${rawVal} × ${v.coefficient}`
      );
    }
    logOdds += v.coefficient * rawVal;
  }
  if (!Number.isFinite(logOdds))
    throw new Error("確率計算の入力が有限の数値ではありません");
  const probability = 1 / (1 + Math.exp(-logOdds));
  if (def.outputMode === "probability") {
    details.push(`log-odds: ${logOdds.toFixed(4)}`);
    details.push("確率のみの表示を選択しているため、二値判定は行いません。");
    return {
      isPositive: null,
      prediction: `推定確率: ${(probability * 100).toFixed(1)}%`,
      probability,
      details,
    };
  }
  const probabilityThreshold = def.probabilityThreshold ?? 0.5;
  details.push(`log-odds: ${logOdds.toFixed(4)}`);
  details.push(
    `予測確率: ${(probability * 100).toFixed(1)}%（判定閾値: ${(probabilityThreshold * 100).toFixed(0)}%）`
  );
  const isPositive = probability >= probabilityThreshold;
  return {
    isPositive,
    prediction: isPositive ? def.positiveMessage! : def.negativeMessage!,
    probability,
    details,
  };
}

// ---- 6. 複合条件ルール ----
function evalCompositeRule(
  def: CompositeRuleDefinition,
  inputs: PatientInputs
): EvalResult {
  const details: string[] = [];
  if (!def.root) {
    throw new Error("複合条件が未定義です");
  }
  const isPositive = evalLogicNode(def.root, inputs, details);
  return {
    isPositive,
    prediction: isPositive ? def.positiveMessage : def.negativeMessage,
    probability: null,
    details,
  };
}

function evalLogicNode(
  node: LogicNode,
  inputs: PatientInputs,
  details: string[]
): boolean {
  if (node.logic === "CONDITION") {
    const v = getVal(inputs, node.field);
    const pass = compareOp(v, node.operator, node.value as number);
    details.push(
      `${node.fieldLabel}: ${v} ${node.operator} ${node.value ?? ""}${node.unit ? ` ${node.unit}` : ""} → ${pass ? "✓" : "✗"}`
    );
    return pass;
  }
  if (node.logic === "NOT") {
    const result = evalLogicNode(node.child, inputs, details);
    details.push(`NOT → ${!result}`);
    return !result;
  }
  if (node.logic === "AND") {
    const results = node.children.map(c => evalLogicNode(c, inputs, details));
    const all = results.every(Boolean);
    details.push(
      `AND（${results.map(r => (r ? "✓" : "✗")).join(", ")}）→ ${all ? "✓" : "✗"}`
    );
    return all;
  }
  if (node.logic === "OR") {
    const results = node.children.map(c => evalLogicNode(c, inputs, details));
    const any = results.some(Boolean);
    details.push(
      `OR（${results.map(r => (r ? "✓" : "✗")).join(", ")}）→ ${any ? "✓" : "✗"}`
    );
    return any;
  }
  return false;
}

// ---- 7. カスタム数式 ----
function evalCustomFormula(
  def: CustomFormulaRuleDefinition,
  inputs: PatientInputs
): EvalResult {
  const values: Record<string, number> = {};
  const details = [`数式: ${def.formula}`];
  for (const variable of def.variables) {
    values[variable.field] = numVal(inputs, variable.field);
    details.push(
      `${variable.fieldLabel || variable.field} = ${values[variable.field]}`
    );
  }
  const score = evaluateFormula(def.formula, values);
  if (def.outputMode === "continuous") {
    if (def.modelType === "koyama_fim_total") {
      const beta = (values.koyama_fim_total_b - values.koyama_fim_total_a) / Math.log(values.koyama_day_b / values.koyama_day_a);
      details.push(`β = ${beta.toFixed(6)}（自然対数）`);
      details.push(`予測対象: 発症後${values.koyama_target_day}日。FIM総得点（18〜126点）の参考予測。`);
      if (values.koyama_fim_total_b === values.koyama_fim_total_a)
        details.push("2時点で変化がないためβ＝0です。今後回復しないことを意味しません。");
      details.push("原著本文未確認。総説p.775図2と原著公開抄録に基づく実装。個人の誤差幅は不明です。");
    }
    return { isPositive: null, prediction: `予測値: ${score.toFixed(2)}${def.outputUnit ?? ""}`, probability: null, numericValue: score, details };
  }
  details.push(`計算結果: ${score.toFixed(4)}（閾値: ${def.threshold}）`);
  const isPositive = score >= def.threshold!;
  return {
    isPositive,
    prediction: isPositive ? def.positiveMessage! : def.negativeMessage!,
    probability: null,
    numericValue: score,
    details,
  };
}

// ============================================================
// メイン評価関数
// ============================================================

export function evaluateRule(
  rule: LiteratureRule,
  inputs: PatientInputs
): RuleEvaluationResult {
  let literatureSummary: LiteratureSummary = {
    overview: null,
    targetPopulation: null,
    predictors: [],
    clinicalNote: null,
  };
  try {
    const validation = patientInputsSchema.safeParse(inputs);
    if (!validation.success)
      throw new Error(
        `入力値を確認してください: ${validation.error.issues.map(issue => issue.path.join(".")).join(", ")}`
      );
    const def = rule.ruleDefinition;
    const metadata = def as RuleDefinition & { modelType?: string };
    const exclusionReason = getRuleExclusionReason(def);
    if (exclusionReason) {
      return makeInapplicable(
        rule,
        literatureSummary,
        exclusionReason,
        "unsupported"
      );
    }
    if (
      metadata?.type === "nomogram" &&
      metadata.modelType &&
      metadata.modelType !== "logistic"
    ) {
      return makeInapplicable(
        rule,
        literatureSummary,
        "未対応のモデルです。Coxモデルの時点別確率を算出するための情報・計算処理が未整備です。",
        "unsupported"
      );
    }
    const definitionError = validateRuleDefinition(def);
    if (definitionError || def.type !== rule.ruleType) {
      return makeInapplicable(
        rule,
        literatureSummary,
        definitionError ?? "ルール種別と定義が一致しません",
        "invalid_definition"
      );
    }
    const conditionParse = applyConditionSchema
      .array()
      .safeParse(rule.applyConditions ?? []);
    if (!conditionParse.success)
      return makeInapplicable(
        rule,
        literatureSummary,
        "適用条件の定義が不正です",
        "invalid_definition"
      );
    literatureSummary = buildLiteratureSummary(rule, def);
    const conditions = conditionParse.data as ApplyCondition[];
    // A known exclusion takes precedence over an unrelated missing condition.
    const available = conditions.filter(
      c =>
        inputs[c.field] !== undefined &&
        inputs[c.field] !== null &&
        inputs[c.field] !== ""
    );
    const { ok, reason } = checkApplyConditions(available, inputs);
    if (!ok)
      return makeInapplicable(rule, literatureSummary, reason, "outside");
    const missingConditions = conditions
      .filter(c => !available.includes(c))
      .map(c => c.field);
    if (missingConditions.length)
      throw new MissingInputError(Array.from(new Set(missingConditions)));
    // Decision trees only need inputs along the path actually taken.
    if (def.type !== "decision_tree") {
      const missing = extractRequiredFields(def).filter(
        f => inputs[f] === undefined || inputs[f] === null || inputs[f] === ""
      );
      if (missing.length)
        throw new MissingInputError(Array.from(new Set(missing)));
    }
    if (def.type === "custom_formula" && def.modelType === "koyama_fim_total") {
      const reason = koyamaInputReason(inputs);
      if (reason) return makeInapplicable(rule, literatureSummary, reason, "outside");
    }
    let result: EvalResult;
    switch (def.type) {
      case "cutoff":
        result = evalCutoff(def, inputs);
        break;
      case "decision_tree":
        result = evalDecisionTree(def, inputs);
        break;
      case "regression":
        result = evalRegression(def, inputs);
        break;
      case "scoring_system":
        result = evalScoringSystem(def, inputs);
        break;
      case "logistic_regression":
      case "nomogram":
        result = evalLogisticModel(def, inputs);
        break;
      case "composite_rule":
        result = evalCompositeRule(def, inputs);
        break;
      case "custom_formula":
        result = evalCustomFormula(def, inputs);
        break;
    }
    if (def.type === "custom_formula" && def.modelType === "koyama_fim_total" &&
        result.numericValue !== undefined && (result.numericValue < 18 || result.numericValue > 126))
      return makeInapplicable(rule, literatureSummary,
        `数式上の計算値は${result.numericValue.toFixed(2)}点で、FIM総得点の範囲（18〜126点）外です。上限・下限への置換はせず、通常の予測値表示を停止しました。`, "outside");
    if (result.probability !== null && !Number.isFinite(result.probability))
      throw new Error("確率を算出できません");
    return {
      ...makeInapplicable(rule, literatureSummary, null, "evaluated"),
      timeline: def.type === "custom_formula" && def.modelType === "koyama_fim_total"
        ? koyamaResultTimeline(inputs) : readTimeline(def),
      isApplicable: true,
      isPositive: result.isPositive,
      prediction: result.prediction,
      probability: result.probability,
      numericValue: result.numericValue ?? null,
      details: result.details,
      matchExplanation: buildMatchExplanation(result),
    };
  } catch (error) {
    return makeInapplicable(
      rule,
      literatureSummary,
      error instanceof Error ? error.message : "ルールを評価できません",
      error instanceof MissingInputError
        ? "missing_input"
        : "calculation_error",
      error instanceof MissingInputError ? error.fields : []
    );
  }
}

function makeInapplicable(
  rule: LiteratureRule,
  literatureSummary: LiteratureSummary,
  reason: string | null,
  status: EvaluationStatus,
  missingFields: string[] = []
): RuleEvaluationResult {
  return {
    status,
    missingFields,
    numericValue: null,
    ...readContinuousOutput(rule.ruleDefinition),
    timeline: readTimeline(rule.ruleDefinition),
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.ruleType,
    source: rule.source,
    sourceUrl: rule.sourceUrl ?? null,
    evidenceLevel: rule.evidenceLevel,
    literatureSummary,
    matchExplanation: reason ? [reason] : [],
    consensusEligible: rule.consensusEligible,
    isApplicable: false,
    unavailableReason: reason,
    isPositive: null,
    prediction: null,
    probability: null,
    details: [],
    accuracy: rule.accuracy ?? null,
    sensitivity: rule.sensitivity ?? null,
    specificity: rule.specificity ?? null,
    auc: rule.auc ?? null,
  };
}

export function calculateConsensus(
  results: RuleEvaluationResult[]
): ConsensusAnalysis {
  const eligible = results.filter(isConsensusResult);
  const positive = eligible.filter(r => r.isPositive === true);
  const negative = eligible.filter(r => r.isPositive === false);
  const score = eligible.length > 0 ? positive.length / eligible.length : null;
  let label: ConsensusAnalysis["label"];
  if (score === null) label = "unavailable";
  else if (score >= 0.7) label = "positive";
  else if (score >= 0.4) label = "neutral";
  else label = "negative";
  return {
    score,
    label,
    positiveCount: positive.length,
    negativeCount: negative.length,
    totalEligible: eligible.length,
    applicableCount: results.filter(r => r.isApplicable).length,
  };
}

export function generateSuggestions(
  rules: LiteratureRule[],
  inputs: PatientInputs,
  results: RuleEvaluationResult[]
): SuggestionItem[] {
  const suggestions: SuggestionItem[] = [];
  for (const result of results) {
    if (result.status === "missing_input") {
      suggestions.push({
        ruleId: result.ruleId,
        ruleName: result.ruleName,
        missingFields: result.missingFields,
        outcome: result.ruleName,
        reason: "missing_input",
      });
    } else if (result.status === "outside") {
      suggestions.push({
        ruleId: result.ruleId,
        ruleName: result.ruleName,
        missingFields: [],
        outcome: result.ruleName,
        reason: "time_condition",
      });
    }
  }
  return suggestions;
}

export function runEngine(
  rules: LiteratureRule[],
  inputs: PatientInputs,
  timeContext?: TimeQuery
): EngineOutput {
  const results = rules
    .filter(r => r.isActive)
    .map(rule => {
      const result = evaluateRule(rule, inputs);
      const isKoyama = rule.ruleDefinition.type === "custom_formula" && rule.ruleDefinition.modelType === "koyama_fim_total";
      if (import.meta.env?.VITE_DEMO_MODE === "true" && !isKoyama) return result;
      const timeMatch = isKoyama ? matchKoyamaTime() : matchTimeline(result.timeline ?? null, timeContext);
      const compared = {
        ...result,
        timeMatch,
        consensusEligible:
          result.consensusEligible &&
          ["matched", "within_range", "review"].includes(timeMatch.status),
      };
      if (
        timeMatch.status === "mismatch" &&
        ["evaluated", "missing_input", "outside"].includes(result.status)
      ) {
        return {
          ...compared,
          status: "outside" as const,
          isApplicable: false,
          isPositive: null,
          numericValue: null,
          prediction: null,
          probability: null,
          missingFields: [],
          details: [],
          unavailableReason: timeMatch.reason,
          matchExplanation: [timeMatch.reason],
        };
      }
      return compared;
    });
  const consensus = calculateConsensus(results);
  const suggestions = generateSuggestions(rules, inputs, results);
  return { results, consensus, suggestions };
}
