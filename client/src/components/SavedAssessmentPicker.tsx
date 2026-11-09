import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  savedDateLabel,
  savedPhaseLabel,
  type ReuseMode,
  type SavedAssessment,
} from "@/lib/savedAssessment";
import { SavedInputsTable } from "./SavedInputsTable";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function SavedAssessmentPicker({
  open,
  onOpenChange,
  onLoad,
  disabled,
  caseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (record: SavedAssessment, mode: ReuseMode) => void;
  disabled: boolean;
  caseId: string;
}) {
  const [caseDraft, setCaseDraft] = useState("");
  const [caseFilter, setCaseFilter] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    if (open) {
      setCaseDraft(caseId);
      setCaseFilter(caseId.trim());
      setPage(0);
      setSelectedId(null);
    }
  }, [open]);
  const history = trpc.history.list.useQuery(
    { limit: 21, offset: page * 20, caseId: caseFilter || undefined },
    { enabled: open }
  );
  const detail = trpc.history.get.useQuery(
    { id: selectedId ?? 0 },
    { enabled: open && selectedId !== null }
  );
  const outcomes = trpc.outcomes.list.useQuery(undefined, { enabled: open });
  const records = history.data?.slice(0, 20);
  const selected =
    detail.data?.prediction?.id === selectedId &&
    !detail.isFetching &&
    !detail.error
      ? (detail.data.prediction as SavedAssessment)
      : null;
  const outcomeName = (record: {
    outcomeId: number;
    outcomeSnapshot?: { name?: string } | null;
  }) =>
    record.outcomeSnapshot?.name ??
    outcomes.data?.find(item => item.id === record.outcomeId)?.name ??
    "アウトカム未記録";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>保存済み症例の入力を読み込む</DialogTitle>
          <DialogDescription>
            症例と評価記録を選んでください。読み込むと現在のフォームを置き換えます。
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={event => {
            event.preventDefault();
            setCaseFilter(caseDraft.trim());
            setPage(0);
            setSelectedId(null);
          }}
        >
          <div className="flex-1 min-w-40">
            <Label htmlFor="saved-case-search">症例ID（完全一致）</Label>
            <Input
              id="saved-case-search"
              value={caseDraft}
              onChange={event => setCaseDraft(event.target.value)}
              placeholder="空欄で最近の記録を表示"
              maxLength={64}
            />
          </div>
          <Button type="submit" variant="outline">
            検索
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setCaseDraft("");
              setCaseFilter("");
              setPage(0);
              setSelectedId(null);
            }}
          >
            解除
          </Button>
        </form>
        {history.isLoading && (
          <p className="text-sm text-muted-foreground">
            保存済みの評価記録を読み込み中…
          </p>
        )}
        {history.error && (
          <div role="alert" className="text-sm text-red-700">
            <p>記録を読み込めませんでした：{history.error.message}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => history.refetch()}
            >
              再読み込み
            </Button>
          </div>
        )}
        {records?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            該当する記録はありません。症例IDを確認するか、「解除」で最近の記録を表示してください。
          </p>
        )}
        {records && records.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-2">
              読み込む評価記録
            </legend>
            {records.map(record => (
              <label
                key={record.id}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer text-sm ${selectedId === record.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
              >
                <input
                  type="radio"
                  name="saved-assessment"
                  className="mt-1"
                  checked={selectedId === record.id}
                  onChange={() => setSelectedId(record.id)}
                  disabled={disabled}
                />
                <span className="min-w-0">
                  <span className="font-medium">
                    {record.caseId ? `症例 ${record.caseId}` : "症例ID未登録"}{" "}
                    <span className="font-normal text-muted-foreground">
                      ／履歴 #{record.id}
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground mt-1">
                    評価日：{savedDateLabel(record)} ／{" "}
                    {savedPhaseLabel(record)} ／ {outcomeName(record)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {records && (
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page === 0 || history.isFetching}
              onClick={() => {
                setPage(value => value - 1);
                setSelectedId(null);
              }}
            >
              前のページ
            </Button>
            <span>{page + 1}ページ</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={(history.data?.length ?? 0) <= 20 || history.isFetching}
              onClick={() => {
                setPage(value => value + 1);
                setSelectedId(null);
              }}
            >
              次のページ
            </Button>
          </div>
        )}
        {selectedId && detail.isFetching && (
          <p className="text-sm text-muted-foreground">
            選択した入力値を読み込み中…
          </p>
        )}
        {detail.error && (
          <div role="alert" className="text-sm text-red-700">
            <p>選択した記録を読み込めませんでした：{detail.error.message}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => detail.refetch()}
            >
              再読み込み
            </Button>
          </div>
        )}
        {selected && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              選択した保存入力を確認（{savedDateLabel(selected)}・
              {savedPhaseLabel(selected)}）
            </summary>
            <div className="mt-3">
              <SavedInputsTable
                inputs={selected.patientInputs}
                definitions={detail.data?.results?.map(
                  result => result.ruleSnapshot?.ruleDefinition
                )}
              />
            </div>
          </details>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-4">
          <div className="space-y-2">
            <Button
              type="button"
              className="w-full"
              disabled={!selected || disabled}
              onClick={() => selected && onLoad(selected, "repeat")}
            >
              この入力で再照合
            </Button>
            <p className="text-xs text-muted-foreground">
              保存時の評価日・入力値・時間軸を戻します。結果は読み込み後、現在の文献で新たに照合します。
            </p>
          </div>
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!selected || disabled}
              onClick={() => selected && onLoad(selected, "followup")}
            >
              次回評価へ引き継ぐ
            </Button>
            <p className="text-xs text-muted-foreground">
              症例ID・入院時などの既往評価・固定情報を引き継ぎます。今回の測定値と時間軸の日数は新しく入力してください。
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
