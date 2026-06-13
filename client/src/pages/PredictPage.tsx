import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

const ONSET_DAY_FIELD = "days_since_onset";
const ONSET_DAY_ALIASES = ["days_post_stroke", "days_onset_to_admission"] as const;

const PATIENT_FIELDS: SectionDef[] = [
  { section: "基本情報", fields: [
    { key: "age",              label: "年齢",         type: "number", unit: "歳",  placeholder: "例: 72" },
    { key: "sex",              label: "性別",         type: "select", options: ["男性", "女性"] },
    { key: "days_since_onset", label: "発症後日数",   type: "number", unit: "日",  placeholder: "例: 14" },
    { key: "stroke_type",      label: "病型",         type: "select", options: ["脳梗塞", "脳出血", "くも膜下出血", "その他"] },
  ]},
  { section: "運動機能評価", fields: [
    { key: "brunnstrom_lower",       label: "Brunnstrom Stage 下肢",            type: "number", unit: "ステージ", placeholder: "1〜6" },
    { key: "fugl_meyer_lower",       label: "Fugl-Meyer 下肢（FMA-LE）",        type: "number", unit: "点",  placeholder: "0〜34" },
    { key: "bbs_score",              label: "BBS / FBS（Berg / Functional Balance Scale）", type: "number", unit: "点",  placeholder: "0〜56" },
    { key: "tct_score",              label: "TCT（体幹コントロールテスト）",      type: "number", unit: "点",  placeholder: "0〜100" },
    { key: "knee_ext_paretic_nm_kg", label: "麻痺側膝伸展筋力（Nm/kg）",       type: "number", unit: "Nm/kg", placeholder: "例: 0.45" },
    { key: "knee_ext_total_nm_kg",   label: "両側合計膝伸展筋力（Nm/kg）",     type: "number", unit: "Nm/kg", placeholder: "例: 1.20" },
    { key: "leg_strength_good",      label: "下肢筋力（良好）",                 type: "boolean" },
    { key: "sitting_balance_30s",    label: "座位保持30秒（30秒以上）",         type: "boolean" },
    { key: "sit_up_independent",     label: "起居動作（介助不要）",             type: "boolean" },
  ]},
  { section: "神経学的評価", fields: [
    { key: "mmse_score",          label: "MMSE",                     type: "number", unit: "点",  placeholder: "0〜30" },
    { key: "moca_score",          label: "MoCA",                     type: "number", unit: "点",  placeholder: "0〜30" },
    { key: "cba_score",           label: "CBA（認知関連行動評価）",   type: "number", unit: "点",  placeholder: "0〜30" },
    { key: "spatial_neglect",     label: "半側空間無視（USN）あり",  type: "boolean" },
    { key: "cognitive_impairment",label: "認知障害あり",             type: "boolean" },
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
  { section: "変化量（入棟1ヶ月後評価）", fields: [
    { key: "delta_bbs",           label: "ΔBBS（入棟時→1ヶ月後）",      type: "number", unit: "点", placeholder: "例: 8" },
    { key: "delta_fim_motor",     label: "ΔFIM運動（入棟時→1ヶ月後）",  type: "number", unit: "点", placeholder: "例: 12" },
    { key: "delta_fim_cognitive", label: "ΔFIM認知（入棟時→1ヶ月後）",  type: "number", unit: "点", placeholder: "例: 3" },
  ]},
  { section: "入院時情報・社会的評価", fields: [
    { key: "care_level",              label: "要介護認定区分",          type: "number", unit: "区分", placeholder: "1〜5（1=要介護1）" },
    { key: "caregiver_available",     label: "介護者あり",              type: "boolean" },
    { key: "continence",              label: "失禁なし",                type: "boolean" },
    { key: "cortical_lesion",         label: "皮質病変なし",            type: "boolean" },
    { key: "diabetes",                label: "糖尿病",                  type: "boolean" },
  ]},
];

type RuleResult = {
  ruleId: number;
  ruleName: string;
  ruleType: string;
  source: string;
  sourceUrl: string | null;
  evidenceLevel: string;
  literatureSummary: {
    overview: string | null;
    targetPopulation: string | null;
    predictors: string[];
    clinicalNote: string | null;
  };
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

function formatPercentMetric(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

type RuleStatus = "supports" | "against" | "unknown" | "outside";

function getRuleStatus(result: RuleResult): RuleStatus {
  if (result.isApplicable) {
    return result.isPositive ? "supports" : "against";
  }
  const reason = result.unavailableReason ?? "";
  return reason.includes("適用条件") && !reason.includes("未入力") ? "outside" : "unknown";
}

const RULE_STATUS_STYLES: Record<RuleStatus, {
  label: string;
  border: string;
  bg: string;
  text: string;
  badge: string;
}> = {
  supports: {
    label: "歩行自立を支持",
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    badge: "border-emerald-300 bg-emerald-100 text-emerald-800",
  },
  against: {
    label: "歩行自立困難を示唆",
    border: "border-rose-200",
    bg: "bg-rose-50",
    text: "text-rose-800",
    badge: "border-rose-300 bg-rose-100 text-rose-800",
  },
  unknown: {
    label: "判定不可",
    border: "border-neutral-300",
    bg: "bg-neutral-50",
    text: "text-neutral-900",
    badge: "border-neutral-400 bg-neutral-100 text-neutral-900",
  },
  outside: {
    label: "適用条件外",
    border: "border-blue-200",
    bg: "bg-blue-50",
    text: "text-blue-800",
    badge: "border-blue-300 bg-blue-100 text-blue-800",
  },
};

const RULE_STATUS_ORDER: RuleStatus[] = ["supports", "against", "unknown", "outside"];

function groupRuleResults(results: RuleResult[]): Record<RuleStatus, RuleResult[]> {
  const groups: Record<RuleStatus, RuleResult[]> = {
    supports: [],
    against: [],
    unknown: [],
    outside: [],
  };
  for (const result of results) {
    groups[getRuleStatus(result)].push(result);
  }
  return groups;
}

function LiteratureSummary({ results }: { results: RuleResult[] }) {
  const counts = results.reduce(
    (acc, r) => {
      acc[getRuleStatus(r)] += 1;
      return acc;
    },
    { supports: 0, against: 0, unknown: 0, outside: 0 } as Record<RuleStatus, number>
  );
  const judgedCount = counts.supports + counts.against;
  const primaryStatuses: RuleStatus[] = ["supports", "against"];
  const secondaryStatuses: RuleStatus[] = ["unknown", "outside"];

  return (
    <div id="literature-summary" className="scroll-mt-4">
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">文献照合サマリー</CardTitle>
          <CardDescription>
            入力条件に対して登録済み文献ルールが示す傾向です。患者さんの予測確率ではありません。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>登録文献: <strong className="text-foreground">{results.length}</strong>件</span>
            <span>判定に使えた文献: <strong className="text-foreground">{judgedCount}</strong>件</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {primaryStatuses.map((status) => {
              const style = RULE_STATUS_STYLES[status];
              return (
                <div key={status} className={`rounded-lg border px-4 py-4 ${style.border} ${style.bg}`}>
                  <p className={`text-sm font-semibold ${style.text}`}>{style.label}</p>
                  <p className={`mt-2 text-4xl font-bold leading-none ${style.text}`}>{counts[status]}件</p>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {secondaryStatuses.map((status) => {
              const style = RULE_STATUS_STYLES[status];
              return (
                <div key={status} className={`rounded-md border px-3 py-2 ${style.border} ${style.bg}`}>
                  <p className={`text-[11px] font-medium ${style.text}`}>{style.label}</p>
                  <p className={`text-xl font-semibold leading-tight ${style.text}`}>{counts[status]}件</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RuleResultCard({ result }: { result: RuleResult }) {
  const [open, setOpen] = useState(false);
  const status = getRuleStatus(result);
  const statusStyle = RULE_STATUS_STYLES[status];
  const hasLiteratureSummary =
    Boolean(result.literatureSummary.overview) ||
    Boolean(result.literatureSummary.targetPopulation) ||
    result.literatureSummary.predictors.length > 0 ||
    Boolean(result.literatureSummary.clinicalNote);
  const statusIcon =
    status === "supports"
      ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
      : status === "against"
        ? <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
        : <Info className={`h-4 w-4 shrink-0 ${status === "outside" ? "text-blue-600" : "text-slate-500"}`} />;

  if (!result.isApplicable) {
    return (
      <div className={`rounded-lg border p-3 ${statusStyle.border} ${statusStyle.bg}`}>
        <div className="flex items-start gap-2">
          <span className="mt-0.5">{statusIcon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-medium ${statusStyle.text}`}>{result.ruleName}</p>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusStyle.badge}`}>
                {statusStyle.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{result.unavailableReason}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`rounded-lg border ${statusStyle.border} overflow-hidden`}>
        <CollapsibleTrigger asChild>
          <div className={`flex items-start gap-3 p-3 cursor-pointer hover:opacity-90 transition-opacity ${statusStyle.bg}`}>
            <span className="mt-0.5">{statusIcon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{result.ruleName}</p>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusStyle.badge}`}>
                  {statusStyle.label}
                </Badge>
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
          <div className="px-3 pb-3 pt-2 border-t border-dashed space-y-3">
            {hasLiteratureSummary && (
              <div className="bg-background rounded-md border p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">文献の要点</p>
                {result.literatureSummary.overview && (
                  <p className="text-xs text-muted-foreground">{result.literatureSummary.overview}</p>
                )}
                {result.literatureSummary.targetPopulation && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">対象: </span>
                    {result.literatureSummary.targetPopulation.replace(/^対象[:：]\s*/, "")}
                  </p>
                )}
                {result.literatureSummary.predictors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs font-medium text-foreground mr-1">使用評価:</span>
                    {result.literatureSummary.predictors.map((predictor) => (
                      <Badge key={predictor} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {predictor}
                      </Badge>
                    ))}
                  </div>
                )}
                {result.literatureSummary.clinicalNote && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">補足: </span>
                    {result.literatureSummary.clinicalNote}
                  </p>
                )}
              </div>
            )}

            {result.matchExplanation.length > 0 && (
              <div className="bg-background rounded-md border p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">今回の入力で該当した理由</p>
                <div className="space-y-1">
                  {result.matchExplanation.map((line, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{line}</p>
                  ))}
                </div>
              </div>
            )}

            {/* 精度指標 */}
            {(result.accuracy || result.sensitivity || result.specificity || result.auc) && (
              <div className="flex flex-wrap gap-3 text-xs">
                {result.accuracy    && <span className="text-muted-foreground">文献内正診率: <strong>{formatPercentMetric(Number(result.accuracy))}</strong></span>}
                {result.sensitivity && <span className="text-muted-foreground">感度: <strong>{formatPercentMetric(Number(result.sensitivity))}</strong></span>}
                {result.specificity && <span className="text-muted-foreground">特異度: <strong>{formatPercentMetric(Number(result.specificity))}</strong></span>}
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
  const [summaryScrollRequest, setSummaryScrollRequest] = useState(0);

  const { data: outcomes, isLoading: outcomesLoading } = trpc.outcomes.list.useQuery();
  const selectedOutcome = outcomes?.find((o) => o.id === selectedOutcomeId);

  const requestSummaryScroll = () => {
    setSummaryScrollRequest((request) => request + 1);
  };

  const predictMutation = trpc.predict.run.useMutation({
    onSuccess: (data) => {
      setResult(data as unknown as EngineOutput);
      requestSummaryScroll();
      toast.success("文献照合が完了しました");
    },
    onError: (e) => toast.error(`文献照合エラー: ${e.message}`),
  });

  const fieldLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const section of PATIENT_FIELDS) {
      for (const f of section.fields) {
        map[f.key] = f.label;
      }
    }
    for (const alias of ONSET_DAY_ALIASES) {
      map[alias] = "発症後日数";
    }
    return map;
  }, []);
  const groupedResults = useMemo(() => result ? groupRuleResults(result.results) : null, [result]);

  useEffect(() => {
    if (!result || summaryScrollRequest === 0) return;

    const scrollToSummary = (behavior: ScrollBehavior) => {
      const target = document.getElementById("literature-summary");
      if (!target) return;
      target.scrollIntoView({ behavior, block: "start", inline: "nearest" });
    };

    const frameId = window.requestAnimationFrame(() => scrollToSummary("smooth"));
    const retryIds = [150, 400, 900, 1400].map((delay) =>
      window.setTimeout(() => scrollToSummary("auto"), delay)
    );

    return () => {
      window.cancelAnimationFrame(frameId);
      retryIds.forEach((id) => window.clearTimeout(id));
    };
  }, [result, summaryScrollRequest]);

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
    if (result) {
      requestSummaryScroll();
    }
    const numericInputs: PatientInputs = {};
    for (const [k, v] of Object.entries(inputs)) {
      if (v === "" || v === undefined) continue;
      if (typeof v === "boolean") { numericInputs[k] = v; continue; }
      const n = Number(v);
      numericInputs[k] = isNaN(n) ? v : n;
    }
    const onsetDays = numericInputs[ONSET_DAY_FIELD];
    if (onsetDays !== undefined && onsetDays !== null && onsetDays !== "") {
      for (const alias of ONSET_DAY_ALIASES) {
        numericInputs[alias] = onsetDays;
      }
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
          <h1 className="text-xl font-bold text-foreground">文献照合</h1>
          <p className="text-sm text-muted-foreground">患者情報を入力し、登録済みの文献ルールと照合します</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ---- 左カラム: 入力フォーム ---- */}
        <div className="space-y-4">
          {/* アウトカム選択 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">アウトカム選択</CardTitle>
              <CardDescription>照合するアウトカムを選択してください</CardDescription>
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
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />照合中...</>
              ) : (
                <><BookOpen className="h-4 w-4 mr-2" />入力条件で文献を照合</>
              )}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RefreshCw className="h-4 w-4 mr-2" />リセット
            </Button>
          </div>
        </div>

        {/* ---- 右カラム: 文献照合結果 ---- */}
        <div className="space-y-4">
          {!result ? (
            <Card className="h-64 flex items-center justify-center border-dashed">
              <div className="text-center text-muted-foreground">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">患者情報を入力して文献と照合してください</p>
              </div>
            </Card>
          ) : (
            <>
              {/* 文献照合サマリー */}
              <LiteratureSummary results={result.results} />

              {/* 個別ルール結果 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">該当文献の判定</CardTitle>
                  <CardDescription>
                    判定に使えた文献: {result.consensus.applicableCount}件 / 登録文献: {result.results.length}件
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {groupedResults && RULE_STATUS_ORDER.map((status) => {
                    const items = groupedResults[status];
                    if (items.length === 0) return null;
                    const style = RULE_STATUS_STYLES[status];
                    return (
                      <section key={status} className="space-y-2">
                        <div className={`flex items-center justify-between rounded-md border px-3 py-2 ${style.border} ${style.bg}`}>
                          <h3 className={`text-sm font-semibold ${style.text}`}>{style.label}</h3>
                          <Badge variant="outline" className={`text-xs ${style.badge}`}>{items.length}件</Badge>
                        </div>
                        <div className="space-y-2">
                          {items.map((r) => (
                            <RuleResultCard key={r.ruleId} result={r} />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                  {result.results.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Info className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">このアウトカムに登録された文献ルールがありません</p>
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
                      以下の評価を追加すると、判定できる文献が増えます
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

              {/* 適用条件外の文献 */}
              {result.suggestions.filter((s) => s.reason === "time_condition").length > 0 && (
                <Card className="border-blue-200 bg-blue-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-blue-800">
                      <Info className="h-4 w-4" />
                      適用条件外の文献
                    </CardTitle>
                    <CardDescription className="text-blue-700">
                      現在の入力条件では対象外として扱われた文献です
                    </CardDescription>
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
