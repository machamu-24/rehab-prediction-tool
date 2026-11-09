import { RULE_TYPE_OPTIONS, RULE_TYPE_LABELS, type RuleType } from "@shared/ruleTypes";
import { TimelineEditor, TimelineSummary, emptyTimeline } from "@/components/LiteratureTimeline";
import { parseOptionalTimeline, readTimeline, type LiteratureTimeline } from "@shared/literatureTimeline";
import { PATIENT_FIELDS } from "@/lib/patientFields";
import { validateRuleDefinition } from "@shared/ruleValidation";
import { readNomogramReference } from "@shared/ruleAvailability";
import { ApplyConditionsEditor, CutoffExtraConditions, RuleDefinitionEditor, emptyRuleDraft } from "@/components/RuleDefinitionEditor";
import { compileApplyConditions, compileRuleDraft, describeCondition, isReferenceDraft, previewFields, previewRuleLines, record, requiredNumber, type RuleDraft } from "@/lib/ruleForm";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RuleExclusion } from "@/components/RuleExclusion";
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
  cortical_lesion: "皮質病変",
  diabetes: "糖尿病",
  delta_bbs: "ΔBBS",
  delta_fim_motor: "ΔFIM運動",
  delta_fim_cognitive: "ΔFIM認知",
  nihss: "NIHSS",
};
function fieldLabel(field: string): string {
  return FIELD_LABEL_MAP[field] ?? patientFieldLabel(field);
}

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

const EASY_RULE_TYPES = new Set(["cutoff", "regression"]);

// 新規入力は原著の値を入力してからプレビューする。
const RULE_DEFINITION_TEMPLATES: Record<string, string> = {
  cutoff: JSON.stringify({ type: "cutoff", field: "", fieldLabel: "", operator: ">=", threshold: "", positiveMessage: "", negativeMessage: "" }, null, 2),
  regression: JSON.stringify({ type: "regression", intercept: "", coefficients: [], outputMode: "binary" }, null, 2),
};

type ApplyConditionForm = RuleDraft;

const PATIENT_FIELD_OPTIONS = [
  ...PATIENT_FIELDS.flatMap(section => section.fields).filter(field => field.key.startsWith("admission_") || field.key.startsWith("koyama_") || ["prestroke_mrs", "months_since_onset", "spatial_neglect", "cognitive_impairment", "first_stroke", "prestroke_adl_independent", "supratentorial_stroke", "hemiparesis_present"].includes(field.key)).map(field => ({ value: field.key, label: field.label })),
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
  { value: "cortical_lesion",        label: "皮質病変" },
  { value: "diabetes",               label: "糖尿病" },
  { value: "delta_bbs",              label: "ΔBBS" },
  { value: "delta_fim_motor",        label: "ΔFIM運動" },
  { value: "delta_fim_cognitive",    label: "ΔFIM認知" },
] as const;

type RuleForm = {
  timeline: LiteratureTimeline;
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
  outputMode: "continuous" | "binary";
  outputUnit: string;
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
  conditions: ReturnType<typeof compileApplyConditions>;
};

const defaultForm: RuleForm = {
  timeline: emptyTimeline(),
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
  field: "",
  fieldLabel: "",
  operator: ">=",
  threshold: "",
  unit: "点",
  positiveMessage: "歩行自立の可能性が高い",
  negativeMessage: "歩行自立は困難な可能性",
};

const defaultRegressionBuilder: RegressionBuilderForm = {
  outputMode: "binary", outputUnit: "点",
  formula: "予測スコア = 切片 + 各係数 × 評価値",
  intercept: "",
  threshold: "",
  positiveMessage: "予測値が閾値以上です",
  negativeMessage: "予測値が閾値未満です",
  coefficients: [
    { field: "", fieldLabel: "", coefficient: "", unit: "" },
  ],
};

function patientFieldLabel(value: string): string {
  return PATIENT_FIELD_OPTIONS.find((f) => f.value === value)?.label ?? value;
}

