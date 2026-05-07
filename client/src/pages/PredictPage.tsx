import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Activity,
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  Info,
  Lightbulb,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

// 3状態トグルコンポーネント（未評価 / あり / なし）
function TriStateToggle({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  const states: { label: string; val: boolean | undefined; activeClass: string }[] = [
    { label: "未評価", val: undefined, activeClass: "bg-muted text-muted-foreground border-border" },
    { label: "あり",   val: true,      activeClass: "bg-emerald-500 text-white border-emerald-500" },
    { label: "なし",   val: false,     activeClass: "bg-red-400 text-white border-red-400" },
  ];
  return (
    <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
      {states.map((s) => (
        <button
          key={String(s.val)}
          type="button"
          onClick={() => onChange(s.val)}
          className={`px-3 py-1.5 transition-colors border-r last:border-r-0 border-border ${
            value === s.val
              ? s.activeClass
              : "bg-background text-muted-foreground hover:bg-muted/60"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

type PatientInputs = Record<string, string | number | boolean | undefined>;

type FieldDef = {
  key: string;
  label: string;
  type: string;
  unit?: string;
  placeholder?: string;
  options?: string[];
};

type SectionDef = {
  section: string;
  fields: FieldDef[];
};

const PATIENT_FIELDS: SectionDef[] = [
  { section: "基本情報", fields: [
    { key: "age",              label: "年齢",         type: "number", unit: "歳",  placeholder: "例: 72" },
    { key: "sex",              label: "性別",         type: "select", options: ["男性", "女性"] },
    { key: "days_since_onset", label: "発症後日数",   type: "number", unit: "日",  placeholder: "例: 14" },
    { key: "stroke_type",      label: "病型",         type: "select", options: ["脳梗塞", "脳出血", "くも膜下出血", "その他"] },
  ]},
  { section: "神経学的評価", fields: [
    { key: "mmse_score",          label: "MMSE",                     type: "number", unit: "点",  placeholder: "0〜30" },
    { key: "moca_score",          label: "MoCA",                     type: "number", unit: "点",  placeholder: "0〜30" },
    { key: "spatial_neglect",     label: "半側空間無視（USN）あり",  type: "boolean" },
    { key: "cognitive_impairment",label: "認知障害あり",             type: "boolean" },
    { key: "sias_visuospatial",   label: "SIAS 視空間認知",          type: "number", unit: "点",  placeholder: "0〜3" },
  ]},
  { section: "運動機能評価", fields: [
    { key: "tct_score",              label: "TCT（体幹コントロールテスト）",      type: "number", unit: "点",  placeholder: "0〜100" },
    { key: "bbs_score",              label: "BBS / FBS（Berg / Functional Balance Scale）", type: "number", unit: "点",  placeholder: "0〜56" },
    { key: "motricity_index_lower",  label: "Motricity Index 下肢",             type: "number", unit: "点",  placeholder: "0〜100" },
    { key: "fugl_meyer_lower",       label: "Fugl-Meyer 下肢（FMA-LE）",        type: "number", unit: "点",  placeholder: "0〜34" },
    { key: "brunnstrom_lower",       label: "Brunnstrom Stage 下肢",            type: "number", unit: "ステージ", placeholder: "1〜6" },
    { key: "trunk_control",          label: "体幹機能スコア",                   type: "number", unit: "点",  placeholder: "0〜100" },
    { key: "sitting_balance_30s",    label: "座位保持30秒（30秒以上）",         type: "boolean" },
    { key: "sit_up_independent",     label: "起居動作（介助不要）",             type: "boolean" },
    { key: "leg_strength_good",      label: "下肢筋力（良好）",                 type: "boolean" },
    { key: "knee_ext_paretic_nm_kg", label: "麻痺側膝伸展筋力（Nm/kg）",       type: "number", unit: "Nm/kg", placeholder: "例: 0.45" },
    { key: "knee_ext_total_nm_kg",   label: "両側合計膝伸展筋力（Nm/kg）",     type: "number", unit: "Nm/kg", placeholder: "例: 1.20" },
    { key: "cba_score",              label: "CBA（認知関連行動評価）",          type: "number", unit: "点",  placeholder: "0〜30" },
  ]},
  { section: "歩行評価", fields: [
    { key: "walk_speed_10m",   label: "10m歩行速度",              type: "number", unit: "m/s", placeholder: "例: 0.65" },
    { key: "tug_seconds",      label: "TUG（Timed Up and Go）",  type: "number", unit: "秒",  placeholder: "例: 20.5" },
    { key: "walking_status",   label: "歩行状態",                 type: "select", options: ["歩行自立", "補助歩行", "非歩行"] },
  ]},
  { section: "ADL評価（FIM）", fields: [
    { key: "fim_motor_total",    label: "FIM 運動項目合計",  type: "number", unit: "点",  placeholder: "13〜91" },
    { key: "fim_cognitive_total",label: "FIM 認知項目合計",  type: "number", unit: "点",  placeholder: "5〜35" },
    { key: "fim_total",          label: "FIM 合計",          type: "number", unit: "点",  placeholder: "18〜126" },
    { key: "adl_independence",   label: "ADL自立（良好）",   type: "boolean" },
  ]},
  { section: "入院時情報・社会的評価", fields: [
    { key: "care_level",              label: "要介護認定区分",          type: "number", unit: "区分", placeholder: "1〜5（1=要介護1）" },
    { key: "days_onset_to_admission", label: "発症から入院までの日数",  type: "number", unit: "日",  placeholder: "例: 14" },
    { key: "caregiver_available",     label: "介護者あり",              type: "boolean" },
    { key: "continence",              label: "失禁なし",                type: "boolean" },
    { key: "cortical_lesion",         label: "皮質病変なし",            type: "boolean" },
    { key: "diabetes",                label: "糖尿病",                  type: "boolean" },
  ]},
  { section: "変化量（入棟1ヶ月後評価）", fields: [
    { key: "delta_bbs",           label: "ΔBBS（入棟時→1ヶ月後）",      type: "number", unit: "点", placeholder: "例: 8" },
    { key: "delta_fim_motor",     label: "ΔFIM運動（入棟時→1ヶ月後）",  type: "number", unit: "点", placeholder: "例: 12" },
    { key: "delta_fim_cognitive", label: "ΔFIM認知（入棟時→1ヶ月後）",  type: "number", unit: "点", placeholder: "例: 3" },
  ]},
];

type RuleResult = {
  ruleId: number;
  ruleName: string;
  ruleType: string;
  source: string;
  sourceUrl: string | null;
  evidenceLevel: string;
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

type ConsensusAnalysis = {
  score: number;
  label: "positive" | "neutral" | "negative";
  positiveCount: number;
  negativeCount: number;
  totalEligible: number;
  applicableCount: number;
};

type SuggestionItem = {
  ruleId: number;
  ruleName: string;
  missingFields: string[];
  outcome: string;
  reason: "missing_input" | "time_condition";
};

type EngineOutput = {
  predictionId?: number;
  results: RuleResult[];
  consensus: ConsensusAnalysis;
  suggestions: SuggestionItem[];
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

const EVIDENCE_COLORS: Record<string, string> = {
  "Systematic Review":    "bg-purple-100 text-purple-800 border-purple-300",
  "RCT":                  "bg-blue-100 text-blue-800 border-blue-300",
  "Cohort Study":         "bg-green-100 text-green-800 border-green-300",
  "Case-Control":         "bg-yellow-100 text-yellow-800 border-yellow-300",
  "Expert Classification":"bg-gray-100 text-gray-700 border-gray-300",
  "Other":                "bg-gray-100 text-gray-600 border-gray-200",
};

function ConsensusGauge({ consensus, outcome }: { consensus: ConsensusAnalysis; outcome: { positiveLabel: string; negativeLabel: string } | undefined }) {
  const pct = Math.round(consensus.score * 100);
  const color = consensus.label === "positive" ? "bg-emerald-500" : consensus.label === "neutral" ? "bg-amber-400" : "bg-red-400";
  const textColor = consensus.label === "positive" ? "text-emerald-700" : consensus.label === "neutral" ? "text-amber-700" : "text-red-700";
  const bgColor = consensus.label === "positive" ? "bg-emerald-50 border-emerald-200" : consensus.label === "neutral" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  const label = consensus.label === "positive" ? (outcome?.positiveLabel ?? "陽性") : consensus.label === "neutral" ? "中間" : (outcome?.negativeLabel ?? "陰性");

  return (
    <div className={`rounded-xl border p-5 ${bgColor}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">コンセンサス分析</p>
          <p className={`text-2xl font-bold ${textColor}`}>{label}</p>
        </div>
        <div className={`text-4xl font-bold ${textColor}`}>{pct}%</div>
      </div>
      <Progress value={pct} className={`h-3 ${color}`} />
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>適用ルール: {consensus.applicableCount}件</span>
        <span>陽性: {consensus.positiveCount} / 陰性: {consensus.negativeCount} / 集計対象: {consensus.totalEligible}件</span>
      </div>
    </div>
  );
}

function RuleResultCard({ result }: { result: RuleResult }) {
  const [open, setOpen] = useState(false);

  if (!result.isApplicable) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3 bg-muted/30">
        <div className="flex items-start gap-2">
          <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{result.ruleName}</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">{result.unavailableReason}</p>
          </div>
        </div>
      </div>
    );
  }

  const isPos = result.isPositive;
  const borderColor = isPos ? "border-emerald-200" : "border-red-200";
  const headerBg = isPos ? "bg-emerald-50" : "bg-red-50";
  const icon = isPos
    ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
    : <XCircle className="h-4 w-4 text-red-500 shrink-0" />;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`rounded-lg border ${borderColor} overflow-hidden`}>
        <CollapsibleTrigger asChild>
          <div className={`flex items-start gap-3 p-3 cursor-pointer hover:opacity-90 transition-opacity ${headerBg}`}>
            {icon}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{result.ruleName}</p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {RULE_TYPE_LABELS[result.ruleType] ?? result.ruleType}
                </Badge>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${EVIDENCE_COLORS[result.evidenceLevel] ?? ""}`}>
                  {result.evidenceLevel}
                </Badge>
              </div>
              <p className="text-xs mt-1">{result.prediction}</p>
              {result.probability !== null && (
                <p className="text-xs text-muted-foreground">確率: {(result.probability * 100).toFixed(1)}%</p>
              )}
            </div>
            <div className="shrink-0 text-muted-foreground">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-2 border-t border-dashed space-y-2">
            {/* 評価詳細 */}
            {result.details.length > 0 && (
              <div className="bg-background rounded-md p-2 space-y-1">
                {result.details.map((d, i) => (
                  <p key={i} className="text-xs text-muted-foreground font-mono">{d}</p>
                ))}
              </div>
            )}
            {/* 精度指標 */}
            {(result.accuracy || result.sensitivity || result.specificity || result.auc) && (
              <div className="flex flex-wrap gap-3 text-xs">
                {result.accuracy    && <span className="text-muted-foreground">正確度: <strong>{Number(result.accuracy).toFixed(1)}%</strong></span>}
                {result.sensitivity && <span className="text-muted-foreground">感度: <strong>{Number(result.sensitivity).toFixed(1)}%</strong></span>}
                {result.specificity && <span className="text-muted-foreground">特異度: <strong>{Number(result.specificity).toFixed(1)}%</strong></span>}
                {result.auc         && <span className="text-muted-foreground">AUC: <strong>{result.auc.toFixed(2)}</strong></span>}
              </div>
            )}
            {/* 文献リンク */}
            <div className="flex items-center gap-2">
              <BookOpen className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">{result.source}</span>
              {result.sourceUrl && (
                <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline shrink-0">
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function PredictPage() {
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<number | null>(null);
  const [inputs, setInputs] = useState<PatientInputs>({});
  const [result, setResult] = useState<EngineOutput | null>(null);

  const { data: outcomes, isLoading: outcomesLoading } = trpc.outcomes.list.useQuery();
  const selectedOutcome = outcomes?.find((o) => o.id === selectedOutcomeId);

  const predictMutation = trpc.predict.run.useMutation({
    onSuccess: (data) => {
      setResult(data as unknown as EngineOutput);
      toast.success("予測が完了しました");
    },
    onError: (e) => toast.error(`予測エラー: ${e.message}`),
  });

  const fieldLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const section of PATIENT_FIELDS) {
      for (const f of section.fields) {
        map[f.key] = f.label;
      }
    }
    return map;
  }, []);

  const handleInputChange = (key: string, value: string | number | boolean | undefined) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setInputs({});
    setResult(null);
  };

  const handlePredict = () => {
    if (!selectedOutcomeId) {
      toast.warning("アウトカムを選択してください");
      return;
    }
    const numericInputs: PatientInputs = {};
    for (const [k, v] of Object.entries(inputs)) {
      if (v === "" || v === undefined) continue;
      if (typeof v === "boolean") { numericInputs[k] = v; continue; }
      const n = Number(v);
      numericInputs[k] = isNaN(n) ? v : n;
    }
    predictMutation.mutate({ outcomeId: selectedOutcomeId, patientInputs: numericInputs });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
          <Activity className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">予測実行</h1>
          <p className="text-sm text-muted-foreground">患者情報を入力し、文献ベースのアウトカム予測を実行します</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ---- 左カラム: 入力フォーム ---- */}
        <div className="space-y-4">
          {/* アウトカム選択 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">アウトカム選択</CardTitle>
              <CardDescription>予測するアウトカムを選択してください</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedOutcomeId?.toString() ?? ""}
                onValueChange={(v) => { setSelectedOutcomeId(Number(v)); setResult(null); }}
                disabled={outcomesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={outcomesLoading ? "読み込み中..." : "アウトカムを選択"} />
                </SelectTrigger>
                <SelectContent>
                  {outcomes?.map((o) => (
                    <SelectItem key={o.id} value={o.id.toString()}>
                      {o.name}{o.unit ? ` (${o.unit})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOutcome && (
                <p className="text-xs text-muted-foreground mt-2">{selectedOutcome.description}</p>
              )}
            </CardContent>
          </Card>

          {/* 患者情報入力 */}
          {PATIENT_FIELDS.map((section) => (
            <Card key={section.section}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {section.section}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {section.fields.map((field) => (
                  <div key={field.key} className="flex items-center gap-3">
                    <Label className="text-sm w-44 shrink-0 leading-tight">{field.label}</Label>
                    {field.type === "boolean" ? (
                      <TriStateToggle
                        value={inputs[field.key] as boolean | undefined}
                        onChange={(v) => handleInputChange(field.key, v)}
                      />
                    ) : field.type === "select" ? (
                      <Select
                        value={(inputs[field.key] as string) ?? ""}
                        onValueChange={(v) => handleInputChange(field.key, v)}
                      >
                        <SelectTrigger className="h-8 text-sm flex-1">
                          <SelectValue placeholder="選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-1">
                        <Input
                          type="number"
                          className="h-8 text-sm"
                          placeholder={field.placeholder}
                          value={(inputs[field.key] as string) ?? ""}
                          onChange={(e) => handleInputChange(field.key, e.target.value)}
                        />
                        {field.unit && (
                          <span className="text-xs text-muted-foreground shrink-0 w-8">{field.unit}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* アクションボタン */}
          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={handlePredict}
              disabled={predictMutation.isPending || !selectedOutcomeId}
            >
              {predictMutation.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />予測中...</>
              ) : (
                <><Activity className="h-4 w-4 mr-2" />予測実行</>
              )}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RefreshCw className="h-4 w-4 mr-2" />リセット
            </Button>
          </div>
        </div>

        {/* ---- 右カラム: 結果表示 ---- */}
        <div className="space-y-4">
          {!result ? (
            <Card className="h-64 flex items-center justify-center border-dashed">
              <div className="text-center text-muted-foreground">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">患者情報を入力して予測を実行してください</p>
              </div>
            </Card>
          ) : (
            <>
              {/* コンセンサスゲージ */}
              <ConsensusGauge consensus={result.consensus} outcome={selectedOutcome ?? undefined} />

              {/* 個別ルール結果 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">個別ルール評価結果</CardTitle>
                  <CardDescription>
                    適用: {result.consensus.applicableCount}件 / 全{result.results.length}件
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {result.results.map((r) => (
                    <RuleResultCard key={r.ruleId} result={r} />
                  ))}
                  {result.results.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Info className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">このアウトカムに登録されたルールがありません</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 追加評価の提案 */}
              {result.suggestions.filter((s) => s.reason === "missing_input").length > 0 && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                      <Lightbulb className="h-4 w-4" />
                      追加評価の提案
                    </CardTitle>
                    <CardDescription className="text-amber-700">
                      以下の評価を追加することで、より多くのルールが適用可能になります
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.suggestions
                      .filter((s) => s.reason === "missing_input")
                      .map((s) => (
                        <div key={s.ruleId} className="flex items-start gap-2 text-sm">
                          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium text-amber-800">{s.ruleName}</span>
                            <span className="text-amber-700">：</span>
                            <span className="text-amber-700">
                              {s.missingFields.map((f) => fieldLookup[f] ?? f).join("、")}
                              の入力が必要です
                            </span>
                          </div>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              )}

              {/* 時期依存ルール */}
              {result.suggestions.filter((s) => s.reason === "time_condition").length > 0 && (
                <Card className="border-blue-200 bg-blue-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-blue-800">
                      <Info className="h-4 w-4" />
                      時期依存ルール（現在適用外）
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {result.suggestions
                      .filter((s) => s.reason === "time_condition")
                      .map((s) => (
                        <p key={s.ruleId} className="text-sm text-blue-700">
                          • {s.ruleName}
                        </p>
                      ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
