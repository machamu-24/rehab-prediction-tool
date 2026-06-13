import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  CheckCircle2,
  Edit2,
  Eye,
  ExternalLink,
  Plus,
  Trash2,
  Info,
  ClipboardList,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

// フォームのフィールドキー→日本語ラベルのマップ
const FIELD_LABEL_MAP: Record<string, string> = {
  age: "年齢",
  sex: "性別",
  days_since_onset: "発症後日数",
  days_post_stroke: "発症後日数",
  stroke_type: "病型",
  mmse_score: "MMSE",
  moca_score: "MoCA",
  spatial_neglect: "半側空間無視（USN）",
  cognitive_impairment: "認知障害",
  tct_score: "TCT",
  bbs_score: "BBS / FBS",
  fbs_score: "BBS / FBS",
  fugl_meyer_lower: "Fugl-Meyer 下肢",
  brunnstrom_lower: "Brunnstrom Stage 下肢",
  sitting_balance_30s: "座位保持30秒",
  sit_up_independent: "起居動作（介助不要）",
  leg_strength_good: "下肢筋力（良好）",
  knee_ext_paretic_nm_kg: "麻痺側膝伸展筋力",
  knee_ext_total_nm_kg: "両側合計膝伸展筋力",
  cba_score: "CBA",
  walk_speed_10m: "10m歩行速度",
  tug_seconds: "TUG",
  walking_status: "歩行状態",
  fim_motor_total: "FIM 運動",
  fim_cognitive_total: "FIM 認知",
  fim_total: "FIM 合計",
  adl_independence: "ADL自立",
  care_level: "要介護区分",
  days_onset_to_admission: "発症〜入院日数",
  caregiver_available: "介護者あり",
  continence: "失禁なし",
  cortical_lesion: "皮質病変なし",
  diabetes: "糖尿病",
  delta_bbs: "ΔBBS",
  delta_fim_motor: "ΔFIM運動",
  delta_fim_cognitive: "ΔFIM認知",
  nihss: "NIHSS",
};
function fieldLabel(field: string): string {
  return FIELD_LABEL_MAP[field] ?? field;
}

const RULE_TYPE_OPTIONS = [
  { value: "cutoff",         label: "カットオフ値",     desc: "単一または複合のカットオフ値による判定" },
  { value: "decision_tree",  label: "決定木",           desc: "分岐条件による段階的な判定（EPOS等）" },
  { value: "regression",     label: "重回帰式",         desc: "複数変数の線形結合による数値予測" },
  { value: "scoring_system", label: "スコアリング",     desc: "各変数に点数を割り当て合計で判定" },
  { value: "nomogram",       label: "ノモグラム",       desc: "ロジスティック回帰ベースの確率算出" },
  { value: "composite_rule", label: "複合条件",         desc: "AND/OR/NOT の論理演算による複合判定" },
  { value: "custom_formula", label: "カスタム数式",     desc: "任意の数式を記述（変数名をそのまま使用可）" },
] as const;

const EVIDENCE_LEVEL_OPTIONS = [
  "Systematic Review",
  "RCT",
  "Cohort Study",
  "Case-Control",
  "Expert Classification",
  "Other",
] as const;

const EVIDENCE_COLORS: Record<string, string> = {
  "Systematic Review":    "bg-purple-100 text-purple-800 border-purple-300",
  "RCT":                  "bg-blue-100 text-blue-800 border-blue-300",
  "Cohort Study":         "bg-green-100 text-green-800 border-green-300",
  "Case-Control":         "bg-yellow-100 text-yellow-800 border-yellow-300",
  "Expert Classification":"bg-gray-100 text-gray-700 border-gray-300",
  "Other":                "bg-gray-100 text-gray-600 border-gray-200",
};

const RULE_TYPE_LABELS: Record<string, string> = {
  cutoff:         "カットオフ値",
  decision_tree:  "決定木",
  regression:     "重回帰式",
  scoring_system: "スコアリング",
  nomogram:       "ノモグラム",
  composite_rule: "複合条件",
  custom_formula: "カスタム数式",
};

const EASY_RULE_TYPES = new Set(["cutoff", "regression"]);

