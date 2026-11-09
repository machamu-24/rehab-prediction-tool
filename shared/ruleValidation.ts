import { literatureTimelineSchema } from "./literatureTimeline";
import { z } from "zod";
import { KOYAMA_FORMULA, KOYAMA_FIELDS } from "./koyama";

const finite = z.number().finite();
const field = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "評価項目名が不正です");
const text = z.string().min(1);
const operator = z.enum(["<=", ">=", "<", ">", "==", "!=", "equals", "boolean", "boolean_negative"]);
const value = z.union([finite, z.string(), z.boolean()]);
const messages = { positiveMessage: text, negativeMessage: text };
const variable = z.object({ field, fieldLabel: text.optional(), unit: z.string().optional() }).passthrough();

export const applyConditionSchema = z.object({
  field, operator, value, label: z.string().optional(),
}).passthrough();

const logicNode: z.ZodType = z.lazy(() => z.discriminatedUnion("logic", [
  z.object({ logic: z.literal("CONDITION"), field, fieldLabel: text.optional(), operator, value: value.optional() }).passthrough(),
  z.object({ logic: z.literal("NOT"), child: logicNode }).passthrough(),
  z.object({ logic: z.literal("AND"), children: z.array(logicNode).min(1) }).passthrough(),
  z.object({ logic: z.literal("OR"), children: z.array(logicNode).min(1) }).passthrough(),
]));

export const ruleDefinitionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cutoff"), field, fieldLabel: text, operator: z.enum(["<=", ">=", "<", ">"]), threshold: finite, ...messages,
    secondaryConditions: z.array(z.object({ field, fieldLabel: text, operator, value }).passthrough()).optional(),
  }).passthrough(),
  z.object({ type: z.literal("decision_tree"), outputMode: z.enum(["binary", "descriptive", "classified"]).optional(), nodes: z.array(z.object({
    id: text, isLeaf: z.boolean().optional(), field: z.string().optional(), fieldLabel: z.string().optional(),
    operator: operator.optional(), threshold: value.optional(), trueNodeId: text.optional(), falseNodeId: text.optional(),
    isPositive: z.boolean().nullable().optional(), probability: finite.min(0).max(1).optional(), message: z.string().optional(),
  }).passthrough()).min(1).max(500) }).passthrough(),
  z.object({ type: z.literal("regression"), intercept: finite,
    coefficients: z.array(variable.extend({ coefficient: finite })).min(1),
    outputMode: z.enum(["continuous", "binary"]).optional(), outputUnit: z.string().optional(),
    threshold: finite.optional(), positiveMessage: text.optional(), negativeMessage: text.optional(),
  }).passthrough(),
  z.object({ type: z.literal("scoring_system"), ...messages, threshold: finite, maxScore: finite,
    items: z.array(variable.extend({ bands: z.array(z.object({ operator, value: value.optional(), score: finite, label: text }).passthrough()).min(1) })).min(1),
  }).passthrough(),
  z.object({ type: z.literal("nomogram"), ...messages, intercept: finite,
    modelType: z.literal("logistic").optional(),
    outputMode: z.enum(["binary", "probability"]).optional(),
    variables: z.array(variable.extend({ coefficient: finite, categoryMap: z.record(z.string(), finite).optional() })).min(1),
    probabilityThreshold: finite.min(0).max(1).optional(),
  }).passthrough(),
  z.object({ type: z.literal("logistic_regression"), intercept: finite,
    modelType: z.literal("logistic").optional(),
    outputMode: z.enum(["binary", "probability"]),
    variables: z.array(variable.extend({ coefficient: finite, categoryMap: z.record(z.string(), finite).optional() })).min(1),
    probabilityThreshold: finite.min(0).max(1).optional(),
    positiveMessage: text.optional(), negativeMessage: text.optional(),
  }).passthrough(),
  z.object({ type: z.literal("composite_rule"), ...messages, root: logicNode }).passthrough(),
  z.object({ type: z.literal("custom_formula"), formula: text.max(4096), variables: z.array(variable),
    outputMode: z.enum(["continuous", "binary"]).optional(), outputUnit: z.string().optional(),
    modelType: z.literal("koyama_fim_total").optional(),
    threshold: finite.optional(), positiveMessage: text.optional(), negativeMessage: text.optional(),
  }).passthrough(),
]);

/** Bound recursion before handing user-authored JSON to recursive validators. */
export function validateRuleDefinition(input: unknown): string | null {
  const pending: Array<[unknown, number]> = [[input, 0]];
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop()!;
    if (++count > 10000 || depth > 64) return "ルール定義が複雑すぎます";
    if (node && typeof node === "object") {
      for (const child of Object.values(node)) pending.push([child, depth + 1]);
    }
  }
  const parsed = ruleDefinitionSchema.safeParse(input);
  if (!parsed.success) return "ルール定義の必須項目・型・数値を確認してください";
  const def = parsed.data;
  if (def.type === "custom_formula") {
    if (def.outputMode !== "continuous" &&
        (def.threshold === undefined || !def.positiveMessage || !def.negativeMessage))
      return "カスタム数式の判定閾値とメッセージ、または数値出力モードを指定してください";
    if (def.modelType === "koyama_fim_total" &&
        (def.outputMode !== "continuous" || def.outputUnit !== "点" || def.formula !== KOYAMA_FORMULA ||
         def.variables.length !== KOYAMA_FIELDS.length || KOYAMA_FIELDS.some(key => !def.variables.some(v => v.field === key))))
      return "Koyama対数モデルはFIM総得点の専用数式・5入力・数値出力（点）を使用してください";
  }
  if (def.type === "logistic_regression" && def.outputMode === "binary" &&
      (def.probabilityThreshold === undefined || !def.positiveMessage || !def.negativeMessage)) {
    return "ロジスティック回帰の二値判定には、文献に基づく確率の判定閾値とメッセージを指定してください";
  }
  if (def.timeline !== undefined) {
    const timeline = literatureTimelineSchema.safeParse(def.timeline);
    if (!timeline.success) return `時間軸: ${timeline.error.issues[0].message}`;
  }
  if (def.type === "regression" && def.outputMode !== "continuous" &&
      (def.threshold === undefined || !def.positiveMessage || !def.negativeMessage)) {
    return "回帰式の判定閾値とメッセージ、または数値出力モードを指定してください";
  }
  if (def.type === "decision_tree") {
    const nodes = new Map(def.nodes.map(node => [node.id, node]));
    if (nodes.size !== def.nodes.length) return "決定木のノードIDが重複しています";
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return false;
      if (visited.has(id)) return true;
      const node = nodes.get(id);
      if (!node) return false;
      if (node.isLeaf) {
        if (def.outputMode === "descriptive") return typeof node.probability === "number" && !!node.message;
        if (def.outputMode === "classified") return typeof node.probability === "number" && !!node.message && (typeof node.isPositive === "boolean" || node.isPositive === null);
        return typeof node.isPositive === "boolean";
      }
      if (!field.safeParse(node.field).success || !node.operator ||
          (!node.operator.startsWith("boolean") && node.threshold === undefined) ||
          !node.trueNodeId || !node.falseNodeId) return false;
      visiting.add(id);
      const valid = visit(node.trueNodeId) && visit(node.falseNodeId);
      visiting.delete(id);
      visited.add(id);
      return valid;
    };
    if (!def.nodes.every(node => visit(node.id))) return "決定木に循環・参照切れ・不完全な分岐があります";
  }
  return null;
}
