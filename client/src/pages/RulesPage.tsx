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
  BookOpen,
  Edit2,
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
  sias_visuospatial: "SIAS 視空間認知",
  tct_score: "TCT",
  bbs_score: "BBS / FBS",
  fbs_score: "BBS / FBS",
  motricity_index_lower: "MI 下肢",
  fugl_meyer_lower: "Fugl-Meyer 下肢",
  brunnstrom_lower: "Brunnstrom Stage 下肢",
  trunk_control: "体幹機能スコア",
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
      { id: "root", field: "sitting_balance_30s", fieldLabel: "座位保持30秒", operator: "boolean", trueNodeId: "check_mi", falseNodeId: "leaf_neg" },
      { id: "check_mi", field: "motricity_index_lower", fieldLabel: "MI下肢", operator: ">=", threshold: 25, trueNodeId: "leaf_pos", falseNodeId: "leaf_neg" },
      { id: "leaf_pos", isLeaf: true, isPositive: true, message: "歩行自立の可能性が高い" },
      { id: "leaf_neg", isLeaf: true, isPositive: false, message: "歩行自立は不確実" },
    ],
  }, null, 2),
  regression: JSON.stringify({
    type: "regression",
    intercept: -5.2,
    coefficients: [
      { field: "bbs_score", fieldLabel: "BBS", coefficient: 0.15 },
      { field: "fim_motor", fieldLabel: "FIM運動", coefficient: 0.08 },
      { field: "age", fieldLabel: "年齢", coefficient: -0.05 },
    ],
    outputUnit: "日",
    description: "退院までの予測日数",
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
    coefficients: [
      { field: "age", fieldLabel: "年齢", coefficient: -0.04 },
      { field: "nihss", fieldLabel: "NIHSS", coefficient: -0.18 },
      { field: "bbs_score", fieldLabel: "BBS", coefficient: 0.12 },
    ],
    threshold: 0.5,
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
    threshold: 15,
    operator: ">=",
    outputLabel: "予測スコア",
    positiveMessage: "スコア ≥ 15: 良好な転帰が期待できる",
    negativeMessage: "スコア < 15: 転帰不良のリスクあり",
  }, null, 2),
};

type ConditionOperator = "<=" | ">=" | "<" | ">" | "==" | "!=" | "boolean";

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
];

const PATIENT_FIELD_OPTIONS = [
  { value: "days_post_stroke",       label: "発症日数" },
  { value: "age",                    label: "年齢" },
  { value: "sex",                    label: "性別" },
  { value: "stroke_type",            label: "病型" },
  { value: "nihss",                  label: "NIHSS" },
  { value: "mmse_score",             label: "MMSE" },
  { value: "moca_score",             label: "MoCA" },
  { value: "tct_score",              label: "TCT" },
  { value: "bbs_score",              label: "BBS" },
  { value: "motricity_index_lower",  label: "MI下肢" },
  { value: "fugl_meyer_lower",       label: "Fugl-Meyer下肢" },
  { value: "sitting_balance_30s",    label: "座位保持30秒" },
  { value: "walk_speed_10m",         label: "10m歩行速度" },
  { value: "fim_motor",              label: "FIM運動" },
  { value: "fim_cognitive",          label: "FIM認知" },
  { value: "fim_total",              label: "FIM合計" },
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

  const openCreate = () => {
    setEditTarget(null);
    setForm(defaultForm);
    setJsonError(null);
    setDialogOpen(true);
  };

  const openEdit = (r: LiteratureRule & { ruleDefinition?: unknown; applyConditions?: unknown }) => {
    setEditTarget(r);
    const rawConds = Array.isArray(r.applyConditions) ? r.applyConditions as Array<Record<string, string>> : [];
    setForm({
      outcomeId: r.outcomeId.toString(),
      name: r.name,
      ruleType: r.ruleType,
      source: r.source,
      sourceUrl: r.sourceUrl ?? "",
      evidenceLevel: r.evidenceLevel,
      ruleDefinition: JSON.stringify(r.ruleDefinition ?? {}, null, 2),
      applyConditions: rawConds.map((c) => ({
        field: c.field ?? "",
        label: c.label ?? "",
        operator: (c.operator ?? ">=") as ConditionOperator,
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
    setJsonError(null);
    setDialogOpen(true);
  };

  const handleRuleTypeChange = (v: string) => {
    setForm((f) => ({
      ...f,
      ruleType: v,
      ruleDefinition: RULE_DEFINITION_TEMPLATES[v] ?? "{}",
    }));
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

  const handleSubmit = () => {
    if (!form.outcomeId) { toast.warning("アウトカムを選択してください"); return; }
    if (!form.name.trim()) { toast.warning("ルール名を入力してください"); return; }
    if (!form.source.trim()) { toast.warning("文献情報を入力してください"); return; }
    if (!validateJson(form.ruleDefinition)) return;

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
        operator: c.operator,
        value: isNaN(Number(c.value)) ? c.value : Number(c.value),
      })),
      ruleDefinition: JSON.parse(form.ruleDefinition),
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
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">基本情報</TabsTrigger>
              <TabsTrigger value="definition">ルール定義</TabsTrigger>
              <TabsTrigger value="conditions">適用条件</TabsTrigger>
              <TabsTrigger value="accuracy">精度指標</TabsTrigger>
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
                  <p className="font-medium mb-1">ルール定義はJSON形式で入力します</p>
                  <p>ルールタイプを変更するとテンプレートが自動挿入されます。変数名は患者情報フォームのフィールド名（age, nihss, bbs_score等）と一致させてください。</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>ルール定義（JSON）</Label>
                <Textarea
                  className="font-mono text-xs min-h-64"
                  value={form.ruleDefinition}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, ruleDefinition: e.target.value }));
                    validateJson(e.target.value);
                  }}
                />
                {jsonError && (
                  <p className="text-xs text-destructive">{jsonError}</p>
                )}
              </div>
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
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending || !!jsonError}
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