// ルール定義のサンプルテンプレート
const RULE_DEFINITION_TEMPLATES: Record<string, string> = {
  cutoff: JSON.stringify({
    type: "cutoff",
    field: "bbs_score",
    fieldLabel: "Berg Balance Scale (BBS)",
    operator: ">=",
    threshold: 14,
    unit: "点",
    positiveMessage: "歩行自立の可能性が高い（BBS ≥ 14）",
    negativeMessage: "歩行介助が必要な可能性（BBS < 14）",
  }, null, 2),
  decision_tree: JSON.stringify({
    type: "decision_tree",
    nodes: [
      { id: "root", field: "sitting_balance_30s", fieldLabel: "座位保持30秒", operator: "boolean", trueNodeId: "check_bbs", falseNodeId: "leaf_neg" },
      { id: "check_bbs", field: "bbs_score", fieldLabel: "BBS", operator: ">=", threshold: 14, trueNodeId: "leaf_pos", falseNodeId: "leaf_neg" },
      { id: "leaf_pos", isLeaf: true, isPositive: true, message: "歩行自立の可能性が高い" },
      { id: "leaf_neg", isLeaf: true, isPositive: false, message: "歩行自立は不確実" },
    ],
  }, null, 2),
  regression: JSON.stringify({
    type: "regression",
    formula: "予測スコア = -5.2 + 0.15 * BBS + 0.08 * FIM運動 - 0.05 * 年齢",
    intercept: -5.2,
    coefficients: [
      { field: "bbs_score", fieldLabel: "BBS", coefficient: 0.15 },
      { field: "fim_motor", fieldLabel: "FIM運動", coefficient: 0.08 },
      { field: "age", fieldLabel: "年齢", coefficient: -0.05 },
    ],
    threshold: 15,
    positiveMessage: "予測スコアが閾値以上です",
    negativeMessage: "予測スコアが閾値未満です",
  }, null, 2),
  scoring_system: JSON.stringify({
    type: "scoring_system",
    items: [
      { field: "nihss", fieldLabel: "NIHSS", unit: "点", bands: [
        { operator: "<=", value: 5, score: 3, label: "軽症" },
        { operator: "<=", value: 15, score: 2, label: "中等症" },
        { operator: ">", value: 15, score: 0, label: "重症" },
      ]},
    ],
    threshold: 2,
    maxScore: 3,
    positiveMessage: "良好な転帰が期待できる",
    negativeMessage: "転帰不良のリスクあり",
  }, null, 2),
  nomogram: JSON.stringify({
    type: "nomogram",
    intercept: -3.5,
    variables: [
      { field: "age", fieldLabel: "年齢", coefficient: -0.04 },
      { field: "nihss", fieldLabel: "NIHSS", coefficient: -0.18 },
      { field: "bbs_score", fieldLabel: "BBS", coefficient: 0.12 },
    ],
    probabilityThreshold: 0.5,
    positiveMessage: "転帰良好の確率 ≥ 50%",
    negativeMessage: "転帰良好の確率 < 50%",
  }, null, 2),
  composite_rule: JSON.stringify({
    type: "composite_rule",
    root: {
      logic: "OR",
      children: [
        { logic: "AND", children: [
          { logic: "CONDITION", field: "sex", fieldLabel: "性別", operator: "==", value: "男性" },
          { logic: "CONDITION", field: "nihss", fieldLabel: "NIHSS", operator: "<=", value: 7.5 },
        ]},
        { logic: "AND", children: [
          { logic: "CONDITION", field: "sex", fieldLabel: "性別", operator: "==", value: "女性" },
          { logic: "CONDITION", field: "nihss", fieldLabel: "NIHSS", operator: "<=", value: 5.5 },
        ]},
      ],
    },
    positiveMessage: "カットオフ以下（良好な転帰）",
    negativeMessage: "カットオフ超過（転帰不良リスク）",
  }, null, 2),
  custom_formula: JSON.stringify({
    type: "custom_formula",
    formula: "0.3 * bbs_score + 0.2 * tct_score - 0.1 * nihss",
    formulaDescription: "BBS、TCT、NIHSSから予測スコアを計算",
    variables: [
      { field: "bbs_score", fieldLabel: "BBS", unit: "点" },
      { field: "tct_score", fieldLabel: "TCT", unit: "点" },
      { field: "nihss", fieldLabel: "NIHSS", unit: "点" },
    ],
    threshold: 15,
    positiveMessage: "スコア ≥ 15: 良好な転帰が期待できる",
    negativeMessage: "スコア < 15: 転帰不良のリスクあり",
  }, null, 2),
};

type ConditionOperator = "<=" | ">=" | "<" | ">" | "==" | "!=" | "equals" | "boolean" | "boolean_negative";

type ApplyConditionForm = {
  field: string;
  label: string;
  operator: ConditionOperator;
  value: string;
};

const APPLY_CONDITION_OPERATORS: { value: string; label: string }[] = [
  { value: "<=", label: "≤ 以下" },
  { value: ">=", label: "≥ 以上" },
  { value: "<",  label: "< 未満" },
  { value: ">",  label: "> 超" },
  { value: "==", label: "= 等しい" },
  { value: "!=",     label: "≠ 等しくない" },
  { value: "boolean", label: "boolean（真偽値）" },
  { value: "boolean_negative", label: "boolean（偽）" },
];

const PATIENT_FIELD_OPTIONS = [
  { value: "days_post_stroke",       label: "発症日数" },
  { value: "days_since_onset",       label: "発症後日数" },
  { value: "days_onset_to_admission", label: "発症から入院までの日数" },
  { value: "age",                    label: "年齢" },
  { value: "sex",                    label: "性別" },
  { value: "stroke_type",            label: "病型" },
  { value: "nihss",                  label: "NIHSS" },
  { value: "mmse_score",             label: "MMSE" },
  { value: "moca_score",             label: "MoCA" },
  { value: "cba_score",              label: "CBA" },
  { value: "tct_score",              label: "TCT" },
  { value: "bbs_score",              label: "BBS" },
  { value: "fbs_score",              label: "FBS" },
  { value: "fugl_meyer_lower",       label: "Fugl-Meyer下肢" },
  { value: "brunnstrom_lower",       label: "Brunnstrom Stage 下肢" },
  { value: "sitting_balance_30s",    label: "座位保持30秒" },
  { value: "sit_up_independent",     label: "起居動作（介助不要）" },
  { value: "leg_strength_good",      label: "下肢筋力（良好）" },
  { value: "knee_ext_paretic_nm_kg", label: "麻痺側膝伸展筋力" },
  { value: "knee_ext_total_nm_kg",   label: "両側合計膝伸展筋力" },
  { value: "walk_speed_10m",         label: "10m歩行速度" },
  { value: "tug_seconds",            label: "TUG" },
  { value: "walking_status",         label: "歩行状態" },
  { value: "fim_motor",              label: "FIM運動" },
  { value: "fim_cognitive",          label: "FIM認知" },
  { value: "fim_motor_total",        label: "FIM 運動項目合計" },
  { value: "fim_cognitive_total",    label: "FIM 認知項目合計" },
  { value: "fim_total",              label: "FIM合計" },
  { value: "adl_independence",       label: "ADL自立" },
  { value: "care_level",             label: "要介護認定区分" },
  { value: "caregiver_available",    label: "介護者あり" },
  { value: "continence",             label: "失禁なし" },
  { value: "cortical_lesion",        label: "皮質病変なし" },
  { value: "diabetes",               label: "糖尿病" },
  { value: "delta_bbs",              label: "ΔBBS" },
  { value: "delta_fim_motor",        label: "ΔFIM運動" },
  { value: "delta_fim_cognitive",    label: "ΔFIM認知" },
] as const;