function parseRequiredNumber(value: string, label: string): number {
  return requiredNumber(value, label);
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
  const [activeTab, setActiveTab] = useState("basic");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<(LiteratureRule & {editToken?:string}) | null>(null);
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
  const referenceNomogram = useMemo(() => {
    try {
      return isReferenceDraft(record(JSON.parse(form.ruleDefinition)));
    } catch {
      return null;
    }
  }, [form.ruleDefinition]);
  const previewKey = JSON.stringify({
    form,
    cutoffBuilder,
    regressionBuilder,
  });
  const previewIsCurrent = preview?.key === previewKey;

  const openCreate = () => {
    setActiveTab("basic");
    setEditTarget(null);
    setForm(defaultForm);
    setCutoffBuilder(defaultCutoffBuilder);
    setRegressionBuilder(defaultRegressionBuilder);
    setPreview(null);
    setJsonError(null);
    setDialogOpen(true);
  };

  const openEdit = (r: LiteratureRule & { ruleDefinition?: unknown; applyConditions?: unknown }) => {
    setActiveTab("basic");
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
        outputMode: def.outputMode === "continuous" ? "continuous" : "binary",
        outputUnit: String(def.outputUnit ?? "点"),
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
                coefficient: String(coef.coefficient ?? ""),
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
      timeline: readTimeline(r.ruleDefinition) ?? emptyTimeline(),
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
        ...c,
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
      ruleDefinition: EASY_RULE_TYPES.has(v) ? RULE_DEFINITION_TEMPLATES[v] : JSON.stringify(emptyRuleDraft(v), null, 2),
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
    const rawOriginal = JSON.parse(form.ruleDefinition);
    const original = rawOriginal?.type === form.ruleType ? rawOriginal as Record<string, unknown> : {};
    if (form.ruleType === "cutoff") {
      if (!cutoffBuilder.field) throw new Error("評価項目を選択してください");
      if (!cutoffBuilder.fieldLabel.trim()) throw new Error("評価項目の表示名を入力してください");
      if (!cutoffBuilder.positiveMessage.trim()) throw new Error("条件を満たした場合のメッセージを入力してください");
      if (!cutoffBuilder.negativeMessage.trim()) throw new Error("条件を満たさない場合のメッセージを入力してください");
      const threshold = parseRequiredNumber(cutoffBuilder.threshold, "カットオフ値");
      const unit = cutoffBuilder.unit.trim();
      const definition = {
        ...original,
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
      const continuous = regressionBuilder.outputMode === "continuous";
      const threshold = continuous ? undefined : parseRequiredNumber(regressionBuilder.threshold, "判定閾値");
      if (!continuous && !regressionBuilder.positiveMessage.trim()) throw new Error("閾値以上の場合のメッセージを入力してください");
      if (!continuous && !regressionBuilder.negativeMessage.trim()) throw new Error("閾値未満の場合のメッセージを入力してください");

      const coefficients = regressionBuilder.coefficients.map((coef, index) => {
        if (!coef.field) throw new Error(`係数${index + 1}の評価項目を選択してください`);
        if (!coef.fieldLabel.trim()) throw new Error(`係数${index + 1}の表示名を入力してください`);
        const previous = Array.isArray(original.coefficients) ? original.coefficients.find((c: { field?: string }) => c.field === coef.field) : {};
        return {
          ...previous,
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
        ...original,
        type: "regression",
        outputMode: regressionBuilder.outputMode,
        outputUnit: regressionBuilder.outputUnit.trim(),
        formula,
        intercept,
        coefficients,
        threshold,
        positiveMessage: continuous ? undefined : regressionBuilder.positiveMessage.trim(),
        negativeMessage: continuous ? undefined : regressionBuilder.negativeMessage.trim(),
      };
      return {
        definition,
        logicLines: [
          formula,
          ...(continuous ? [`数値予測として表示（${definition.outputUnit}）。支持・困難の集計には含めません。`] : [
            `判定: 予測値 >= ${threshold} なら陽性`,
            `閾値以上: ${definition.positiveMessage}`,
            `閾値未満: ${definition.negativeMessage}`,
          ]),
        ],
      };
    }

    try {
      const parsed: unknown = JSON.parse(form.ruleDefinition);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("ルール定義JSONはオブジェクトで入力してください");
      }
      return {
        definition: parsed as Record<string, unknown>,
        logicLines: previewRuleLines(compileRuleDraft(record(parsed), false)),
      };
    } catch (e) {
      if (e instanceof SyntaxError) setJsonError("JSONの形式が正しくありません");
      throw e instanceof Error ? e : new Error("JSONの形式が正しくありません");
    }
  };

  const handlePreview = () => {
    if (!form.outcomeId) { toast.warning("アウトカムを選択してください"); return; }
    if (!form.name.trim()) { toast.warning("ルール名を入力してください"); return; }
    if (!form.source.trim()) { toast.warning("文献情報を入力してください"); return; }

    try {
      const built = buildRuleDefinition();
      const definition = compileRuleDraft(built.definition, false);
      const logicLines = built.logicLines;
      if (import.meta.env.VITE_DEMO_MODE !== "true") {
        const timeline = parseOptionalTimeline(form.timeline);
        if (timeline) definition.timeline = timeline;
        else delete definition.timeline;
        if (!editTarget && !definition.timeline) {
          setActiveTab("timeline");
          throw new Error("時間軸を登録してください。日数が不明な場合は、原著の表記や確認できない理由を入力してください。");
        }
      }
      const definitionError = validateRuleDefinition(definition);
      if (definitionError) throw new Error(definitionError);
      if (definition.type !== form.ruleType) throw new Error("選択したルールタイプと定義が一致しません。ルールタイプを確認してください。");
      const conditions = compileApplyConditions(form.applyConditions);
      const requiredFields = Array.from(new Set([...previewFields(definition), ...conditions.map(condition => condition.field)]));
      setPreview({
        key: previewKey,
        definition,
        requiredFields,
        logicLines: form.ruleType === "cutoff" ? [...logicLines, ...(Array.isArray(definition.secondaryConditions) ? definition.secondaryConditions.map(condition => `補助条件：${describeCondition(record(condition))}`) : [])] : logicLines,
        conditions,
      });
      setJsonError(null);
      setActiveTab("preview");
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
      ruleType: form.ruleType as RuleType,
      source: form.source,
      sourceUrl: form.sourceUrl || undefined,
      evidenceLevel: form.evidenceLevel as "Systematic Review" | "RCT" | "Cohort Study" | "Case-Control" | "Expert Classification" | "Other",
      applyConditions: preview.conditions,
      ruleDefinition: preview.definition,
      accuracy: form.accuracy ? Number(form.accuracy) : null,
      sensitivity: form.sensitivity ? Number(form.sensitivity) : null,
      specificity: form.specificity ? Number(form.specificity) : null,
      auc: form.auc ? Number(form.auc) : null,
      consensusEligible: readNomogramReference(preview.definition) ? false : form.consensusEligible,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder) || 0,
    };

    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, editToken: editTarget.editToken ?? "", data });
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
                    <TimelineSummary definition={r.ruleDefinition} />
                    <RuleExclusion definition={r.ruleDefinition} />
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
                              {(r as { applyConditionFields?: Array<{field: string; label: string}> }).applyConditionFields!.map((c, index) => (
                                <span key={`${c.field}-${index}`} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                  {c.label}
                                </span>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                      {r.accuracy != null && <span>正確度: <strong>{(r.accuracy <= 1 ? r.accuracy * 100 : r.accuracy).toFixed(1)}%</strong></span>}
                      {r.sensitivity != null && <span>感度: <strong>{(r.sensitivity <= 1 ? r.sensitivity * 100 : r.sensitivity).toFixed(1)}%</strong></span>}
                      {r.specificity != null && <span>特異度: <strong>{(r.specificity <= 1 ? r.specificity * 100 : r.specificity).toFixed(1)}%</strong></span>}
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
                    <Button aria-label={`${r.name}を編集`} variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r as LiteratureRule & { ruleDefinition?: unknown; applyConditions?: unknown })}>
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

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
            <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-6">
              <TabsTrigger value="basic" className="text-xs sm:text-sm">基本情報</TabsTrigger>
              {import.meta.env.VITE_DEMO_MODE !== "true" && <TabsTrigger value="timeline" className="text-xs sm:text-sm">時間軸</TabsTrigger>}
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
                    checked={referenceNomogram ? false : form.consensusEligible}
                    disabled={Boolean(referenceNomogram)}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, consensusEligible: v }))}
                  />
                  <Label className="text-sm">コンセンサス集計に含める</Label>
                  {referenceNomogram && <span className="text-xs text-muted-foreground">参考文献は集計対象外です</span>}
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

            {import.meta.env.VITE_DEMO_MODE !== "true" && <TabsContent value="timeline" className="mt-4"><TimelineEditor required={!editTarget} value={form.timeline} onChange={timeline=>setForm(f=>({...f,timeline}))}/></TabsContent>}

            {/* 適用条件タブ */}
            <TabsContent value="conditions" className="space-y-3 mt-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-700">
                  <p className="font-medium mb-1">適用条件（前提条件）</p>
                  <p>このルールが適用されるための前提条件を設定します。例：「発症日数 ≤ 7」を設定すると、発症7日以内の患者にのみ適用されます。</p>
                </div>
              </div>
              <ApplyConditionsEditor value={form.applyConditions} onChange={applyConditions => setForm(f => ({ ...f, applyConditions }))} />
            </TabsContent>

            {/* ルール定義タブ */}
            <TabsContent value="definition" className="space-y-3 mt-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-700">
                  <p className="font-medium mb-1">フォーム入力から判定ルールを作成します</p>
                  <p>評価項目・条件・文献の数値を入力し、登録前のプレビューで内容を確認してください。</p>
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

              {form.ruleType === "cutoff" && <CutoffExtraConditions value={form.ruleDefinition} onChange={ruleDefinition => setForm(f => ({ ...f, ruleDefinition }))} />}

              {form.ruleType === "regression" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>結果の表示方法</Label>
                      <Select value={regressionBuilder.outputMode} onValueChange={v => setRegressionBuilder(b => ({ ...b, outputMode: v as "continuous" | "binary" }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="continuous">数値予測</SelectItem><SelectItem value="binary">閾値による判定</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label>出力単位</Label><Input value={regressionBuilder.outputUnit} onChange={e => setRegressionBuilder(b => ({ ...b, outputUnit: e.target.value }))} /></div>
                  </div>
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
                        disabled={regressionBuilder.outputMode === "continuous"}
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
                      disabled={regressionBuilder.outputMode === "continuous"}
                      value={regressionBuilder.positiveMessage}
                      onChange={(e) => setRegressionBuilder((b) => ({ ...b, positiveMessage: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>閾値未満の場合の表示</Label>
                    <Textarea
                      className="min-h-20"
                      disabled={regressionBuilder.outputMode === "continuous"}
                      value={regressionBuilder.negativeMessage}
                      onChange={(e) => setRegressionBuilder((b) => ({ ...b, negativeMessage: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {!isEasyRuleType && (
                <RuleDefinitionEditor key={`${editTarget?.id ?? "new"}-${form.ruleType}`} value={form.ruleDefinition} onChange={value => {
                  setForm(f => ({ ...f, ruleDefinition: value })); validateJson(value); setPreview(null);
                }} />
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
                          <TimelineSummary definition={preview.definition}/>
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
                      <div className="rounded-lg border p-3 space-y-1 text-sm">
                        <p className="font-medium">適用条件（すべて満たす）</p>
                        {preview.conditions.length ? preview.conditions.map((condition, index) => <p key={index}>{describeCondition(condition)}</p>) : <p className="text-muted-foreground">追加の適用条件は設定されていません。</p>}
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
              この操作は取り消せません。文献一覧と今後の照合対象から削除します。過去の照合履歴と、履歴に保存された文献情報・判定結果は残ります。
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
