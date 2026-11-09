import { RULE_TYPE_LABELS } from "@shared/ruleTypes";
import { FIM_MOTOR_OUTCOME_NAME, getPredictionOutcomes, resolvePredictionOutcomeId } from "@shared/outcomeSelection";
import { TimeQueryEditor } from "@/components/TimeQueryEditor";
import { KoyamaTimeSummary } from "@/components/KoyamaTimeSummary";
import { predictionTimeContext, usesKoyamaTimeAxis, hasKoyamaTimeAxis } from "@/lib/predictionTimeContext";
import { koyamaSharedInputs, koyamaSharedInputSource } from "@/lib/koyamaSharedInputs";
import { getFimTotalCalculation, withCalculatedFimTotals } from "@shared/patientFimTotals";
import { FimTotalCalculation } from "@/components/FimTotalCalculation";
import {
  timeQuerySchema,
  timeMatchLabel,
  requiresTimingReview,
  type TimeQuery,
} from "@shared/literatureTimeline";
import {
  getResultDisplayStatus,
  getExclusionReasonLabel,
  isConsensusResult,
  isContinuousResult,
  REFERENCE_RESULT_DESCRIPTION,
  type ResultDisplayStatus,
} from "@shared/resultStatus";
import { getRuleExclusionReason } from "@shared/ruleAvailability";
const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";
import { TimelineSummary } from "@/components/LiteratureTimeline";
import {
  NumericPredictionResults,
  NumericPredictionValue,
} from "@/components/NumericPredictionResults";
import { patientInputsSchema } from "@shared/patientValidation";
import { omitInvalidPatientScores } from "@shared/patientScoreRanges";
import { PatientNumberInput } from "@/components/PatientNumberInput";
import type {
  EngineOutput as EvaluationOutput,
  RuleEvaluationResult,
} from "@shared/ruleEngine";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

