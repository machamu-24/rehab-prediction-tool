/**
 * 文献ベースルールエンジン
 *
 * 対応ルールタイプ:
 *   1. cutoff          - カットオフ値（単一・複合条件）
 *   2. decision_tree   - 決定木
 *   3. regression      - 重回帰式
 *   4. scoring_system  - スコアリングシステム
 *   5. nomogram        - ノモグラム（ロジスティック回帰ベース確率算出）
 *   6. composite_rule  - 複合条件（AND/OR/NOT）
 *   7. custom_formula  - カスタム数式
 */

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
  CompositeRuleDefinition,
  LogicNode,
  CustomFormulaRuleDefinition,
} from "../drizzle/schema";

// ============================================================
// 出力型定義
// ============================================================

export type RuleEvaluationResult = {
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
  score: number;
  label: "positive" | "neutral" | "negative";
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
  return Number(inputs[field] ?? 0);
}

function compareOp(
  val: unknown,
  operator: string,
  threshold: number | string | boolean | undefined
): boolean {
  const n = Number(val);
  const t = Number(threshold);
  switch (operator) {
    case "<=": return n <= t;
    case ">=": return n >= t;
    case "<":  return n < t;
    case ">":  return n > t;
    case "equals":
    case "==": return val == threshold;
    case "!=": return val != threshold;
    case "boolean": return Boolean(val);
    case "boolean_negative": return !Boolean(val);
    default:   return false;
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
export function extractRequiredFieldsFromDef(def: RuleDefinition | null | undefined): string[] {
  if (!def) return [];
  return extractRequiredFields(def);
}
function extractRequiredFields(def: RuleDefinition): string[] {
  switch (def.type) {
    case "cutoff": {
      const fields = [def.field];
      if (def.secondaryConditions) fields.push(...def.secondaryConditions.map((c) => c.field));
      return fields;
    }
    case "decision_tree": {
      if (!Array.isArray(def.nodes)) return [];
      const fieldSet = new Set(def.nodes.filter((n) => !n.isLeaf).map((n) => n.field));
      return Array.from(fieldSet);
    }
    case "regression":
      return def.coefficients.map((c) => c.field);
    case "scoring_system":
      return def.items.map((i) => i.field);
    case "nomogram":
      return def.variables.map((v) => v.field);
    case "composite_rule":
      if (!def.root) return [];
      return extractFieldsFromLogicNode(def.root);
    case "custom_formula":
      return def.variables.map((v) => v.field);
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
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function extractPredictorLabels(def: RuleDefinition): string[] {
  switch (def.type) {
    case "cutoff":
      return uniqueNonEmpty([
        def.fieldLabel,
        ...(def.secondaryConditions?.map((c) => c.fieldLabel) ?? []),
      ]);
    case "decision_tree":
      return uniqueNonEmpty(
        def.nodes
          .filter((node) => !node.isLeaf)
          .map((node) => node.fieldLabel || node.field)
      );
    case "regression":
      return uniqueNonEmpty(def.coefficients.map((coef) => coef.fieldLabel || coef.field));
    case "scoring_system":
      return uniqueNonEmpty(def.items.map((item) => item.fieldLabel || item.field));
    case "nomogram":
      return uniqueNonEmpty(def.variables.map((variable) => variable.fieldLabel || variable.field));
    case "composite_rule":
      return uniqueNonEmpty(extractLabelsFromLogicNode(def.root));
    case "custom_formula":
      return uniqueNonEmpty(def.variables.map((variable) => variable.fieldLabel || variable.field));
    default:
      return [];
  }
}

function extractLabelsFromLogicNode(node: LogicNode): string[] {
  if (node.logic === "CONDITION") return [node.fieldLabel || node.field];
  if (node.logic === "NOT") return extractLabelsFromLogicNode(node.child);
  return node.children.flatMap(extractLabelsFromLogicNode);
}

function buildFallbackOverview(rule: LiteratureRule, def: RuleDefinition): string {
  switch (def.type) {
    case "cutoff":
      return `${def.fieldLabel}のカットオフ値を用いて、${rule.name}を判定する文献ルールです。`;
    case "decision_tree":
      return "複数の評価項目を順に照合する決定木型の文献ルールです。";
    case "regression":
      return "複数の評価項目を回帰式に代入して判定する文献ルールです。";
    case "scoring_system":
      return "複数の評価項目を点数化し、合計点で判定する文献ルールです。";
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

function extractTargetPopulation(notes: string | null): { targetPopulation: string | null; clinicalNote: string | null } {
  if (!notes) return { targetPopulation: null, clinicalNote: null };
  const match = notes.match(/対象[:：]\s*[^。]+。?/);
  if (!match) return { targetPopulation: null, clinicalNote: notes };
  const targetPopulation = match[0].trim();
  const clinicalNote = notes.replace(match[0], "").trim() || null;
  return { targetPopulation, clinicalNote };
}

function buildLiteratureSummary(rule: LiteratureRule, def: RuleDefinition): LiteratureSummary {
  const metadata = def as RuleDefinitionMetadata;
  const notes = textOrNull(metadata.notes);
  const { targetPopulation, clinicalNote } = extractTargetPopulation(notes);
  return {
    overview: textOrNull(metadata.description) ?? buildFallbackOverview(rule, def),
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

type EvalResult = {
  isPositive: boolean;
  prediction: string;
  probability: number | null;
  details: string[];
};

// ---- 1. カットオフ値 ----
function evalCutoff(def: CutoffRuleDefinition, inputs: PatientInputs): EvalResult {
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
  return { isPositive, prediction: isPositive ? def.positiveMessage : def.negativeMessage, probability: null, details };
}

// ---- 2. 決定木 ----
function evalDecisionTree(def: DecisionTreeRuleDefinition, inputs: PatientInputs): EvalResult {
  if (!Array.isArray(def.nodes) || def.nodes.length === 0) {
    return { isPositive: false, prediction: "評価不能（ノード定義なし）", probability: null, details: [] };
  }
  const nodeMap = new Map<string, DecisionTreeNode>(def.nodes.map((n) => [n.id, n]));
  const rootNode = def.nodes[0];
  if (!rootNode) {
    return { isPositive: false, prediction: "評価不能（ノード定義なし）", probability: null, details: [] };
  }

  const details: string[] = [];
  let current: DecisionTreeNode | undefined = rootNode;

  while (current && !current.isLeaf) {
    const v: unknown = getVal(inputs, current.field);
    const pass = compareOp(v, current.operator, current.threshold);
    details.push(
      `${current.fieldLabel}: ${v} ${current.operator} ${current.threshold ?? ""}→ ${pass ? "Yes" : "No"}`
    );
    const nextId: string | undefined = pass ? current.trueNodeId : current.falseNodeId;
    current = nextId ? nodeMap.get(nextId) : undefined;
  }

  if (current?.isLeaf) {
    return {
      isPositive: current.isPositive ?? false,
      prediction: current.message ?? (current.isPositive ? "陽性（自立寄り）" : "陰性（困難寄り）"),
      probability: null,
      details,
    };
  }
  return { isPositive: false, prediction: "評価不能（ツリー終端なし）", probability: null, details };
}

// ---- 3. 重回帰式 ----
function evalRegression(def: RegressionRuleDefinition, inputs: PatientInputs): EvalResult {
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
  const outputRange = (def as RegressionRuleDefinition & { outputRange?: [number, number] }).outputRange;
  const threshold =
    typeof def.threshold === "number"
      ? def.threshold
      : Array.isArray(outputRange)
        ? (outputRange[0] + outputRange[1]) / 2
        : 0;
  details.push(`予測値: ${score.toFixed(3)}（判定閾値: ${threshold}）`);
  const isPositive = score >= threshold;
  return { isPositive, prediction: isPositive ? def.positiveMessage : def.negativeMessage, probability: null, details };
}

// ---- 4. スコアリングシステム ----
function evalScoringSystem(def: ScoringSystemRuleDefinition, inputs: PatientInputs): EvalResult {
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
      details.push(`${item.fieldLabel}: ${v} → 該当区間なし（0点）`);
    }
  }
  details.push(`合計スコア: ${total}点 / ${def.maxScore}点（閾値: ${def.threshold}点）`);
  const isPositive = total >= def.threshold;
  return { isPositive, prediction: isPositive ? def.positiveMessage : def.negativeMessage, probability: null, details };
}

// ---- 5. ノモグラム ----
function evalNomogram(def: NomogramRuleDefinition, inputs: PatientInputs): EvalResult {
  let logOdds = def.intercept;
  const details: string[] = [`切片（log-odds）: ${def.intercept}`];
  for (const v of def.variables) {
    let rawVal: number;
    if (v.categoryMap) {
      const strVal = String(getVal(inputs, v.field) ?? "");
      rawVal = v.categoryMap[strVal] ?? 0;
      details.push(`${v.fieldLabel}: "${strVal}" → マッピング値 ${rawVal} × ${v.coefficient}`);
    } else {
      rawVal = numVal(inputs, v.field);
      details.push(`${v.fieldLabel}${v.unit ? `（${v.unit}）` : ""}: ${rawVal} × ${v.coefficient}`);
    }
    logOdds += v.coefficient * rawVal;
  }
  const probability = 1 / (1 + Math.exp(-logOdds));
  const probabilityThreshold = def.probabilityThreshold ?? 0.5;
  details.push(`log-odds: ${logOdds.toFixed(4)}`);
  details.push(`予測確率: ${(probability * 100).toFixed(1)}%（判定閾値: ${(probabilityThreshold * 100).toFixed(0)}%）`);
  const isPositive = probability >= probabilityThreshold;
  return {
    isPositive,
    prediction: isPositive ? def.positiveMessage : def.negativeMessage,
    probability,
    details,
  };
}

// ---- 6. 複合条件ルール ----
function evalCompositeRule(def: CompositeRuleDefinition, inputs: PatientInputs): EvalResult {
  const details: string[] = [];
  if (!def.root) {
    return { isPositive: false, prediction: "評価不能（ルート条件未定義）", probability: null, details };
  }
  const isPositive = evalLogicNode(def.root, inputs, details);
  return { isPositive, prediction: isPositive ? def.positiveMessage : def.negativeMessage, probability: null, details };
}

function evalLogicNode(node: LogicNode, inputs: PatientInputs, details: string[]): boolean {
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
    const results = node.children.map((c) => evalLogicNode(c, inputs, details));
    const all = results.every(Boolean);
    details.push(`AND（${results.map((r) => (r ? "✓" : "✗")).join(", ")}）→ ${all ? "✓" : "✗"}`);
    return all;
  }
  if (node.logic === "OR") {
    const results = node.children.map((c) => evalLogicNode(c, inputs, details));
    const any = results.some(Boolean);
    details.push(`OR（${results.map((r) => (r ? "✓" : "✗")).join(", ")}）→ ${any ? "✓" : "✗"}`);
    return any;
  }
  return false;
}

// ---- 7. カスタム数式 ----
function evalCustomFormula(def: CustomFormulaRuleDefinition, inputs: PatientInputs): EvalResult {
  const details: string[] = [`数式: ${def.formula}`];
  const varDetails: string[] = [];

  // 変数を数式に代入（安全な評価のため変数を展開）
  let expr = def.formula;
  for (const v of def.variables) {
    const val = numVal(inputs, v.field);
    varDetails.push(`${v.fieldLabel}${v.unit ? `（${v.unit}）` : ""} = ${val}`);
    // 変数名を値に置換（単語境界を考慮）
    expr = expr.replace(new RegExp(`\\b${v.field}\\b`, "g"), String(val));
  }
  details.push(...varDetails);

  let score = 0;
  let evalError = false;
  try {
    // 安全な数式評価（四則演算・べき乗のみ許可）
    score = safeEval(expr);
    details.push(`計算結果: ${score.toFixed(4)}（閾値: ${def.threshold}）`);
  } catch {
    evalError = true;
    details.push(`数式評価エラー: ${expr}`);
  }

  if (evalError) {
    return { isPositive: false, prediction: "数式評価エラー", probability: null, details };
  }

  const isPositive = score >= def.threshold;
  return { isPositive, prediction: isPositive ? def.positiveMessage : def.negativeMessage, probability: null, details };
}

/**
 * 安全な数式評価（四則演算・べき乗・括弧のみ許可）
 * evalを使わずに再帰的パーサーで実装
 */
function safeEval(expr: string): number {
  const tokens = tokenize(expr.replace(/\s+/g, ""));
  let pos = 0;

  function parseExpr(): number { return parseAddSub(); }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (pos < tokens.length && (tokens[pos] === "+" || tokens[pos] === "-")) {
      const op = tokens[pos++];
      const right = parseMulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv(): number {
    let left = parsePow();
    while (pos < tokens.length && (tokens[pos] === "*" || tokens[pos] === "/")) {
      const op = tokens[pos++];
      const right = parsePow();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parsePow(): number {
    let base = parseUnary();
    if (pos < tokens.length && tokens[pos] === "^") {
      pos++;
      const exp = parsePow();
      base = Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    if (tokens[pos] === "-") { pos++; return -parsePrimary(); }
    if (tokens[pos] === "+") { pos++; return parsePrimary(); }
    return parsePrimary();
  }

  function parsePrimary(): number {
    if (tokens[pos] === "(") {
      pos++;
      const val = parseExpr();
      if (tokens[pos] !== ")") throw new Error("括弧が閉じていません");
      pos++;
      return val;
    }
    const tok = tokens[pos++];
    const n = parseFloat(tok ?? "");
    if (isNaN(n)) throw new Error(`不正なトークン: ${tok}`);
    return n;
  }

  return parseExpr();
}

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    if ("+-*/^()".includes(expr[i]!)) {
      tokens.push(expr[i]!);
      i++;
    } else if (/[\d.]/.test(expr[i]!)) {
      let num = "";
      while (i < expr.length && /[\d.]/.test(expr[i]!)) num += expr[i++];
      tokens.push(num);
    } else {
      i++;
    }
  }
  return tokens;
}

// ============================================================
// メイン評価関数
// ============================================================

export function evaluateRule(rule: LiteratureRule, inputs: PatientInputs): RuleEvaluationResult {
  const def = rule.ruleDefinition as RuleDefinition;
  const conditions = (rule.applyConditions ?? []) as ApplyCondition[];
  const literatureSummary = buildLiteratureSummary(rule, def);

  // 適用条件チェック
  const { ok, reason } = checkApplyConditions(conditions, inputs);
  if (!ok) {
    return makeInapplicable(rule, literatureSummary, reason);
  }

  // 必要フィールドチェック
  const requiredFields = extractRequiredFields(def);
  const missingFields = requiredFields.filter(
    (f) => inputs[f] === undefined || inputs[f] === null || inputs[f] === ""
    // NOTE: false は有効な入力（boolean型フィールド）として扱う
  ).filter((f) => inputs[f] !== false);
  if (missingFields.length > 0) {
    return makeInapplicable(
      rule,
      literatureSummary,
      `必要な入力項目が未入力です: ${missingFields.join(", ")}`
    );
  }

  // ルール評価
  let evalResult: EvalResult;
  switch (def.type) {
    case "cutoff":         evalResult = evalCutoff(def, inputs); break;
    case "decision_tree":  evalResult = evalDecisionTree(def, inputs); break;
    case "regression":     evalResult = evalRegression(def, inputs); break;
    case "scoring_system": evalResult = evalScoringSystem(def, inputs); break;
    case "nomogram":       evalResult = evalNomogram(def, inputs); break;
    case "composite_rule": evalResult = evalCompositeRule(def, inputs); break;
    case "custom_formula": evalResult = evalCustomFormula(def, inputs); break;
    default:
      evalResult = { isPositive: false, prediction: "未対応のルールタイプ", probability: null, details: [] };
  }

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.ruleType,
    source: rule.source,
    sourceUrl: rule.sourceUrl ?? null,
    evidenceLevel: rule.evidenceLevel,
    literatureSummary,
    matchExplanation: buildMatchExplanation(evalResult),
    consensusEligible: rule.consensusEligible,
    isApplicable: true,
    unavailableReason: null,
    isPositive: evalResult.isPositive,
    prediction: evalResult.prediction,
    probability: evalResult.probability,
    details: evalResult.details,
    accuracy: rule.accuracy ?? null,
    sensitivity: rule.sensitivity ?? null,
    specificity: rule.specificity ?? null,
    auc: rule.auc ?? null,
  };
}

function makeInapplicable(
  rule: LiteratureRule,
  literatureSummary: LiteratureSummary,
  reason: string | null
): RuleEvaluationResult {
  return {
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

export function calculateConsensus(results: RuleEvaluationResult[]): ConsensusAnalysis {
  const eligible = results.filter((r) => r.consensusEligible && r.isApplicable);
  const positive = eligible.filter((r) => r.isPositive === true);
  const negative = eligible.filter((r) => r.isPositive === false);
  const score = eligible.length > 0 ? positive.length / eligible.length : 0;
  let label: "positive" | "neutral" | "negative";
  if (score >= 0.7) label = "positive";
  else if (score >= 0.4) label = "neutral";
  else label = "negative";
  return {
    score,
    label,
    positiveCount: positive.length,
    negativeCount: negative.length,
    totalEligible: eligible.length,
    applicableCount: results.filter((r) => r.isApplicable).length,
  };
}

export function generateSuggestions(
  rules: LiteratureRule[],
  inputs: PatientInputs,
  results: RuleEvaluationResult[]
): SuggestionItem[] {
  const suggestions: SuggestionItem[] = [];
  for (const result of results.filter((r) => !r.isApplicable)) {
    const rule = rules.find((r) => r.id === result.ruleId);
    if (!rule) continue;
    const def = rule.ruleDefinition as RuleDefinition;
    const requiredFields = extractRequiredFields(def);
    const missingFields = requiredFields.filter(
      (f) => inputs[f] === undefined || inputs[f] === null || inputs[f] === ""
    );
    const isTimeBased = result.unavailableReason?.includes("適用条件") ?? false;
    if (missingFields.length > 0 && !isTimeBased) {
      suggestions.push({ ruleId: rule.id, ruleName: rule.name, missingFields, outcome: rule.name, reason: "missing_input" });
    } else if (isTimeBased) {
      suggestions.push({ ruleId: rule.id, ruleName: rule.name, missingFields: [], outcome: rule.name, reason: "time_condition" });
    }
  }
  return suggestions;
}

export function runEngine(rules: LiteratureRule[], inputs: PatientInputs): EngineOutput {
  const results = rules.filter((r) => r.isActive).map((rule) => evaluateRule(rule, inputs));
  const consensus = calculateConsensus(results);
  const suggestions = generateSuggestions(rules, inputs, results);
  return { results, consensus, suggestions };
}
