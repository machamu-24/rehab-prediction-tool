export const RULE_TYPE_OPTIONS = [
  { value: "cutoff", label: "カットオフ値", desc: "単一または複合のカットオフ値による判定" },
  { value: "decision_tree", label: "決定木", desc: "分岐条件による段階的な判定" },
  { value: "regression", label: "重回帰式", desc: "複数変数の線形結合による数値予測" },
  { value: "scoring_system", label: "スコアリング", desc: "各変数に点数を割り当て合計で判定" },
  { value: "nomogram", label: "ノモグラム", desc: "文献のノモグラムに対応したモデルで算出" },
  { value: "composite_rule", label: "複合条件", desc: "AND/OR/NOT の論理演算による複合判定" },
  { value: "custom_formula", label: "カスタム数式", desc: "任意の数式を記述（変数名をそのまま使用可）" },
  { value: "logistic_regression", label: "ロジスティック回帰", desc: "回帰係数と切片から確率を算出" },
] as const;

export type RuleType = (typeof RULE_TYPE_OPTIONS)[number]["value"];

// Append new values so MySQL's existing enum ordinals retain their meanings.
export const RULE_TYPES = RULE_TYPE_OPTIONS.map(option => option.value) as [RuleType, ...RuleType[]];

export const RULE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  RULE_TYPE_OPTIONS.map(option => [option.value, option.label])
);