// 3状態トグルコンポーネント（項目ごとに選択肢を明示できる）
function TriStateToggle({
  value,
  onChange,
  labels,
  labelledBy,
  describedBy,
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  labels?: FieldDef["booleanLabels"];
  labelledBy?: string;
  describedBy?: string;
}) {
  const states: {
    label: string;
    val: boolean | undefined;
    activeClass: string;
  }[] = [
    {
      label: "未評価",
      val: undefined,
      activeClass: "bg-muted text-muted-foreground border-border",
    },
    {
      label: labels?.true ?? "あり",
      val: true,
      activeClass: "bg-emerald-500 text-white border-emerald-500",
    },
    {
      label: labels?.false ?? "なし",
      val: false,
      activeClass: "bg-red-400 text-white border-red-400",
    },
  ];
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="flex rounded-md border border-border overflow-hidden text-xs font-medium"
    >
      {states.map(s => (
        <button
          key={String(s.val)}
          type="button"
          aria-pressed={value === s.val}
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

import {
  PATIENT_FIELDS,
  ONSET_DAY_FIELD,
  ONSET_DAY_ALIASES,
  getVisiblePatientSections,
  type FieldDef,
} from "@/lib/patientFields";
import {
  ASSESSMENT_PHASES,
  assessmentSchema,
  getAssessmentFieldPhase,
  isAssessmentFieldAvailable,
  getInputsForAssessmentPhase,
} from "@shared/assessment";

type RuleResult = RuleEvaluationResult;
type EngineOutput = EvaluationOutput & { predictionId?: number };



const EVIDENCE_COLORS: Record<string, string> = {
  "Systematic Review": "bg-purple-100 text-purple-800 border-purple-300",
  RCT: "bg-blue-100 text-blue-800 border-blue-300",
  "Cohort Study": "bg-green-100 text-green-800 border-green-300",
  "Case-Control": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "Expert Classification": "bg-gray-100 text-gray-700 border-gray-300",
  Other: "bg-gray-100 text-gray-600 border-gray-200",
};

function formatPercentMetric(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

type RuleStatus = ResultDisplayStatus;
const getRuleStatus = getResultDisplayStatus;

const RULE_STATUS_STYLES: Record<
  RuleStatus,
  {
    label: string;
    border: string;
    bg: string;
    text: string;
    badge: string;
  }
> = {
  reference: {
    label: "参考結果",
    border: "border-slate-200",
    bg: "bg-slate-50",
    text: "text-slate-700",
    badge: "border-slate-300 bg-slate-100 text-slate-700",
  },
  supports: {
    label: "目標アウトカムを支持",
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    badge: "border-emerald-300 bg-emerald-100 text-emerald-800",
  },
  against: {
    label: "目標アウトカムの達成困難を示唆",
    border: "border-rose-200",
    bg: "bg-rose-50",
    text: "text-rose-800",
    badge: "border-rose-300 bg-rose-100 text-rose-800",
  },
  estimate: {
    label: "数値予測",
    border: "border-violet-200",
    bg: "bg-violet-50",
    text: "text-violet-800",
    badge: "border-violet-300 bg-violet-100 text-violet-800",
  },
  excluded: {
    label: "判定対象外",
    border: "border-neutral-300",
    bg: "bg-neutral-50",
    text: "text-neutral-900",
    badge: "border-neutral-400 bg-neutral-100 text-neutral-900",
  },
};

const RULE_STATUS_ORDER: RuleStatus[] = [
  "supports",
  "against",
  "reference",
  "estimate",
  "excluded",
];

function groupRuleResults(
  results: RuleResult[]
): Record<RuleStatus, RuleResult[]> {
  const groups: Record<RuleStatus, RuleResult[]> = {
    reference: [],
    supports: [],
    against: [],
    estimate: [],
    excluded: [],
  };
  for (const result of results) {
    groups[getRuleStatus(result)].push(result);
  }
  return groups;
}

export function LiteratureSummary({ results }: { results: RuleResult[] }) {
  const continuousResults = results.filter(isContinuousResult);
  const classificationResults = results.filter(
    result => !isContinuousResult(result)
  );
  const counts = classificationResults.reduce(
    (acc, r) => {
      acc[getRuleStatus(r)] += 1;
      return acc;
    },
    {
      reference: 0,
      supports: 0,
      against: 0,
      estimate: 0,
      excluded: 0,
    } as Record<RuleStatus, number>
  );
  const judgedCount =
    counts.supports + counts.against + counts.estimate + counts.reference;
  const primaryStatuses: RuleStatus[] = ["supports", "against"];
  const secondaryStatuses: RuleStatus[] = ["reference", "excluded"];
  const aggregatedResults = classificationResults.filter(isConsensusResult);
  const timingReviewCount = aggregatedResults.filter(
    r => requiresTimingReview(r.timeMatch)
  ).length;

  return (
    <div id="literature-summary" className="scroll-mt-20 space-y-4">
      {continuousResults.length > 0 && (
        <NumericPredictionResults results={continuousResults} />
      )}
      {(classificationResults.length > 0 || results.length === 0) && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">文献照合サマリー</CardTitle>
            <CardDescription>
              入力条件に対して登録済み文献ルールが示す傾向です。患者さんの予測確率ではありません。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                登録ルール:{" "}
                <strong className="text-foreground">
                  {classificationResults.length}
                </strong>
                件
              </span>
              <span>
                評価できたルール:{" "}
                <strong className="text-foreground">{judgedCount}</strong>件
              </span>
            </div>
            {classificationResults.some(r => r.timeMatch) && (
              <p className="text-xs text-muted-foreground">
                支持・困難の集計対象：{aggregatedResults.length}件
                {" ／ うち評価時期の確認："}{timingReviewCount}件
              </p>
            )}
            {classificationResults.some(r => requiresTimingReview(r.timeMatch)) && (
              <p className="text-xs text-muted-foreground">
                日数差による集計の制限はありません。各文献の評価時点・アウトカム測定時点は詳細で確認できます。
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {primaryStatuses.map(status => {
                const style = RULE_STATUS_STYLES[status];
                return (
                  <div
                    key={status}
                    className={`rounded-lg border px-4 py-4 ${style.border} ${style.bg}`}
                  >
                    <p className={`text-sm font-semibold ${style.text}`}>
                      {style.label}
                    </p>
                    <p
                      className={`mt-2 text-4xl font-bold leading-none ${style.text}`}
                    >
                      {counts[status]}件
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {secondaryStatuses.map(status => {
                const style = RULE_STATUS_STYLES[status];
                return (
                  <div
                    key={status}
                    className={`rounded-md border px-3 py-2 ${style.border} ${style.bg}`}
                  >
                    <p className={`text-[11px] font-medium ${style.text}`}>
                      {style.label}
                    </p>
                    <p
                      className={`text-xl font-semibold leading-tight ${style.text}`}
                    >
                      {counts[status]}件
                    </p>
                  </div>
                );
              })}
            </div>
            {counts.reference > 0 && (
              <p className="text-xs text-muted-foreground">
                参考結果：{REFERENCE_RESULT_DESCRIPTION}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RuleResultCard({ result, classification = false }: { result: RuleResult; classification?: boolean }) {
  const [open, setOpen] = useState(false);
  const status = getRuleStatus(result);
  const continuous = isContinuousResult(result);
  const statusStyle =
    continuous && status === "estimate"
      ? { ...RULE_STATUS_STYLES[status], label: "数値予測" }
      : RULE_STATUS_STYLES[status];
  const hasLiteratureSummary =
    Boolean(result.literatureSummary.overview) ||
    Boolean(result.literatureSummary.targetPopulation) ||
    result.literatureSummary.predictors.length > 0 ||
    Boolean(result.literatureSummary.clinicalNote);
  const statusIcon =
    status === "supports" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
    ) : status === "against" ? (
      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
    ) : (
      <Info className="h-4 w-4 shrink-0 text-slate-500" />
    );

  if (!result.isApplicable) {
    return (
      <div
        className={`rounded-lg border p-3 ${statusStyle.border} ${statusStyle.bg}`}
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5">{statusIcon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-medium ${statusStyle.text}`}>
                {result.ruleName}
              </p>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${statusStyle.badge}`}
              >
                {getExclusionReasonLabel(result)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {result.status === "missing_input" &&
              result.missingFields.length > 0
                ? `不足している評価項目：${result.missingFields.map(field => PATIENT_FIELDS.flatMap(section => section.fields).find(item => item.key === field)?.label ?? field).join("、")}`
                : (result.unavailableReason ??
                  "この履歴には判定対象外となった理由が記録されていません。")}
            </p>
            {result.status === "missing_input" && (
              <p className="text-xs text-muted-foreground mt-1">
                不足項目を評価・入力すると、再照合できます。
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={`rounded-lg border ${statusStyle.border} overflow-hidden`}
      >
        <CollapsibleTrigger asChild>
          <div
            className={`flex items-start gap-3 p-3 cursor-pointer hover:opacity-90 transition-opacity ${statusStyle.bg}`}
          >
            <span className="mt-0.5">{statusIcon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{result.ruleName}</p>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${statusStyle.badge}`}
                >
                  {classification ? "分類結果" : statusStyle.label}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {RULE_TYPE_LABELS[result.ruleType] ?? result.ruleType}
                </Badge>
                {result.timeMatch && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {timeMatchLabel(result.timeMatch)}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 border ${EVIDENCE_COLORS[result.evidenceLevel] ?? ""}`}
                >
                  {result.evidenceLevel}
                </Badge>
              </div>
              {continuous ? (
                <NumericPredictionValue result={result} />
              ) : (
                <p className={classification ? "text-base font-semibold mt-2" : "text-xs mt-1"}>{result.prediction}</p>
              )}
              <TimelineSummary
                definition={{ timeline: result.timeline }}
                continuous={continuous}
              />
              {result.probability !== null && (
                <p className="text-xs text-muted-foreground">
                  確率: {(result.probability * 100).toFixed(1)}%
                </p>
              )}
            </div>
            <div className="shrink-0 text-muted-foreground">
              {open ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-2 border-t border-dashed space-y-3">
            {result.timeMatch && !continuous && (
              <div className="space-y-1">
                <p className="text-xs font-medium">評価時期について</p>
                <p className="text-xs text-muted-foreground">{result.timeMatch.reason}</p>
              </div>
            )}
            {hasLiteratureSummary && (
              <div className="bg-background rounded-md border p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  文献の要点
                </p>
                {result.literatureSummary.overview && (
                  <p className="text-xs text-muted-foreground">
                    {result.literatureSummary.overview}
                  </p>
                )}
                {result.literatureSummary.targetPopulation && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">対象: </span>
                    {result.literatureSummary.targetPopulation.replace(
                      /^対象[:：]\s*/,
                      ""
                    )}
                  </p>
                )}
                {result.literatureSummary.predictors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs font-medium text-foreground mr-1">
                      使用評価:
                    </span>
                    {result.literatureSummary.predictors.map(predictor => (
                      <Badge
                        key={predictor}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
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
                <p className="text-xs font-semibold text-foreground">
                  今回の入力で該当した理由
                </p>
                <div className="space-y-1">
                  {result.matchExplanation.map((line, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* 精度指標 */}
            {(result.accuracy ||
              result.sensitivity ||
              result.specificity ||
              result.auc) && (
              <div className="flex flex-wrap gap-3 text-xs">
                {result.accuracy && (
                  <span className="text-muted-foreground">
                    文献内正診率:{" "}
                    <strong>
                      {formatPercentMetric(Number(result.accuracy))}
                    </strong>
                  </span>
                )}
                {result.sensitivity && (
                  <span className="text-muted-foreground">
                    感度:{" "}
                    <strong>
                      {formatPercentMetric(Number(result.sensitivity))}
                    </strong>
                  </span>
                )}
                {result.specificity && (
                  <span className="text-muted-foreground">
                    特異度:{" "}
                    <strong>
                      {formatPercentMetric(Number(result.specificity))}
                    </strong>
                  </span>
                )}
                {result.auc && (
                  <span className="text-muted-foreground">
                    AUC: <strong>{result.auc.toFixed(2)}</strong>
                  </span>
                )}
              </div>
            )}
            {/* 文献リンク */}
            <div className="flex items-center gap-2">
              <BookOpen className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                {result.source}
              </span>
              {result.sourceUrl && (
                <a
                  href={result.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline shrink-0"
                >
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

export function LiteratureResults({
  results,
  children,
  outcomeName,
}: {
  results: RuleResult[];
  children?: ReactNode;
  outcomeName?: string;
}) {
  const classificationResults = results.filter(
    result => !isContinuousResult(result)
  );
  const groupedResults = groupRuleResults(classificationResults);
  if (outcomeName === FIM_MOTOR_OUTCOME_NAME) {
    const numericResults = results.filter(isContinuousResult);
    return (
      <div className="space-y-4">
        <div id="literature-summary" className="scroll-mt-20 space-y-4">
          {numericResults.length > 0 && <NumericPredictionResults results={numericResults} />}
          {classificationResults.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">運動FIMの到達分類</CardTitle>
                <CardDescription>
                  文献ごとの基準に到達するかを示す結果です。Fukudaの基準は発症90日後の運動FIM 62点以上です。上の点数予測と、それぞれの予測対象時点をあわせて確認してください。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {classificationResults.map(result => <RuleResultCard key={result.ruleId} result={result} classification />)}
              </CardContent>
            </Card>
          )}
          {results.length === 0 && <p className="text-sm text-muted-foreground">このアウトカムに登録された有効な文献ルールがありません。</p>}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <LiteratureSummary results={results} />
      {children}
      {/* 個別ルール結果 */}
      {(classificationResults.length > 0 || results.length === 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">該当文献の照合結果</CardTitle>
            <CardDescription>
              評価できたルール:{" "}
              {
                classificationResults.filter(result => result.isApplicable)
                  .length
              }
              件 / 登録ルール: {classificationResults.length}件
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {groupedResults &&
              RULE_STATUS_ORDER.map(status => {
                const items = groupedResults[status];
                if (items.length === 0) return null;
                const style =
                  status === "estimate" && items.every(isContinuousResult)
                    ? { ...RULE_STATUS_STYLES[status], label: "数値予測" }
                    : RULE_STATUS_STYLES[status];
                if (status === "excluded") {
                  return (
                    <details
                      key={status}
                      className={`group rounded-md border ${style.border}`}
                    >
                      <summary
                        className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden ${style.bg} ${style.text}`}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <ChevronRight
                            className="h-4 w-4 transition-transform group-open:rotate-90"
                            aria-hidden="true"
                          />
                          {style.label}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs">文献と理由を確認</span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${style.badge}`}
                          >
                            {items.length}件
                          </Badge>
                        </span>
                      </summary>
                      <div className="space-y-2 p-3">
                        <p className="text-xs text-muted-foreground">
                          入力不足・条件不一致・計算未対応などの理由で、今回の判定に含めていない文献です。追加で必要な評価は「追加評価の提案」でも確認できます。
                        </p>
                        {items.map(result => (
                          <RuleResultCard key={result.ruleId} result={result} />
                        ))}
                      </div>
                    </details>
                  );
                }
                return (
                  <section key={status} className="space-y-2">
                    <div
                      className={`flex items-center justify-between rounded-md border px-3 py-2 ${style.border} ${style.bg}`}
                    >
                      <h3 className={`text-sm font-semibold ${style.text}`}>
                        {style.label}
                      </h3>
                      <Badge
                        variant="outline"
                        className={`text-xs ${style.badge}`}
                      >
                        {items.length}件
                      </Badge>
                    </div>
                    {status === "reference" && (
                      <p className="text-xs text-muted-foreground px-1">
                        {REFERENCE_RESULT_DESCRIPTION}
                      </p>
                    )}
                    <div className="space-y-2">
                      {items.map(r => (
                        <RuleResultCard key={r.ruleId} result={r} />
                      ))}
                    </div>
                  </section>
                );
              })}
            {classificationResults.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  このアウトカムに登録された文献ルールがありません
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PredictPage() {
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<number | null>(
    null
  );
  const [enteredInputs, setInputs] = useState<PatientInputs>({});
  const [result, setResult] = useState<EngineOutput | null>(null);
  const [evaluatedInputKey, setEvaluatedInputKey] = useState("");
  const [savedPredictionId, setSavedPredictionId] = useState<number | null>(
    null
  );
  const [caseId, setCaseId] = useState("");
  const [assessedOn, setAssessedOn] = useState(() =>
    new Date().toLocaleDateString("en-CA")
  );
  const [assessmentPhase, setAssessmentPhase] =
    useState<keyof typeof ASSESSMENT_PHASES>("admission");
  const [timeContext, setTimeContext] = useState<TimeQuery>({ kind: "future" });
  const [showAllFields, setShowAllFields] = useState(false);
  const utils = trpc.useUtils();
  const [summaryScrollRequest, setSummaryScrollRequest] = useState(0);

  const { data: outcomes, isLoading: outcomesLoading } =
    trpc.outcomes.list.useQuery();
  const predictionOutcomes = getPredictionOutcomes(outcomes ?? []);
  useEffect(() => {
    if (!outcomes) return;
    const resolved = resolvePredictionOutcomeId(selectedOutcomeId, outcomes);
    if (resolved !== selectedOutcomeId) {
      setSelectedOutcomeId(resolved);
      setResult(null);
    }
  }, [outcomes, selectedOutcomeId]);
  const selectedOutcome = outcomes?.find(o => o.id === selectedOutcomeId);
  const { data: availableRules } = trpc.rules.list.useQuery(
    { outcomeId: selectedOutcomeId ?? undefined },
    { enabled: selectedOutcomeId !== null }
  );
  const inputs = hasKoyamaTimeAxis(availableRules)
    ? koyamaSharedInputs(enteredInputs, timeContext)
    : withCalculatedFimTotals(enteredInputs);
  const currentInputKey = JSON.stringify({
    outcomeId: selectedOutcomeId,
    inputs,
    caseId,
    assessedOn,
    assessmentPhase,
    timeContext,
  });
  const resultIsStale =
    result !== null && currentInputKey !== evaluatedInputKey;
  const requiredFields = useMemo(
    () => {
      const fields = new Set(
        availableRules
          ?.filter(
            rule =>
              rule.isActive && !getRuleExclusionReason(rule.ruleDefinition)
          )
          .flatMap(rule => [
            ...rule.requiredFields,
            ...rule.applyConditionFields.map(condition => condition.field),
          ]) ?? []
      );
      if (fields.has("koyama_day_a")) fields.add("days_onset_to_admission");
      if (fields.has("koyama_fim_total_a")) fields.add("admission_fim_total");
      if (fields.has("admission_fim_total")) {
        fields.add("admission_fim_motor_total");
        fields.add("admission_fim_cognitive_total");
      }
      if (fields.has("fim_total")) {
        fields.add("fim_motor_total");
        fields.add("fim_cognitive_total");
      }
      return fields;
    },
    [availableRules]
  );
  const visibleSections = getVisiblePatientSections(
    requiredFields, showAllFields
  );
  const knownFields = new Set(
    PATIENT_FIELDS.flatMap(section => section.fields.map(field => field.key))
  );
  const unknownFields: FieldDef[] = Array.from(requiredFields)
    .filter(field => !knownFields.has(field))
    .map(key => ({ key, label: key, type: "number" }));
  if (unknownFields.length)
    visibleSections.push({
      section: "追加された文献の評価項目",
      fields: unknownFields,
    });

  const saveDraft = () => {
    try {
      sessionStorage.setItem("rehab-local-draft-v2", JSON.stringify({
        ...JSON.parse(currentInputKey),
        inputs: enteredInputs,
      }));
      toast.success("このタブに下書きを保存しました（タブを閉じるまで保持）");
    } catch {
      toast.error("下書きを保存できませんでした");
    }
  };
  const restoreDraft = () => {
    try {
      const raw = sessionStorage.getItem("rehab-local-draft-v2");
      if (!raw) {
        toast.info("このタブに下書きはありません");
        return;
      }
      const draft = JSON.parse(raw);
      if (
        !draft.inputs ||
        typeof draft.inputs !== "object" ||
        Array.isArray(draft.inputs) ||
        (draft.outcomeId !== null && !Number.isSafeInteger(draft.outcomeId))
      )
        throw new Error();
      for (const value of Object.values(draft.inputs))
        if (!["string", "number", "boolean"].includes(typeof value))
          throw new Error();
      const meta = assessmentSchema.parse(draft);
      setTimeContext(
        draft.timeContext
          ? timeQuerySchema.parse(draft.timeContext)
          : { kind: "future" }
      );
      const restoredInputs = omitInvalidPatientScores(draft.inputs);
      setInputs(restoredInputs as PatientInputs);
      setSelectedOutcomeId(outcomes ? resolvePredictionOutcomeId(draft.outcomeId, outcomes) : draft.outcomeId);
      setCaseId(meta.caseId ?? "");
      if (meta.assessedOn) setAssessedOn(meta.assessedOn);
      if (meta.assessmentPhase) setAssessmentPhase(meta.assessmentPhase);
      setResult(null);
      setSavedPredictionId(null);
      if (Object.keys(restoredInputs).length < Object.keys(draft.inputs).length)
        toast.info("下書きを復元しました。範囲外の点数は空欄にしました");
      else toast.success("下書きを復元しました");
    } catch {
      toast.error("下書きの形式が不正です。復元できませんでした");
    }
  };

  const requestSummaryScroll = () => {
    setSummaryScrollRequest(request => request + 1);
  };

  const predictMutation = trpc.predict.run.useMutation({
    onMutate: () => ({ inputKey: currentInputKey }),
    onSuccess: (data, _variables, context) => {
      setResult(data as unknown as EngineOutput);
      setEvaluatedInputKey(context?.inputKey ?? "");
      setSavedPredictionId(data.predictionId);
      utils.history.list.invalidate();
      utils.history.exportCsv.invalidate();
      requestSummaryScroll();
      toast.success("文献照合が完了し、履歴に保存しました");
    },
    onError: e => toast.error(`文献照合エラー: ${e.message}`),
  });

  const previewMutation = trpc.predict.preview.useMutation({
    onMutate: () => ({ inputKey: currentInputKey }),
    onSuccess: (data, _variables, context) => {
      setResult(data);
      setEvaluatedInputKey(context?.inputKey ?? "");
      setSavedPredictionId(null);
      requestSummaryScroll();
      toast.success("保存せずに照合しました");
    },
    onError: e => toast.error(`文献照合エラー: ${e.message}`),
  });
  const isEvaluating = predictMutation.isPending || previewMutation.isPending;

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

  useEffect(() => {
    if (!result || summaryScrollRequest === 0) return;

    const scrollToSummary = (behavior: ScrollBehavior) => {
      const target = document.getElementById("literature-summary");
      if (!target) return;
      target.scrollIntoView({ behavior, block: "start", inline: "nearest" });
    };

    const frameId = window.requestAnimationFrame(() =>
      scrollToSummary("smooth")
    );
    const retryIds = [150, 400, 900, 1400].map(delay =>
      window.setTimeout(() => scrollToSummary("auto"), delay)
    );

    return () => {
      window.cancelAnimationFrame(frameId);
      retryIds.forEach(id => window.clearTimeout(id));
    };
  }, [result, summaryScrollRequest]);

  const handleInputChange = (
    key: string,
    value: string | number | boolean | undefined
  ) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setInputs({});
    setTimeContext({ kind: "future" });
    setCaseId("");
    setAssessedOn(new Date().toLocaleDateString("en-CA"));
    setAssessmentPhase("admission");
    setResult(null);
    setSavedPredictionId(null);
    try {
      sessionStorage.removeItem("rehab-local-draft-v2");
    } catch {
      /* Browser storage may be disabled. */
    }
  };

  const handlePredict = (save: boolean) => {
    if (!selectedOutcomeId) {
      toast.warning("アウトカムを選択してください");
      return;
    }
    if (result) {
      requestSummaryScroll();
    }
    const numericInputs: PatientInputs = {};
    for (const [k, v] of Object.entries(
      getInputsForAssessmentPhase(inputs, assessmentPhase)
    )) {
      if (v === "" || v === undefined) continue;
      if (typeof v === "boolean") {
        numericInputs[k] = v;
        continue;
      }
      const n = Number(v);
      numericInputs[k] = isNaN(n) ? v : n;
    }
    const onsetDays = numericInputs[ONSET_DAY_FIELD];
    if (onsetDays !== undefined && onsetDays !== null && onsetDays !== "") {
      for (const alias of ONSET_DAY_ALIASES) {
        numericInputs[alias] = onsetDays;
      }
    }
    const validation = patientInputsSchema.safeParse(numericInputs);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      toast.error(
        `${fieldLookup[String(issue.path[0])] ?? issue.path.join(".")}: ${issue.message}`
      );
      return;
    }
    const meta = assessmentSchema.safeParse({
      caseId,
      assessedOn,
      assessmentPhase,
    });
    if (!meta.success) {
      toast.error(meta.error.issues[0].message);
      return;
    }
    const time = timeQuerySchema.safeParse(
      predictionTimeContext(availableRules, validation.data, timeContext)
    );
    if (!time.success) {
      toast.error(time.error.issues[0].message);
      return;
    }
    const payload = {
      timeContext: isDemoMode ? undefined : time.data,
      outcomeId: selectedOutcomeId,
      patientInputs: validation.data,
      ...meta.data,
    };
    if (save) predictMutation.mutate(payload);
    else previewMutation.mutate(payload);
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
          <p className="text-sm text-muted-foreground">
            患者情報を入力し、登録済みの文献ルールと照合します
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ---- 左カラム: 入力フォーム ---- */}
        <div className="space-y-4">
          {/* アウトカム選択 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">アウトカム選択</CardTitle>
              <CardDescription>
                照合するアウトカムを選択してください
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedOutcomeId?.toString() ?? ""}
                onValueChange={v => {
                  setSelectedOutcomeId(Number(v));
                  setResult(null);
                }}
                disabled={outcomesLoading || isEvaluating}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      outcomesLoading ? "読み込み中..." : "アウトカムを選択"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {predictionOutcomes.map(o => (
                    <SelectItem key={o.id} value={o.id.toString()}>
                      {o.name}
                      {o.unit ? ` (${o.unit})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOutcome && (
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedOutcome.description}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">症例・評価時点</CardTitle>
              <CardDescription>
                同じ症例IDで保存すると、履歴で評価日順に確認できます。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="case-id">匿名症例ID（任意）</Label>
                <Input
                  id="case-id"
                  value={caseId}
                  onChange={e => setCaseId(e.target.value)}
                  placeholder="例: CASE-001"
                  maxLength={64}
                />
              </div>
              <div>
                <Label htmlFor="assessed-on">評価日</Label>
                <Input
                  id="assessed-on"
                  type="date"
                  value={assessedOn}
                  onChange={e => setAssessedOn(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="assessment-phase">評価時点</Label>
                <select
                  id="assessment-phase"
                  className="w-full h-9 rounded-md border px-2 bg-background"
                  value={assessmentPhase}
                  onChange={e =>
                    setAssessmentPhase(
                      e.target.value as keyof typeof ASSESSMENT_PHASES
                    )
                  }
                >
                  {Object.entries(ASSESSMENT_PHASES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {!isDemoMode && (
                <>
                  {!usesKoyamaTimeAxis(availableRules) && (
                    <TimeQueryEditor
                      value={timeContext}
                      onChange={setTimeContext}
                    />
                  )}
                  {hasKoyamaTimeAxis(availableRules) && (
                    <KoyamaTimeSummary inputs={inputs} />
                  )}
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveDraft}
                  disabled={isEvaluating}
                >
                  下書きを保存
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={restoreDraft}
                  disabled={isEvaluating}
                >
                  下書きを復元
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                下書きはこのタブ内に保存され、再読み込み後に復元できます。タブを閉じると消去されます。
              </p>
            </CardContent>
          </Card>
          <label className="flex gap-2 text-sm items-center">
            <input
              type="checkbox"
              checked={showAllFields}
              onChange={e => setShowAllFields(e.target.checked)}
            />
            すべての評価項目を表示
          </label>
          <p className="text-xs text-muted-foreground">
            通常は選択したアウトカムの計算に必要な項目を表示します。入院時の項目には当時の値を入力してください。未評価の値は空欄のままにできます。
            {(assessmentPhase === "admission" || assessmentPhase === "week3") && (
              <>
                {" "}
                変化量（ΔBBS・ΔFIM）は「入棟1ヶ月後」「経過評価」「退院時」で入力できます。
              </>
            )}
          </p>
          {/* 患者情報入力 */}
          {visibleSections.map(section => {
            const unavailableField = section.fields.find(field =>
              !isAssessmentFieldAvailable(field.key, assessmentPhase)
            );
            const requiredPhase = unavailableField && getAssessmentFieldPhase(unavailableField.key);
            return (
            <Card key={section.section}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {section.section}
                </CardTitle>
                {section.description && (
                  <CardDescription>{section.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {requiredPhase && (
                  <div id={`patient-phase-help-${requiredPhase}`} className="space-y-2 text-xs text-muted-foreground">
                    <p>
                      {requiredPhase === "month1"
                        ? "入棟時から1ヶ月後までの変化量を使う項目です。"
                        : "入棟3週間後の実測値を使う項目です。"}
                      入力するには評価時点を「{ASSESSMENT_PHASES[requiredPhase]}」に切り替えてください。
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAssessmentPhase(requiredPhase)}
                    >
                      {ASSESSMENT_PHASES[requiredPhase]}の評価に切り替える
                    </Button>
                  </div>
                )}
                {section.fields.map(field => (
                  <div key={field.key} className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <Label
                        id={`patient-label-${field.key}`}
                        htmlFor={`patient-${field.key}`}
                        className="text-sm w-44 shrink-0 leading-tight"
                      >
                        {field.label}
                      </Label>
                      {field.type === "boolean" ? (
                        <TriStateToggle
                          value={inputs[field.key] as boolean | undefined}
                          onChange={v => handleInputChange(field.key, v)}
                          labels={field.booleanLabels}
                          labelledBy={`patient-label-${field.key}`}
                          describedBy={
                            field.description
                              ? `patient-help-${field.key}`
                              : undefined
                          }
                        />
                      ) : field.type === "select" ? (
                        <Select
                          value={(inputs[field.key] as string) ?? ""}
                          onValueChange={v => handleInputChange(field.key, v)}
                        >
                          <SelectTrigger
                            id={`patient-${field.key}`}
                            aria-describedby={
                              field.description
                                ? `patient-help-${field.key}`
                                : undefined
                            }
                            className="h-8 text-sm flex-1"
                          >
                            <SelectValue placeholder="選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map(opt => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-1">
                          <PatientNumberInput
                            fieldKey={field.key}
                            disabled={!isAssessmentFieldAvailable(field.key, assessmentPhase)}
                            readOnly={!!getFimTotalCalculation(inputs, field.key)}
                            placeholder={field.placeholder}
                            describedBy={
                              !isAssessmentFieldAvailable(field.key, assessmentPhase)
                                ? `patient-phase-help-${requiredPhase}`
                                : field.description ? `patient-help-${field.key}` : undefined
                            }
                            value={
                              inputs[field.key] as string | number | undefined
                            }
                            onValueChange={value =>
                              handleInputChange(field.key, value)
                            }
                          />
                          {field.unit && (
                            <span className="text-xs text-muted-foreground shrink-0 w-8">
                              {field.unit}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <FimTotalCalculation inputs={inputs} field={field.key} />
                    {field.description && (
                      <p
                        id={`patient-help-${field.key}`}
                        className="text-xs text-muted-foreground leading-relaxed"
                      >
                        {field.description}
                      </p>
                    )}
                    {koyamaSharedInputSource(field.key) && (
                      <p className="text-xs text-muted-foreground">
                        {enteredInputs[field.key] === undefined ? (
                          <>{koyamaSharedInputSource(field.key)}から自動反映します。ここで編集した値を優先します。</>
                        ) : (
                          <>
                            この欄の個別入力を使用しています。
                            <button
                              type="button"
                              className="ml-1 underline underline-offset-2"
                              onClick={() => setInputs(previous => {
                                const next = { ...previous };
                                delete next[field.key];
                                return next;
                              })}
                            >
                              上の入力との連動に戻す
                            </button>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
            );
          })}

          {/* アクションボタン */}
          <div className="flex flex-wrap gap-3">
            <Button
              className="flex-1"
              onClick={() => handlePredict(true)}
              disabled={
                isEvaluating ||
                !selectedOutcomeId ||
                (!!savedPredictionId && !resultIsStale && !!result)
              }
            >
              {predictMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  照合中...
                </>
              ) : (
                <>
                  <BookOpen className="h-4 w-4 mr-2" />
                  照合して履歴に保存
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => handlePredict(false)}
              disabled={isEvaluating || !selectedOutcomeId}
            >
              {previewMutation.isPending ? "照合中..." : "保存せず照合"}
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isEvaluating}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              リセット
            </Button>
          </div>
        </div>

        {/* ---- 右カラム: 文献照合結果 ---- */}
        <div className="space-y-4">
          {!result ? (
            <Card className="h-64 flex items-center justify-center border-dashed">
              <div className="text-center text-muted-foreground">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  患者情報を入力して文献と照合してください
                </p>
              </div>
            </Card>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {savedPredictionId
                  ? `履歴 #${savedPredictionId} に保存済み`
                  : "プレビュー：この結果は履歴に保存されていません"}
              </p>
              {resultIsStale && (
                <div
                  role="status"
                  className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                >
                  入力が変更されています。以下は変更前の結果です。再度、文献照合を実行してください。
                </div>
              )}
              <LiteratureResults results={result.results} outcomeName={selectedOutcome?.name}>
                {/* 追加評価の提案 */}
                {result.suggestions.filter(s => s.reason === "missing_input")
                  .length > 0 && (
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
                        .filter(s => s.reason === "missing_input")
                        .map(s => (
                          <div
                            key={s.ruleId}
                            className="flex items-start gap-2 text-sm"
                          >
                            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                              <span className="font-medium text-amber-800">
                                {s.ruleName}
                              </span>
                              <span className="text-amber-700">：</span>
                              <span className="text-amber-700">
                                {s.missingFields
                                  .map(f => fieldLookup[f] ?? f)
                                  .join("、")}
                                の入力が必要です
                              </span>
                              {s.missingFields.some(
                                field =>
                                  !isAssessmentFieldAvailable(
                                    field,
                                    assessmentPhase
                                  )
                              ) && (
                                <p className="text-xs text-amber-700">
                                  変化量は「入棟1ヶ月後」「経過評価」「退院時」で入力できます。
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                )}
              </LiteratureResults>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
