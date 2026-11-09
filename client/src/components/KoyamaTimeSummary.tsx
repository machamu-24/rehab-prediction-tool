import { koyamaTimeQuery } from "@shared/koyama";

export function KoyamaTimeSummary({ inputs }: { inputs: Record<string, unknown> }) {
  const query = koyamaTimeQuery(inputs);
  return (
    <div className="space-y-2 border-t pt-3 text-sm" aria-live="polite">
      <p className="font-medium">Koyama専用の時間軸（発症日＝0日）</p>
      <p className="text-xs text-muted-foreground">
        下の専用入力B・Xを時間軸に自動反映して将来予測します。他の文献に使う上部の時間軸と同じ値を二重入力する必要はありません。
      </p>
      <dl className="space-y-1">
        <div><dt className="inline">評価時点（B：再評価）：</dt><dd className="inline">{query.evaluation ? `発症後${query.evaluation.value}日` : "B欄に入力してください"}</dd></div>
        <div><dt className="inline">予測対象時点（X）：</dt><dd className="inline">{query.target ? `発症後${query.target.value}日` : "X欄に入力してください"}</dd></div>
      </dl>
    </div>
  );
}