type RuleForm = {
  outcomeId: string;
  name: string;
  ruleType: string;
  source: string;
  sourceUrl: string;
  evidenceLevel: string;
  ruleDefinition: string;
  applyConditions: ApplyConditionForm[];
  accuracy: string;
  sensitivity: string;
  specificity: string;
  auc: string;
  consensusEligible: boolean;
  isActive: boolean;
  sortOrder: string;
};

type CutoffBuilderForm = {
  field: string;
  fieldLabel: string;
  operator: "<=" | ">=" | "<" | ">";
  threshold: string;
  unit: string;
  positiveMessage: string;
  negativeMessage: string;
};

type RegressionCoefficientForm = {
  field: string;
  fieldLabel: string;
  coefficient: string;
  unit: string;
};

type RegressionBuilderForm = {
  formula: string;
  intercept: string;
  threshold: string;
  positiveMessage: string;
  negativeMessage: string;
  coefficients: RegressionCoefficientForm[];
};

type RulePreview = {
  key: string;
  definition: Record<string, unknown>;
  requiredFields: string[];
  logicLines: string[];
};

const defaultForm: RuleForm = {
  outcomeId: "",
  name: "",
  ruleType: "cutoff",
  source: "",
  sourceUrl: "",
  evidenceLevel: "Cohort Study",
  ruleDefinition: RULE_DEFINITION_TEMPLATES["cutoff"],
  applyConditions: [],
  accuracy: "",
  sensitivity: "",
  specificity: "",
  auc: "",
  consensusEligible: true,
  isActive: true,
  sortOrder: "0",
};

const defaultCutoffBuilder: CutoffBuilderForm = {
  field: "bbs_score",
  fieldLabel: "BBS",
  operator: ">=",
  threshold: "14",
  unit: "点",
  positiveMessage: "歩行自立の可能性が高い",
  negativeMessage: "歩行自立は困難な可能性",
};

const defaultRegressionBuilder: RegressionBuilderForm = {
  formula: "予測スコア = 切片 + 各係数 × 評価値",
  intercept: "0",
  threshold: "0",
  positiveMessage: "予測値が閾値以上です",
  negativeMessage: "予測値が閾値未満です",
  coefficients: [
    { field: "bbs_score", fieldLabel: "BBS", coefficient: "0.1", unit: "点" },
  ],
};

function patientFieldLabel(value: string): string {
  return PATIENT_FIELD_OPTIONS.find((f) => f.value === value)?.label ?? value;
}

function normalizeConditionOperator(operator: unknown): ConditionOperator {
  if (operator === "equals") return "==";
  if (
    operator === "<=" ||
    operator === ">=" ||
    operator === "<" ||
    operator === ">" ||
    operator === "==" ||
    operator === "!=" ||
    operator === "boolean" ||
    operator === "boolean_negative"
  ) {
    return operator;
  }
  return ">=";
}

function parseRequiredNumber(value: string, label: string): number {
  const n = Number(value);
  if (value.trim() === "" || Number.isNaN(n)) {
    throw new Error(`${label}を数値で入力してください`);
  }
  return n;
}

function extractPreviewFields(def: Record<string, unknown>): string[] {
  if (def.type === "cutoff") {
    const fields = [String(def.field ?? "")];
    const secondary = Array.isArray(def.secondaryConditions) ? def.secondaryConditions : [];
    for (const cond of secondary) {
      if (cond && typeof cond === "object" && "field" in cond) {
        fields.push(String((cond as { field?: unknown }).field ?? ""));
      }
    }
    return fields.filter(Boolean);
  }
  if (def.type === "regression") {
    const coefficients = Array.isArray(def.coefficients) ? def.coefficients : [];
    return coefficients
      .map((coef) => coef && typeof coef === "object" ? String((coef as { field?: unknown }).field ?? "") : "")
      .filter(Boolean);
  }
  return [];
}

type LiteratureRule = {
  id: number;
  outcomeId: number;
  name: string;
  ruleType: string;
  source: string;
  sourceUrl: string | null;
  evidenceLevel: string;
  accuracy: number | null;
  sensitivity: number | null;
  specificity: number | null;
  auc: number | null;
  consensusEligible: boolean;
  isActive: boolean;
  sortOrder: number;
};

