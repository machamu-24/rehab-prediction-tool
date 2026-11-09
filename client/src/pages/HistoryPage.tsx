import {
  actualOutcomeSchema,
  OUTCOME_SCALES,
  type RecordedOutcome,
} from "@shared/actualOutcome";
import {
  formatTimeQuery,
  readTimeline,
  timeMatchLabel,
  type TimeQuery,
} from "@shared/literatureTimeline";
import {
  getResultDisplayStatus,
  getExclusionReasonLabel,
  isContinuousResult,
  readContinuousOutput,
} from "@shared/resultStatus";
import type { RuleEvaluationResult } from "@shared/ruleEngine";
import {
  NumericPredictionResults,
  type NumericPredictionResult,
} from "@/components/NumericPredictionResults";
import { TimelineSummary } from "@/components/LiteratureTimeline";
import { NomogramReferenceCard } from "@/components/NomogramReferenceCard";
import { SavedInputsTable } from "@/components/SavedInputsTable";
import { savedDateLabel, savedPhaseLabel } from "@/lib/savedAssessment";
import { useLocation } from "wouter";
import { useState } from "react";
import { ASSESSMENT_PHASES } from "@shared/assessment";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  History,
  XCircle,
  Edit2,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type PredictionRecord = {
  id: number;
  resultCount?: number;
  timeContext?: TimeQuery | null;
  caseId?: string | null;
  assessedOn?: string | null;
  assessmentPhase?: string | null;
  engineVersion?: string | null;
  outcomeSnapshot?: { name: string } | null;
  outcomeId: number;
  patientInputs: Record<string, unknown>;
  consensusScore: number | null;
  consensusLabel: string | null;
  actualOutcome: Record<string, unknown> | null;
  outcomeRecordedAt: Date | null;
  notes: string | null;
  createdAt: Date;
};

type RuleResult = {
  id: number;
  predictionId: number;
  ruleId: number;
  ruleName: string;
  isApplicable: boolean;
  unavailableReason: string | null;
  isPositive: boolean | null;
  prediction: string | null;
  probability: number | null;
  details: string[];
  resultSnapshot?: Partial<RuleEvaluationResult> | null;
  ruleSnapshot?: {
    source?: string;
    sourceUrl?: string;
    ruleDefinition?: unknown;
    applyConditions?: unknown;
  } | null;
};

const CONSENSUS_COLORS = {
  unavailable: "text-slate-700 bg-slate-50 border-slate-200",
  positive: "text-emerald-700 bg-emerald-50 border-emerald-200",
  neutral: "text-amber-700 bg-amber-50 border-amber-200",
  negative: "text-red-700 bg-red-50 border-red-200",
};

const CONSENSUS_LABELS = {
  unavailable: "集計対象なし",
  positive: "支持",
  neutral: "中間",
  negative: "困難示唆",
};

