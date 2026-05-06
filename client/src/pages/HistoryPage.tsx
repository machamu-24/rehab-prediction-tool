import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
};

const CONSENSUS_COLORS = {
  positive: "text-emerald-700 bg-emerald-50 border-emerald-200",
  neutral:  "text-amber-700 bg-amber-50 border-amber-200",
  negative: "text-red-700 bg-red-50 border-red-200",
};

const CONSENSUS_LABELS = {
  positive: "陽性",
  neutral:  "中間",
  negative: "陰性",
};

function PredictionRow({ pred, outcomeName }: { pred: PredictionRecord; outcomeName: string }) {
  const [open, setOpen] = useState(false);
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  const [outcomeValue, setOutcomeValue] = useState("");
  const [outcomeLabel, setOutcomeLabel] = useState("");
  const [notes, setNotes] = useState(pred.notes ?? "");

  const utils = trpc.useUtils();
  const { data: detail } = trpc.history.get.useQuery(
    { id: pred.id },
    { enabled: open }
  );

  const updateMutation = trpc.history.updateOutcome.useMutation({
    onSuccess: () => {
      utils.history.list.invalidate();
      toast.success("実績を記録しました");
      setOutcomeDialogOpen(false);
    },
    onError: (e) => toast.error(`エラー: ${e.message}`),
  });

  const label = pred.consensusLabel as keyof typeof CONSENSUS_COLORS | null;
  const colorClass = label ? CONSENSUS_COLORS[label] : "text-muted-foreground bg-muted border-muted";
  const labelText = label ? CONSENSUS_LABELS[label] : "未評価";
  const pct = pred.consensusScore !== null ? Math.round(pred.consensusScore * 100) : null;

  const inp = pred.patientInputs as Record<string, unknown>;
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
                    <span className="text-xs text-muted-foreground font-mono">#{pred.id}</span>
                    <Badge variant="secondary" className="text-xs">{outcomeName}</Badge>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colorClass}`}>
                      {labelText}{pct !== null ? ` (${pct}%)` : ""}
                    </span>
                    {ao && (
                      <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-300">
                        実績あり
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>評価日: {new Date(pred.createdAt).toLocaleDateString("ja-JP")}</span>
                    {inp.age != null && <span>年齢: {String(inp.age)}歳</span>}
                    {inp.sex != null && <span>性別: {String(inp.sex)}</span>}
                    {inp.days_post_stroke != null && <span>発症{String(inp.days_post_stroke)}日</span>}
                    {inp.nihss != null && <span>NIHSS: {String(inp.nihss)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost" size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={(e) => { e.stopPropagation(); setOutcomeDialogOpen(true); }}
                  >
                    <Edit2 className="h-3 w-3" />
                    実績入力
                  </Button>
                  {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 border-t pt-3 space-y-3">
              {/* 実績表示 */}
              {ao && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
                  <p className="font-medium text-emerald-800 mb-1">退院時実績</p>
                  <div className="flex flex-wrap gap-3 text-emerald-700 text-xs">
                    <span>実績値: <strong>{String(ao.value ?? "")}</strong>（{String(ao.label ?? "")}）</span>
                    {ao.fac_at_discharge != null && <span>FAC: {String(ao.fac_at_discharge)}</span>}
                    {ao.fim_at_discharge != null && <span>FIM: {String(ao.fim_at_discharge)}</span>}
                    {ao.hospital_days != null && <span>入院日数: {String(ao.hospital_days)}日</span>}
                    {pred.outcomeRecordedAt && (
                      <span>記録日: {new Date(pred.outcomeRecordedAt).toLocaleDateString("ja-JP")}</span>
                    )}
                  </div>
                  {ao.notes != null && <p className="text-xs text-emerald-600 mt-1">{String(ao.notes)}</p>}
                </div>
              )}

              {/* ルール結果 */}
              {detail?.results && detail.results.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ルール評価結果</p>
                  {(detail.results as RuleResult[]).map((r) => (
                    <div key={r.id} className={`flex items-start gap-2 text-xs p-2 rounded-md ${r.isApplicable ? (r.isPositive ? "bg-emerald-50" : "bg-red-50") : "bg-muted/50"}`}>
                      {r.isApplicable
                        ? (r.isPositive ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />)
                        : <XCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      }
                      <div>
                        <span className="font-medium">{r.ruleName}</span>
                        {r.prediction && <span className="ml-2 text-muted-foreground">{r.prediction}</span>}
                        {!r.isApplicable && r.unavailableReason && (
                          <span className="ml-2 text-muted-foreground">（{r.unavailableReason}）</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* メモ */}
              {pred.notes && (
                <p className="text-xs text-muted-foreground border-t pt-2">{pred.notes}</p>
              )}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 実績入力ダイアログ */}
      <Dialog open={outcomeDialogOpen} onOpenChange={setOutcomeDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>退院時実績を記録</DialogTitle>
            <DialogDescription>予測結果との比較のため、実際のアウトカムを入力してください</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>実績値</Label>
              <Input
                placeholder="例: 1（自立）、0（非自立）、85（FIM点数）"
                value={outcomeValue}
                onChange={(e) => setOutcomeValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>ラベル</Label>
              <Input
                placeholder="例: 歩行自立、FIM85点"
                value={outcomeLabel}
                onChange={(e) => setOutcomeLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>メモ</Label>
              <Textarea
                placeholder="特記事項など"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-16"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutcomeDialogOpen(false)}>キャンセル</Button>
            <Button
              onClick={() => {
                if (!outcomeValue) { toast.warning("実績値を入力してください"); return; }
                updateMutation.mutate({
                  id: pred.id,
                  actualOutcome: { value: outcomeValue, label: outcomeLabel || outcomeValue },
                  notes: notes || undefined,
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
  const { data: outcomes } = trpc.outcomes.list.useQuery();
  const { data: predictions, isLoading } = trpc.history.list.useQuery({ limit: 200 });
  const { data: csvData } = trpc.history.exportCsv.useQuery({ limit: 1000 });

  const outcomeName = (id: number) => outcomes?.find((o) => o.id === id)?.name ?? `ID:${id}`;

  const handleExportCsv = () => {
    if (!csvData?.csv) return;
    const blob = new Blob([csvData.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rehab_predictions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSVをダウンロードしました");
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
            <h1 className="text-xl font-bold">予測履歴</h1>
            <p className="text-sm text-muted-foreground">過去の予測結果と退院時実績を管理します</p>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={handleExportCsv} disabled={!csvData?.csv}>
          <Download className="h-4 w-4" />
          CSVエクスポート
        </Button>
      </div>

      {/* サマリーカード */}
      {predictions && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">総予測件数</p>
              <p className="text-2xl font-bold text-primary">{predictions.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">実績記録済み</p>
              <p className="text-2xl font-bold text-emerald-700">
                {predictions.filter((p) => p.actualOutcome !== null).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">陽性予測率</p>
              <p className="text-2xl font-bold text-foreground">
                {predictions.length > 0
                  ? `${Math.round(predictions.filter((p) => p.consensusLabel === "positive").length / predictions.length * 100)}%`
                  : "-"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 履歴一覧 */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : predictions?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>予測履歴がありません</p>
            <p className="text-xs mt-1">予測実行ページから予測を行うと、ここに記録されます</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(predictions as PredictionRecord[]).map((p) => (
            <PredictionRow key={p.id} pred={p} outcomeName={outcomeName(p.outcomeId)} />
          ))}
        </div>
      )}
    </div>
  );
}