export default function RulesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<LiteratureRule | null>(null);
  const [form, setForm] = useState<RuleForm>(defaultForm);
  const [cutoffBuilder, setCutoffBuilder] = useState<CutoffBuilderForm>(defaultCutoffBuilder);
  const [regressionBuilder, setRegressionBuilder] = useState<RegressionBuilderForm>(defaultRegressionBuilder);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [filterOutcomeId, setFilterOutcomeId] = useState<string>("all");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: outcomes } = trpc.outcomes.list.useQuery();
  const { data: rules, isLoading } = trpc.rules.list.useQuery({
    outcomeId: filterOutcomeId !== "all" ? Number(filterOutcomeId) : undefined,
  });

  const createMutation = trpc.rules.create.useMutation({
    onSuccess: () => {
      utils.rules.list.invalidate();
      toast.success("文献ルールを登録しました");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(`エラー: ${e.message}`),
  });

  const updateMutation = trpc.rules.update.useMutation({
    onSuccess: () => {
      utils.rules.list.invalidate();
      toast.success("文献ルールを更新しました");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(`エラー: ${e.message}`),
  });

  const deleteMutation = trpc.rules.delete.useMutation({
    onSuccess: () => {
      utils.rules.list.invalidate();
      toast.success("文献ルールを削除しました");
      setDeleteId(null);
    },
    onError: (e) => toast.error(`エラー: ${e.message}`),
  });

  const isEasyRuleType = EASY_RULE_TYPES.has(form.ruleType);
  const previewKey = JSON.stringify({
    form: isEasyRuleType ? { ...form, ruleDefinition: "" } : form,
    cutoffBuilder,
    regressionBuilder,
  });
  const previewIsCurrent = preview?.key === previewKey;

  const openCreate = () => {
    setEditTarget(null);
    setForm(defaultForm);
    setCutoffBuilder(defaultCutoffBuilder);
    setRegressionBuilder(defaultRegressionBuilder);
    setPreview(null);
    setJsonError(null);
    setDialogOpen(true);
  };

  const openEdit = (r: LiteratureRule & { ruleDefinition?: unknown; applyConditions?: unknown }) => {
    setEditTarget(r);
    const rawConds = Array.isArray(r.applyConditions) ? r.applyConditions as Array<Record<string, unknown>> : [];
    const def = r.ruleDefinition && typeof r.ruleDefinition === "object"
      ? r.ruleDefinition as Record<string, unknown>
      : {};
    if (def.type === "cutoff") {
      setCutoffBuilder({
        field: String(def.field ?? defaultCutoffBuilder.field),
        fieldLabel: String(def.fieldLabel ?? patientFieldLabel(String(def.field ?? defaultCutoffBuilder.field))),
        operator: (def.operator as CutoffBuilderForm["operator"]) ?? defaultCutoffBuilder.operator,
        threshold: String(def.threshold ?? defaultCutoffBuilder.threshold),
        unit: String(def.unit ?? ""),
        positiveMessage: String(def.positiveMessage ?? defaultCutoffBuilder.positiveMessage),
        negativeMessage: String(def.negativeMessage ?? defaultCutoffBuilder.negativeMessage),
      });
    } else if (def.type === "regression") {
      const rawCoefficients = Array.isArray(def.coefficients) ? def.coefficients as Array<Record<string, unknown>> : [];
      setRegressionBuilder({
        formula: String(def.formula ?? defaultRegressionBuilder.formula),
        intercept: String(def.intercept ?? defaultRegressionBuilder.intercept),
        threshold: String(def.threshold ?? defaultRegressionBuilder.threshold),
        positiveMessage: String(def.positiveMessage ?? defaultRegressionBuilder.positiveMessage),
        negativeMessage: String(def.negativeMessage ?? defaultRegressionBuilder.negativeMessage),
        coefficients: rawCoefficients.length > 0
          ? rawCoefficients.map((coef) => {
              const field = String(coef.field ?? "bbs_score");
              return {
                field,
                fieldLabel: String(coef.fieldLabel ?? patientFieldLabel(field)),
                coefficient: String(coef.coefficient ?? "0"),
                unit: String(coef.unit ?? ""),
              };
            })
          : defaultRegressionBuilder.coefficients,
      });
    } else {
      setCutoffBuilder(defaultCutoffBuilder);
      setRegressionBuilder(defaultRegressionBuilder);
    }
    setForm({
      outcomeId: r.outcomeId.toString(),
      name: r.name,
      ruleType: r.ruleType,
      source: r.source,
      sourceUrl: r.sourceUrl ?? "",
      evidenceLevel: r.evidenceLevel,
      ruleDefinition: JSON.stringify(r.ruleDefinition ?? {}, null, 2),
      applyConditions: rawConds.map((c) => ({
        field: String(c.field ?? ""),
        label: String(c.label ?? ""),
        operator: normalizeConditionOperator(c.operator),
        value: String(c.value ?? ""),
      })),
      accuracy: r.accuracy?.toString() ?? "",
      sensitivity: r.sensitivity?.toString() ?? "",
      specificity: r.specificity?.toString() ?? "",
      auc: r.auc?.toString() ?? "",
      consensusEligible: r.consensusEligible,
      isActive: r.isActive,
      sortOrder: r.sortOrder.toString(),
    });
    setPreview(null);
    setJsonError(null);
    setDialogOpen(true);
  };

  const handleRuleTypeChange = (v: string) => {
    setForm((f) => ({
      ...f,
      ruleType: v,
      ruleDefinition: RULE_DEFINITION_TEMPLATES[v] ?? "{}",
    }));
    setPreview(null);
    if (v === "cutoff") setCutoffBuilder(defaultCutoffBuilder);
    if (v === "regression") setRegressionBuilder(defaultRegressionBuilder);
  };

  const validateJson = (v: string) => {
    try {
      JSON.parse(v);
      setJsonError(null);
      return true;
    } catch {
      setJsonError("JSONの形式が正しくありません");
      return false;
    }
  };

  const buildRuleDefinition = (): { definition: Record<string, unknown>; logicLines: string[] } => {
    if (form.ruleType === "cutoff") {
      if (!cutoffBuilder.field) throw new Error("評価項目を選択してください");
      if (!cutoffBuilder.fieldLabel.trim()) throw new Error("評価項目の表示名を入力してください");
      if (!cutoffBuilder.positiveMessage.trim()) throw new Error("条件を満たした場合のメッセージを入力してください");
      if (!cutoffBuilder.negativeMessage.trim()) throw new Error("条件を満たさない場合のメッセージを入力してください");
      const threshold = parseRequiredNumber(cutoffBuilder.threshold, "カットオフ値");
      const unit = cutoffBuilder.unit.trim();
      const definition = {
        type: "cutoff",
        field: cutoffBuilder.field,
        fieldLabel: cutoffBuilder.fieldLabel.trim(),
        operator: cutoffBuilder.operator,
        threshold,
        unit,
        positiveMessage: cutoffBuilder.positiveMessage.trim(),
        negativeMessage: cutoffBuilder.negativeMessage.trim(),
      };
      return {
        definition,
        logicLines: [
          `${definition.fieldLabel} ${definition.operator} ${threshold}${unit ? ` ${unit}` : ""}`,
          `条件を満たす: ${definition.positiveMessage}`,
          `条件を満たさない: ${definition.negativeMessage}`,
        ],
      };
    }

    if (form.ruleType === "regression") {
      const intercept = parseRequiredNumber(regressionBuilder.intercept, "切片");
      const threshold = parseRequiredNumber(regressionBuilder.threshold, "判定閾値");
      if (!regressionBuilder.positiveMessage.trim()) throw new Error("閾値以上の場合のメッセージを入力してください");
      if (!regressionBuilder.negativeMessage.trim()) throw new Error("閾値未満の場合のメッセージを入力してください");

      const coefficients = regressionBuilder.coefficients.map((coef, index) => {
        if (!coef.field) throw new Error(`係数${index + 1}の評価項目を選択してください`);
        if (!coef.fieldLabel.trim()) throw new Error(`係数${index + 1}の表示名を入力してください`);
        return {
          field: coef.field,
          fieldLabel: coef.fieldLabel.trim(),
          coefficient: parseRequiredNumber(coef.coefficient, `係数${index + 1}`),
          unit: coef.unit.trim() || undefined,
        };
      });
      if (coefficients.length === 0) throw new Error("回帰式には少なくとも1つの係数が必要です");

      const formula = regressionBuilder.formula.trim() || [
        `予測値 = ${intercept}`,
        ...coefficients.map((coef) => `${coef.coefficient >= 0 ? "+" : "-"} ${Math.abs(coef.coefficient)} * ${coef.fieldLabel}`),
      ].join(" ");
      const definition = {
        type: "regression",
        formula,
        intercept,
        coefficients,
        threshold,
        positiveMessage: regressionBuilder.positiveMessage.trim(),
        negativeMessage: regressionBuilder.negativeMessage.trim(),
      };
      return {
        definition,
        logicLines: [
          formula,
          `判定: 予測値 >= ${threshold} なら陽性`,
          `閾値以上: ${definition.positiveMessage}`,
          `閾値未満: ${definition.negativeMessage}`,
        ],
      };
    }

    try {
      const parsed = JSON.parse(form.ruleDefinition);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("ルール定義JSONはオブジェクトで入力してください");
      }
      return {
        definition: parsed as Record<string, unknown>,
        logicLines: ["詳細JSONからルール定義を読み込みます"],
      };
    } catch (e) {
      setJsonError("JSONの形式が正しくありません");
      throw e instanceof Error ? e : new Error("JSONの形式が正しくありません");
    }
  };

  const handlePreview = () => {
    if (!form.outcomeId) { toast.warning("アウトカムを選択してください"); return; }
    if (!form.name.trim()) { toast.warning("ルール名を入力してください"); return; }
    if (!form.source.trim()) { toast.warning("文献情報を入力してください"); return; }

    try {
      const { definition, logicLines } = buildRuleDefinition();
      const requiredFields = Array.from(new Set(extractPreviewFields(definition)));
      if (isEasyRuleType) {
        setForm((f) => ({ ...f, ruleDefinition: JSON.stringify(definition, null, 2) }));
      }
      setPreview({
        key: previewKey,
        definition,
        requiredFields,
        logicLines,
      });
      setJsonError(null);
      toast.success("プレビューを更新しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "プレビューを作成できませんでした");
    }
  };

  const handleSubmit = () => {
    if (!form.outcomeId) { toast.warning("アウトカムを選択してください"); return; }
    if (!form.name.trim()) { toast.warning("ルール名を入力してください"); return; }
    if (!form.source.trim()) { toast.warning("文献情報を入力してください"); return; }
    if (!preview || !previewIsCurrent) { toast.warning("登録前にプレビューを確認してください"); return; }

    const data = {
      outcomeId: Number(form.outcomeId),
      name: form.name,
      ruleType: form.ruleType as "cutoff" | "decision_tree" | "regression" | "scoring_system" | "nomogram" | "composite_rule" | "custom_formula",
      source: form.source,
      sourceUrl: form.sourceUrl || undefined,
      evidenceLevel: form.evidenceLevel as "Systematic Review" | "RCT" | "Cohort Study" | "Case-Control" | "Expert Classification" | "Other",
      applyConditions: form.applyConditions.map((c) => ({
        field: c.field,
        label: c.label || (PATIENT_FIELD_OPTIONS.find((f) => f.value === c.field)?.label ?? c.field),
        operator: normalizeConditionOperator(c.operator),
        value: isNaN(Number(c.value)) ? c.value : Number(c.value),
      })),
      ruleDefinition: preview.definition,
      accuracy: form.accuracy ? Number(form.accuracy) : null,
      sensitivity: form.sensitivity ? Number(form.sensitivity) : null,
      specificity: form.specificity ? Number(form.specificity) : null,
      auc: form.auc ? Number(form.auc) : null,
      consensusEligible: form.consensusEligible,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder) || 0,
    };

    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const outcomeName = (id: number) => outcomes?.find((o) => o.id === id)?.name ?? `ID:${id}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">文献ルール管理</h1>
            <p className="text-sm text-muted-foreground">予後予測に使用する文献ルールを登録・管理します</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filterOutcomeId} onValueChange={setFilterOutcomeId}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="アウトカムで絞り込み" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのアウトカム</SelectItem>
              {outcomes?.map((o) => (
                <SelectItem key={o.id} value={o.id.toString()}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            新規登録
          </Button>
        </div>
      </div>

      {/* ルール一覧 */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : rules?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>文献ルールが登録されていません</p>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              最初のルールを登録する
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules?.map((r) => (
            <Card key={r.id} className={`transition-all hover:shadow-sm ${!r.isActive ? "opacity-60" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{r.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {RULE_TYPE_LABELS[r.ruleType] ?? r.ruleType}
                      </Badge>
                      <Badge variant="outline" className={`text-xs border ${EVIDENCE_COLORS[r.evidenceLevel] ?? ""}`}>
                        {r.evidenceLevel}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {outcomeName(r.outcomeId)}
                      </Badge>
                      {!r.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">無効</Badge>}
                      {!r.consensusEligible && <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">コンセンサス除外</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 truncate">{r.source}</p>
                    {/* 必要な評価項目表示 */}
                    {("requiredFields" in r) && (r as { requiredFields?: string[] }).requiredFields && (r as { requiredFields?: string[] }).requiredFields!.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <ClipboardList className="h-3.5 w-3.5 text-blue-600" />
                          <span className="text-xs font-medium text-blue-700">必要な評価項目</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(r as { requiredFields?: string[] }).requiredFields!.map((f) => (
                            <span key={f} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              {fieldLabel(f)}
                            </span>
                          ))}
                          {("applyConditionFields" in r) && (r as { applyConditionFields?: Array<{field: string; label: string}> }).applyConditionFields && (r as { applyConditionFields?: Array<{field: string; label: string}> }).applyConditionFields!.length > 0 && (
                            <>
                              <span className="inline-flex items-center px-1.5 py-0.5 text-xs text-muted-foreground">適用条件:</span>
                              {(r as { applyConditionFields?: Array<{field: string; label: string}> }).applyConditionFields!.map((c) => (
                                <span key={c.field} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                  {c.label}
                                </span>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                      {r.accuracy    && <span>正確度: <strong>{Number(r.accuracy).toFixed(1)}%</strong></span>}
                      {r.sensitivity && <span>感度: <strong>{Number(r.sensitivity).toFixed(1)}%</strong></span>}
                      {r.specificity && <span>特異度: <strong>{Number(r.specificity).toFixed(1)}%</strong></span>}
                      {r.auc         && <span>AUC: <strong>{r.auc.toFixed(2)}</strong></span>}
                      {r.sourceUrl && (
                        <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />PubMed/文献リンク
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r as LiteratureRule & { ruleDefinition?: unknown; applyConditions?: unknown })}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 登録・編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? "文献ルールを編集" : "文献ルールを新規登録"}</DialogTitle>
            <DialogDescription>
              予後予測に使用する文献ルールの情報を入力してください
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="mt-2">
            <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-5">
              <TabsTrigger value="basic" className="text-xs sm:text-sm">基本情報</TabsTrigger>
              <TabsTrigger value="definition" className="text-xs sm:text-sm">判定ルール</TabsTrigger>
              <TabsTrigger value="conditions" className="text-xs sm:text-sm">適用条件</TabsTrigger>
              <TabsTrigger value="accuracy" className="text-xs sm:text-sm">精度指標</TabsTrigger>
              <TabsTrigger value="preview" className="text-xs sm:text-sm">プレビュー</TabsTrigger>
            </TabsList>

            {/* 基本情報タブ */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>アウトカム <span className="text-destructive">*</span></Label>
                  <Select value={form.outcomeId} onValueChange={(v) => setForm((f) => ({ ...f, outcomeId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {outcomes?.map((o) => (
                        <SelectItem key={o.id} value={o.id.toString()}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>ルールタイプ <span className="text-destructive">*</span></Label>
                  <Select value={form.ruleType} onValueChange={handleRuleTypeChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div>
                            <p className="font-medium">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">{opt.desc}</p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>ルール名 <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="例: BBSカットオフ（退院時歩行自立）"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>文献情報 <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="例: Jenkin et al. (2021) Physiotherapy Canada"
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>文献URL（PubMed等）</Label>
                <Input
                  type="url"
                  placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
                  value={form.sourceUrl}
                  onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>エビデンスレベル</Label>
                <Select value={form.evidenceLevel} onValueChange={(v) => setForm((f) => ({ ...f, evidenceLevel: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVIDENCE_LEVEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.consensusEligible}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, consensusEligible: v }))}
                  />
                  <Label className="text-sm">コンセンサス集計に含める</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  />
                  <Label className="text-sm">有効</Label>
                </div>
              </div>
            </TabsContent>

            {/* 適用条件タブ */}
            <TabsContent value="conditions" className="space-y-3 mt-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-700">
                  <p className="font-medium mb-1">適用条件（前提条件）</p>
                  <p>このルールが適用されるための前提条件を設定します。例：「発症日数 ≤ 7」を設定すると、発症7日以内の患者にのみ適用されます。</p>
                </div>
              </div>
              {form.applyConditions.map((cond, idx) => (
                <div key={idx} className="flex items-end gap-2 p-3 border rounded-lg bg-muted/30">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">フィールド</Label>
                    <Select
                      value={cond.field}
                      onValueChange={(v) => setForm((f) => ({
                        ...f,
                        applyConditions: f.applyConditions.map((c, i) => i === idx ? { ...c, field: v } : c),
                      }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="項目を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {PATIENT_FIELD_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">演算子</Label>
                    <Select
                      value={cond.operator}
                      onValueChange={(v) => setForm((f) => ({
                        ...f,
                        applyConditions: f.applyConditions.map((c, i) => i === idx ? { ...c, operator: v as ConditionOperator } : c),
                      }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {APPLY_CONDITION_OPERATORS.map((op) => (
                          <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">値</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="例: 7"
                      value={cond.value}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        applyConditions: f.applyConditions.map((c, i) => i === idx ? { ...c, value: e.target.value } : c),
                      }))}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                    onClick={() => setForm((f) => ({
                      ...f,
                      applyConditions: f.applyConditions.filter((_, i) => i !== idx),
                    }))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => setForm((f) => ({
                  ...f,
                  applyConditions: [...f.applyConditions, { field: "days_post_stroke", label: "", operator: "<=" as ConditionOperator, value: "7" }],
                }))}
              >
                <Plus className="h-3.5 w-3.5" />
                条件を追加
              </Button>
              {form.applyConditions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  適用条件なし（全患者に適用）
                </p>
              )}
            </TabsContent>

            {/* ルール定義タブ */}
            <TabsContent value="definition" className="space-y-3 mt-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-700">
                  <p className="font-medium mb-1">{isEasyRuleType ? "フォーム入力から判定ルールを作成します" : "このルールタイプは詳細JSON編集です"}</p>
                  <p>{isEasyRuleType ? "入力内容から内部のルール定義を自動生成します。登録前にプレビューで内容を確認してください。" : "決定木・複合条件などは従来の詳細JSONで編集します。登録前プレビューは必須です。"}</p>
                </div>
              </div>

              {form.ruleType === "cutoff" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>評価項目</Label>
                      <Select
                        value={cutoffBuilder.field}
                        onValueChange={(v) => setCutoffBuilder((b) => ({ ...b, field: v, fieldLabel: patientFieldLabel(v) }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PATIENT_FIELD_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>表示名</Label>
                      <Input
                        value={cutoffBuilder.fieldLabel}
                        onChange={(e) => setCutoffBuilder((b) => ({ ...b, fieldLabel: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr] gap-3">
                    <div className="space-y-1.5">
                      <Label>条件</Label>
                      <Select
                        value={cutoffBuilder.operator}
                        onValueChange={(v) => setCutoffBuilder((b) => ({ ...b, operator: v as CutoffBuilderForm["operator"] }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value=">=">以上</SelectItem>
                          <SelectItem value=">">超</SelectItem>
                          <SelectItem value="<=">以下</SelectItem>
                          <SelectItem value="<">未満</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>カットオフ値</Label>
                      <Input
                        type="number"
                        step="any"
                        value={cutoffBuilder.threshold}
                        onChange={(e) => setCutoffBuilder((b) => ({ ...b, threshold: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>単位</Label>
                      <Input
                        placeholder="点、秒、m/s など"
                        value={cutoffBuilder.unit}
                        onChange={(e) => setCutoffBuilder((b) => ({ ...b, unit: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>条件を満たした場合の表示</Label>
                    <Textarea
                      className="min-h-20"
                      value={cutoffBuilder.positiveMessage}
                      onChange={(e) => setCutoffBuilder((b) => ({ ...b, positiveMessage: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>条件を満たさない場合の表示</Label>
                    <Textarea
                      className="min-h-20"
                      value={cutoffBuilder.negativeMessage}
                      onChange={(e) => setCutoffBuilder((b) => ({ ...b, negativeMessage: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {form.ruleType === "regression" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>式の説明</Label>
                    <Textarea
                      className="min-h-20"
                      value={regressionBuilder.formula}
                      onChange={(e) => setRegressionBuilder((b) => ({ ...b, formula: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>切片</Label>
                      <Input
                        type="number"
                        step="any"
                        value={regressionBuilder.intercept}
                        onChange={(e) => setRegressionBuilder((b) => ({ ...b, intercept: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>判定閾値</Label>
                      <Input
                        type="number"
                        step="any"
                        value={regressionBuilder.threshold}
                        onChange={(e) => setRegressionBuilder((b) => ({ ...b, threshold: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>係数</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setRegressionBuilder((b) => ({
                          ...b,
                          coefficients: [...b.coefficients, { field: "age", fieldLabel: "年齢", coefficient: "0", unit: "歳" }],
                        }))}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        係数を追加
                      </Button>
                    </div>
                    {regressionBuilder.coefficients.map((coef, idx) => (
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1.4fr_1.2fr_0.8fr_0.7fr_auto] gap-2 items-end p-3 border rounded-lg bg-muted/30">
                        <div className="space-y-1">
                          <Label className="text-xs">評価項目</Label>
                          <Select
                            value={coef.field}
                            onValueChange={(v) => setRegressionBuilder((b) => ({
                              ...b,
                              coefficients: b.coefficients.map((c, i) => i === idx ? { ...c, field: v, fieldLabel: patientFieldLabel(v) } : c),
                            }))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PATIENT_FIELD_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">表示名</Label>
                          <Input
                            className="h-8 text-xs"
                            value={coef.fieldLabel}
                            onChange={(e) => setRegressionBuilder((b) => ({
                              ...b,
                              coefficients: b.coefficients.map((c, i) => i === idx ? { ...c, fieldLabel: e.target.value } : c),
                            }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">係数</Label>
                          <Input
                            className="h-8 text-xs"
                            type="number"
                            step="any"
                            value={coef.coefficient}
                            onChange={(e) => setRegressionBuilder((b) => ({
                              ...b,
                              coefficients: b.coefficients.map((c, i) => i === idx ? { ...c, coefficient: e.target.value } : c),
                            }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">単位</Label>
                          <Input
                            className="h-8 text-xs"
                            value={coef.unit}
                            onChange={(e) => setRegressionBuilder((b) => ({
                              ...b,
                              coefficients: b.coefficients.map((c, i) => i === idx ? { ...c, unit: e.target.value } : c),
                            }))}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setRegressionBuilder((b) => ({
                            ...b,
                            coefficients: b.coefficients.filter((_, i) => i !== idx),
                          }))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <Label>閾値以上の場合の表示</Label>
                    <Textarea
                      className="min-h-20"
                      value={regressionBuilder.positiveMessage}
                      onChange={(e) => setRegressionBuilder((b) => ({ ...b, positiveMessage: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>閾値未満の場合の表示</Label>
                    <Textarea
                      className="min-h-20"
                      value={regressionBuilder.negativeMessage}
                      onChange={(e) => setRegressionBuilder((b) => ({ ...b, negativeMessage: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {!isEasyRuleType && (
                <div className="space-y-1.5">
                  <Label>ルール定義（JSON）</Label>
                  <Textarea
                    className="font-mono text-xs min-h-64"
                    value={form.ruleDefinition}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, ruleDefinition: e.target.value }));
                      validateJson(e.target.value);
                      setPreview(null);
                    }}
                  />
                  {jsonError && (
                    <p className="text-xs text-destructive">{jsonError}</p>
                  )}
                </div>
              )}
            </TabsContent>

            {/* 精度指標タブ */}
            <TabsContent value="accuracy" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>正確度（Accuracy）</Label>
                  <Input
                    type="number" min="0" max="1" step="0.01"
                    placeholder="0.0〜1.0"
                    value={form.accuracy}
                    onChange={(e) => setForm((f) => ({ ...f, accuracy: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>感度（Sensitivity）</Label>
                  <Input
                    type="number" min="0" max="1" step="0.01"
                    placeholder="0.0〜1.0"
                    value={form.sensitivity}
                    onChange={(e) => setForm((f) => ({ ...f, sensitivity: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>特異度（Specificity）</Label>
                  <Input
                    type="number" min="0" max="1" step="0.01"
                    placeholder="0.0〜1.0"
                    value={form.specificity}
                    onChange={(e) => setForm((f) => ({ ...f, specificity: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>AUC（ROC曲線下面積）</Label>
                  <Input
                    type="number" min="0" max="1" step="0.01"
                    placeholder="0.0〜1.0"
                    value={form.auc}
                    onChange={(e) => setForm((f) => ({ ...f, auc: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>表示順</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
            </TabsContent>

            {/* プレビュータブ */}
            <TabsContent value="preview" className="space-y-4 mt-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <Eye className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
                <div className="text-xs text-emerald-800">
                  <p className="font-medium mb-1">登録前プレビュー</p>
                  <p>登録前に、文献カードとしての表示内容と判定ロジックを確認します。内容を変更した場合はプレビューを更新してください。</p>
                </div>
              </div>

              <Button type="button" className="w-full gap-2" onClick={handlePreview}>
                <Eye className="h-4 w-4" />
                プレビューを更新
              </Button>

              {!preview && (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  まだプレビューが作成されていません。必要項目を入力してからプレビューを更新してください。
                </div>
              )}

              {preview && !previewIsCurrent && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-800">
                    <p className="font-medium mb-1">プレビューが古くなっています</p>
                    <p>入力内容が変更されています。登録する前にプレビューを更新してください。</p>
                  </div>
                </div>
              )}

              {preview && previewIsCurrent && (
                <div className="space-y-3">
                  <Card className="border-emerald-200">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{form.name}</h3>
                            <Badge variant="outline">{RULE_TYPE_LABELS[form.ruleType] ?? form.ruleType}</Badge>
                            <Badge variant="secondary">{form.outcomeId ? outcomeName(Number(form.outcomeId)) : "アウトカム未選択"}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{form.source}</p>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      </div>

                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Calculator className="h-4 w-4 text-primary" />
                          <p className="text-sm font-medium">判定ロジック</p>
                        </div>
                        <div className="space-y-1 text-sm">
                          {preview.logicLines.map((line, idx) => (
                            <p key={idx}>{line}</p>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">必要な評価項目</p>
                        <div className="flex flex-wrap gap-1.5">
                          {preview.requiredFields.length > 0 ? preview.requiredFields.map((field) => (
                            <Badge key={field} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              {fieldLabel(field)}
                            </Badge>
                          )) : (
                            <span className="text-xs text-muted-foreground">ルール定義から自動抽出できる評価項目はありません</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4 gap-2 sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
              {previewIsCurrent ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  プレビュー確認済み
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  登録前プレビューが必要です
                </>
              )}
            </div>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button variant="outline" onClick={handlePreview} className="gap-2">
              <Eye className="h-4 w-4" />
              プレビュー
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending || !!jsonError || !previewIsCurrent}
            >
              {editTarget ? "更新" : "登録"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認 */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>文献ルールを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。このルールを使用した予測履歴の結果も参照できなくなる場合があります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