function PredictionRow({
  pred,
  outcomeName,
}: {
  pred: PredictionRecord;
  outcomeName: string;
}) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  const [outcomeValue, setOutcomeValue] = useState(
    String(pred.actualOutcome?.value ?? "")
  );
  const [outcomeLabel, setOutcomeLabel] = useState(
    String(pred.actualOutcome?.label ?? "")
  );
  const [scale, setScale] = useState<RecordedOutcome["scale"]>(
    (pred.actualOutcome?.scale as RecordedOutcome["scale"]) ?? "other"
  );
  const [scaleName, setScaleName] = useState(
    String(pred.actualOutcome?.scaleName ?? "")
  );
  const [measuredOn, setMeasuredOn] = useState(
    String(pred.actualOutcome?.measuredOn ?? "")
  );
  const [actualDays, setActualDays] = useState(
    String(pred.actualOutcome?.daysSinceOnset ?? "")
  );
  const [notes, setNotes] = useState(pred.notes ?? "");

  const utils = trpc.useUtils();
  const {
    data: detail,
    isLoading: detailLoading,
    error: detailError,
  } = trpc.history.get.useQuery({ id: pred.id }, { enabled: open });

  const savedResults = detail?.results as RuleResult[] | undefined;
  const continuousResults: NumericPredictionResult[] = (
    savedResults ?? []
  ).flatMap(r => {
    const snapshot = r.resultSnapshot;
    const output =
      readContinuousOutput(r.ruleSnapshot?.ruleDefinition) ??
      (isContinuousResult(snapshot ?? {})
        ? { outputMode: "continuous", outputUnit: snapshot?.outputUnit }
        : null);
    if (!output) return [];
    return [
      {
        ...snapshot,
        ...r,
        ...output,
        source: r.ruleSnapshot?.source ?? snapshot?.source,
        sourceUrl: r.ruleSnapshot?.sourceUrl ?? snapshot?.sourceUrl,
        savedDefinition: r.ruleSnapshot?.ruleDefinition,
        savedConditions: r.ruleSnapshot?.applyConditions,
        numericValue: snapshot?.numericValue ?? null,
        status:
          snapshot?.status ??
          (r.isApplicable ? "evaluated" : "calculation_error"),
        timeline:
          snapshot?.timeline ?? readTimeline(r.ruleSnapshot?.ruleDefinition),
        timeMatch: snapshot?.timeMatch,
      },
    ];
  });
  const onlyContinuous =
    continuousResults.length > 0 &&
    continuousResults.length === savedResults?.length;

  const updateMutation = trpc.history.updateOutcome.useMutation({
    onSuccess: () => {
      utils.history.list.invalidate();
      utils.history.get.invalidate({ id: pred.id });
      utils.history.exportCsv.invalidate();
      toast.success("実績を記録しました");
      setOutcomeDialogOpen(false);
    },
    onError: e => toast.error(`エラー: ${e.message}`),
  });

  const label =
    pred.resultCount === 0
      ? null
      : (pred.consensusLabel as keyof typeof CONSENSUS_COLORS | null);
  const colorClass = label
    ? CONSENSUS_COLORS[label]
    : "text-muted-foreground bg-muted border-muted";
  const labelText =
    pred.resultCount === 0
      ? "旧履歴・詳細未保存"
      : onlyContinuous
        ? continuousResults.some(r => r.isApplicable)
          ? "数値予測"
          : "数値予測なし"
        : label
          ? CONSENSUS_LABELS[label]
          : "未評価";
  const pct =
    !onlyContinuous && pred.resultCount !== 0 && pred.consensusScore !== null
      ? Math.round(pred.consensusScore * 100)
      : null;

  const inp = pred.patientInputs as Record<string, unknown>;
  const daysSinceOnset = inp.days_since_onset ?? inp.days_post_stroke;
  const ao = pred.actualOutcome as Record<string, unknown> | null;

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card className="transition-all hover:shadow-sm">
          <CollapsibleTrigger asChild>
            <div className="p-4 cursor-pointer select-none">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground font-mono">
                      #{pred.id}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {pred.outcomeSnapshot?.name ?? outcomeName}
                    </Badge>
                    {pred.caseId && (
                      <Badge variant="outline">症例 {pred.caseId}</Badge>
                    )}
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colorClass}`}
                    >
                      {labelText}
                      {pct !== null ? `（対象ルール中 ${pct}%）` : ""}
                    </span>
                    {ao && (
                      <Badge
                        variant="outline"
                        className="text-xs text-emerald-700 border-emerald-300"
                      >
                        実績あり
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>
                      {pred.assessedOn
                        ? `評価日: ${pred.assessedOn}`
                        : `記録日: ${new Date(pred.createdAt).toLocaleDateString("ja-JP")}`}
                    </span>
                    {pred.assessmentPhase && (
                      <span>
                        {ASSESSMENT_PHASES[
                          pred.assessmentPhase as keyof typeof ASSESSMENT_PHASES
                        ] ?? pred.assessmentPhase}
                      </span>
                    )}
                    {inp.age != null && <span>年齢: {String(inp.age)}歳</span>}
                    {inp.sex != null && <span>性別: {String(inp.sex)}</span>}
                    {daysSinceOnset != null && (
                      <span>発症{String(daysSinceOnset)}日</span>
                    )}
                    {inp.nihss != null && (
                      <span>NIHSS: {String(inp.nihss)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={e => {
                      e.stopPropagation();
                      setOutcomeDialogOpen(true);
                    }}
                  >
                    <Edit2 className="h-3 w-3" />
                    実績入力
                  </Button>
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 border-t pt-3 space-y-3">
              {detailLoading && (
                <p className="text-sm text-muted-foreground">
                  照合結果を読み込み中...
                </p>
              )}
              {detailError && (
                <p role="alert" className="text-sm text-red-700">
                  結果を読み込めませんでした: {detailError.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {pred.engineVersion
                  ? `保存時の計算版: ${pred.engineVersion}。以下は保存時点の結果です。`
                  : "旧履歴：計算版・ルール定義の記録はありません。"}
              </p>
              {detail?.prediction && (
                <section className="space-y-3" aria-label="保存された入力値">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div><h3 className="text-sm font-semibold">保存された入力値</h3>
                      <p className="text-xs text-muted-foreground mt-1">評価日：{savedDateLabel(detail.prediction)} ／ {savedPhaseLabel(detail.prediction)}</p></div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => navigate(`/?history=${pred.id}&reuse=repeat`)}>この入力で再照合</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/?history=${pred.id}&reuse=followup`)}>次回評価へ引き継ぐ</Button>
                    </div>
                  </div>
                  <SavedInputsTable inputs={detail.prediction.patientInputs} definitions={savedResults?.map(result => result.ruleSnapshot?.ruleDefinition)} />
                </section>
              )}
              {/* 実績表示 */}
              {ao && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
                  <p className="font-medium text-emerald-800 mb-1">実績</p>
                  <div className="flex flex-wrap gap-3 text-emerald-700 text-xs">
                    <span>
                      実績値: <strong>{String(ao.value ?? "")}</strong>（
                      {String(ao.label ?? "")}）
                    </span>
                    {ao.fac_at_discharge != null && (
                      <span>
                        退院時FAC（旧記録）: {String(ao.fac_at_discharge)}
                      </span>
                    )}
                    {ao.fim_at_discharge != null && (
                      <span>
                        退院時FIM（旧記録）: {String(ao.fim_at_discharge)}
                      </span>
                    )}
                    {ao.hospital_days != null && (
                      <span>入院日数: {String(ao.hospital_days)}日</span>
                    )}
                    {pred.outcomeRecordedAt && (
                      <span>
                        記録日:{" "}
                        {new Date(pred.outcomeRecordedAt).toLocaleDateString(
                          "ja-JP"
                        )}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1">
                    測定日: {String(ao.measuredOn ?? "未記録")} ／ 発症後:{" "}
                    {ao.daysSinceOnset != null
                      ? `${ao.daysSinceOnset}日`
                      : "未記録"}{" "}
                    ／ 尺度:{" "}
                    {OUTCOME_SCALES[ao.scale as RecordedOutcome["scale"]] ??
                      "未記録"}
                    {ao.scaleName ? `（${ao.scaleName}）` : ""}
                  </p>
                  {ao.notes != null && (
                    <p className="text-xs text-emerald-600 mt-1">
                      {String(ao.notes)}
                    </p>
                  )}
                </div>
              )}

              {detail?.results?.length === 0 && (
                <p className="text-sm text-amber-800">
                  この履歴には文献ごとの結果が保存されていません。当時の結果を再現できないため、必要に応じて新たに照合してください。
                </p>
              )}
              {continuousResults.length > 0 && (
                <NumericPredictionResults results={continuousResults} />
              )}
              {/* ルール結果 */}
              {savedResults &&
                savedResults.some(
                  r =>
                    !continuousResults.some(
                      result => result.ruleId === r.ruleId
                    )
                ) && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      文献ルールの照合結果
                    </p>
                    {savedResults
                      .filter(
                        r =>
                          !continuousResults.some(
                            result => result.ruleId === r.ruleId
                          )
                      )
                      .map(r => r.resultSnapshot?.referenceOnly ? (
                        <NomogramReferenceCard key={r.id} result={{
                          ...r.resultSnapshot,
                          ...r,
                          referenceOnly: r.resultSnapshot.referenceOnly,
                        }} />
                      ) : (
                        <div
                          key={r.id}
                          className={`flex items-start gap-2 text-xs p-2 rounded-md ${r.isApplicable ? (r.isPositive === null ? "bg-violet-50" : r.resultSnapshot?.consensusEligible !== true ? "bg-slate-50" : r.isPositive ? "bg-emerald-50" : "bg-red-50") : "bg-muted/50"}`}
                        >
                          {r.isApplicable ? (
                            r.isPositive === null ||
                            r.resultSnapshot?.consensusEligible !== true ? (
                              <BookOpen className="h-3.5 w-3.5 text-violet-600 mt-0.5 shrink-0" />
                            ) : r.isPositive ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                            )
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          )}
                          <div>
                            <span className="font-medium">{r.ruleName}</span>
                            <Badge variant="outline" className="ml-2">
                              {r.resultSnapshot
                                ? {
                                    supports: "集計対象：支持",
                                    against: "集計対象：困難示唆",
                                    reference: "参考結果",
                                    literature: "参考文献（原文確認）",
                                    estimate: "数値予測",
                                    excluded: "判定対象外",
                                  }[
                                    getResultDisplayStatus({
                                      ...r,
                                      ...r.resultSnapshot,
                                      ...(readContinuousOutput(
                                        r.ruleSnapshot?.ruleDefinition
                                      ) ?? {}),
                                    })
                                  ]
                                : "集計区分未記録"}
                            </Badge>
                            {!r.isApplicable && r.resultSnapshot && (
                              <Badge variant="outline" className="ml-2">
                                {getExclusionReasonLabel(r.resultSnapshot)}
                              </Badge>
                            )}
                            {r.resultSnapshot?.timeMatch && (
                              <Badge variant="outline" className="ml-2">
                                {timeMatchLabel(r.resultSnapshot.timeMatch)}
                              </Badge>
                            )}
                            {r.resultSnapshot?.timeMatch &&
                              !continuousResults.some(
                                result => result.ruleId === r.ruleId
                              ) && (
                                <p className="mt-1">
                                  {r.resultSnapshot.timeMatch.reason}
                                </p>
                              )}
                            {r.prediction && (
                              <span className="ml-2 text-muted-foreground">
                                {r.prediction}
                              </span>
                            )}
                            {!r.isApplicable && r.unavailableReason && (
                              <span className="ml-2 text-muted-foreground">
                                （{r.unavailableReason}）
                              </span>
                            )}
                            {r.details?.length > 0 && (
                              <details className="mt-1 text-muted-foreground">
                                <summary className="cursor-pointer">
                                  判定の詳細
                                </summary>
                                <ul className="mt-1 space-y-1">
                                  {r.details.map((text, i) => (
                                    <li key={i}>{text}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                            {r.ruleSnapshot && (
                              <TimelineSummary
                                definition={r.ruleSnapshot.ruleDefinition}
                                continuous={continuousResults.some(
                                  result => result.ruleId === r.ruleId
                                )}
                              />
                            )}
                            {r.ruleSnapshot && (
                              <details className="mt-2">
                                <summary className="cursor-pointer">
                                  保存時の文献・ルール定義
                                </summary>
                                <p className="mt-1">{r.ruleSnapshot.source}</p>
                                {r.ruleSnapshot.sourceUrl && (
                                  <a
                                    className="text-primary underline"
                                    href={r.ruleSnapshot.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    保存時の出典
                                  </a>
                                )}
                                <pre className="mt-2 whitespace-pre-wrap break-all">
                                  {JSON.stringify(
                                    {
                                      definition: r.ruleSnapshot.ruleDefinition,
                                      conditions:
                                        r.ruleSnapshot.applyConditions,
                                    },
                                    null,
                                    2
                                  )}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

              <p className="text-xs">{formatTimeQuery(pred.timeContext)}</p>
              {/* メモ */}
              {pred.notes && (
                <p className="text-xs text-muted-foreground border-t pt-2">
                  {pred.notes}
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 実績入力ダイアログ */}
      <Dialog open={outcomeDialogOpen} onOpenChange={setOutcomeDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>実績を記録</DialogTitle>
            <DialogDescription>
              文献照合結果との比較のため、実際のアウトカムを入力してください
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor={`actual-scale-${pred.id}`}>測定した尺度</Label>
              <select
                id={`actual-scale-${pred.id}`}
                className="w-full border rounded-md p-2"
                value={scale}
                onChange={e =>
                  setScale(e.target.value as RecordedOutcome["scale"])
                }
              >
                {Object.entries(OUTCOME_SCALES).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {scale === "other" && (
              <div>
                <Label htmlFor={`actual-scale-name-${pred.id}`}>
                  尺度名・単位
                </Label>
                <Input
                  id={`actual-scale-name-${pred.id}`}
                  value={scaleName}
                  onChange={e => setScaleName(e.target.value)}
                />
              </div>
            )}
            <div>
              <Label htmlFor={`actual-date-${pred.id}`}>実際の測定日</Label>
              <Input
                id={`actual-date-${pred.id}`}
                type="date"
                value={measuredOn}
                onChange={e => setMeasuredOn(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`actual-days-${pred.id}`}>
                測定時の発症後日数
              </Label>
              <Input
                id={`actual-days-${pred.id}`}
                type="number"
                min={0}
                step={1}
                value={actualDays}
                onChange={e => setActualDays(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatTimeQuery(pred.timeContext)}
              。予測と比較するときは、対象時点と尺度が同じか確認してください。記録日と測定日は別に保存します。
            </p>
            <div className="space-y-1.5">
              <Label>実績値</Label>
              <Input
                placeholder="例: 1（自立）、0（非自立）、85（FIM点数）"
                value={outcomeValue}
                onChange={e => setOutcomeValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>ラベル</Label>
              <Input
                placeholder="例: 歩行自立、FIM85点"
                value={outcomeLabel}
                onChange={e => setOutcomeLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>メモ</Label>
              <Textarea
                placeholder="特記事項など"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="min-h-16"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOutcomeDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              onClick={() => {
                if (!outcomeValue) {
                  toast.warning("実績値を入力してください");
                  return;
                }
                const parsed = actualOutcomeSchema.safeParse({
                  value:
                    scale === "other" ? outcomeValue : Number(outcomeValue),
                  label: outcomeLabel || outcomeValue,
                  scale,
                  scaleName: scale === "other" ? scaleName : "",
                  measuredOn,
                  daysSinceOnset: actualDays.trim()
                    ? Number(actualDays)
                    : undefined,
                });
                if (!parsed.success) {
                  toast.error(parsed.error.issues[0].message);
                  return;
                }
                updateMutation.mutate({
                  id: pred.id,
                  actualOutcome: parsed.data,
                  notes,
                });
              }}
              disabled={updateMutation.isPending}
            >
              記録する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function HistoryPage() {
  const pageSize = 20;
  const [page, setPage] = useState(0);
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [caseDraft, setCaseDraft] = useState("");
  const [caseFilter, setCaseFilter] = useState("");
  const filters = {
    outcomeId: outcomeFilter ? Number(outcomeFilter) : undefined,
    search: search || undefined,
    caseId: caseFilter || undefined,
  };
  const { data: outcomes } = trpc.outcomes.list.useQuery();
  const {
    data: pageData,
    isLoading,
    error,
    refetch,
  } = trpc.history.list.useQuery({
    limit: pageSize + 1,
    offset: page * pageSize,
    ...filters,
  });
  const predictions = pageData?.slice(0, pageSize);
  const hasNext = (pageData?.length ?? 0) > pageSize;
  const utils = trpc.useUtils();
  const [isExporting, setIsExporting] = useState(false);

  const outcomeName = (id: number) =>
    outcomes?.find(o => o.id === id)?.name ?? `ID:${id}`;

  const handleExportCsv = async (detailed = false) => {
    setIsExporting(true);
    try {
      const csvData = await (
        detailed ? utils.history.exportDetailedCsv : utils.history.exportCsv
      ).fetch({ limit: 1000, ...filters });
      const blob = new Blob([csvData.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rehab_${detailed ? "rule_details" : "predictions"}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSVをダウンロードしました");
    } catch (error) {
      toast.error(
        `CSVを出力できませんでした: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <History className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">照合履歴</h1>
            <p className="text-sm text-muted-foreground">
              過去の文献照合結果と実績を管理します
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => handleExportCsv()}
          disabled={isExporting || !predictions?.length}
        >
          <Download className="h-4 w-4" />
          {isExporting ? "出力中..." : "絞り込み結果をCSV出力（最新1,000件）"}
        </Button>
      </div>

      {import.meta.env.VITE_DEMO_MODE !== "true" && (
        <Button
          variant="outline"
          onClick={() => handleExportCsv(true)}
          disabled={isExporting || !predictions?.length}
        >
          文献ごとの詳細CSV（同じ絞り込み・最新1,000履歴）
        </Button>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={event => {
          event.preventDefault();
          setSearch(searchDraft.trim());
          setCaseFilter(caseDraft.trim());
          setPage(0);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="history-case">症例ID（完全一致）</Label>
          <Input
            id="history-case"
            value={caseDraft}
            onChange={e => setCaseDraft(e.target.value)}
            maxLength={64}
            placeholder="例: CASE-001"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="history-outcome">アウトカム</Label>
          <select
            id="history-outcome"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={outcomeFilter}
            onChange={event => {
              setOutcomeFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="">すべて</option>
            {outcomes?.map(outcome => (
              <option key={outcome.id} value={outcome.id}>
                {outcome.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 flex-1 min-w-48">
          <Label htmlFor="history-search">履歴ID・メモ検索</Label>
          <Input
            id="history-search"
            value={searchDraft}
            onChange={event => setSearchDraft(event.target.value)}
            maxLength={200}
            placeholder="例: 123 またはメモの一部"
          />
        </div>
        <Button type="submit" variant="outline">
          検索
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setSearchDraft("");
            setSearch("");
            setCaseDraft("");
            setCaseFilter("");
            setOutcomeFilter("");
            setPage(0);
          }}
        >
          解除
        </Button>
      </form>
      {caseFilter && predictions && predictions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              症例 {caseFilter} の経過（評価日の新しい順）
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr>
                  <th className="p-2">評価日 / 時点</th>
                  <th className="p-2">現在BBS</th>
                  <th className="p-2">現在FIM運動</th>
                  <th className="p-2">入院時FIM運動</th>
                  <th className="p-2">実績</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map(p => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">
                      {p.assessedOn ?? "未記録"}
                      <br />
                      {ASSESSMENT_PHASES[
                        p.assessmentPhase as keyof typeof ASSESSMENT_PHASES
                      ] ?? "未記録"}
                    </td>
                    <td className="p-2">
                      {String(p.patientInputs.bbs_score ?? "—")}
                    </td>
                    <td className="p-2">
                      {String(p.patientInputs.fim_motor_total ?? "—")}
                    </td>
                    <td className="p-2">
                      {String(p.patientInputs.admission_fim_motor_total ?? "—")}
                    </td>
                    <td className="p-2">
                      {String(p.actualOutcome?.value ?? "未記録")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* サマリーカード */}
      {predictions && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                このページの照合件数
              </p>
              <p className="text-2xl font-bold text-primary">
                {predictions.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                このページの実績記録済み
              </p>
              <p className="text-2xl font-bold text-emerald-700">
                {predictions.filter(p => p.actualOutcome !== null).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                このページの支持判定件数
              </p>
              <p className="text-2xl font-bold text-foreground">
                {
                  predictions.filter(
                    p =>
                      (!("resultCount" in p) || p.resultCount !== 0) &&
                      p.consensusLabel === "positive"
                  ).length
                }
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 履歴一覧 */}
      {error ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <p role="alert">履歴を読み込めませんでした: {error.message}</p>
            <Button variant="outline" onClick={() => refetch()}>
              再読み込み
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          読み込み中...
        </div>
      ) : predictions?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>
              {search || outcomeFilter || caseFilter || page > 0
                ? "条件に一致する履歴がありません"
                : "照合履歴がありません"}
            </p>
            <p className="text-xs mt-1">
              「照合して履歴に保存」で記録した結果を表示します
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(predictions as PredictionRecord[] | undefined)?.map(p => (
            <PredictionRow
              key={p.id}
              pred={p}
              outcomeName={outcomeName(p.outcomeId)}
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={page === 0 || isLoading}
          onClick={() => setPage(value => value - 1)}
        >
          前のページ
        </Button>
        <span className="text-sm text-muted-foreground">
          {page + 1} ページ目（1ページ20件）
        </span>
        <Button
          variant="outline"
          disabled={!hasNext || isLoading}
          onClick={() => setPage(value => value + 1)}
        >
          次のページ
        </Button>
      </div>
    </div>
  );
}
