import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export default function LocalSettingsPage() {
  const status = trpc.local.status.useQuery(undefined, { retry: false, refetchOnWindowFocus: true });
  const backups = trpc.local.backups.useQuery();
  const create = trpc.local.createBackup.useMutation({
    onSuccess: data => { backups.refetch(); toast.success(`バックアップを作成しました: ${data.name}`); },
    onError: () => toast.error("バックアップに失敗しました。DB接続と保存先の空き容量を確認してください。"),
  });
  const verify = trpc.local.verifyBackup.useMutation({
    onSuccess: data => toast.success(`形式・チェックサム正常：${Object.values(data.counts).reduce((sum, count) => sum + Number(count), 0)}行`),
    onError: () => toast.error("バックアップを検証できません。形式・チェックサムまたはファイルの状態を確認してください。"),
  });
  const ready = status.data?.database === "connected" && status.data.schemaReady;
  return <div className="max-w-4xl mx-auto space-y-6">
    <h1 className="text-xl font-bold">接続・バックアップ</h1>
    <Card><CardHeader><CardTitle>通常版の状態</CardTitle></CardHeader><CardContent className="space-y-3">
      <p role="status">{status.isLoading ? "確認中..." : status.error ? "サーバーに接続できません。起動用ターミナルを確認してください。" : ready ? "データベース接続・履歴保存の準備ができています" : status.data?.database === "connected" ? "DB更新が必要です。pnpm local:migrate を実行してください。" : "データベースに接続できません。.envの接続設定とMySQLの起動状態を確認してください。"}</p>
      <p className="text-xs text-muted-foreground">計算版: {status.data?.version ?? "取得できません"} / このコンピューター内から利用する通常版</p>
      <Button variant="outline" disabled={status.isFetching} onClick={() => status.refetch()}>接続を再確認</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>バックアップ</CardTitle><CardDescription>文献・アウトカム・照合履歴・実績をプロジェクトのbackupsフォルダへ保存します。</CardDescription></CardHeader><CardContent className="space-y-4">
      <Button onClick={() => create.mutate()} disabled={!ready || create.isPending}>{create.isPending ? "作成中..." : "バックアップを作成"}</Button>
      <p className="text-xs text-muted-foreground">ファイルには入力データが含まれます。保存先はこのコンピューター内です。別の保存媒体へコピーして保管できます。</p>
      {backups.error && <p role="alert">バックアップ一覧を読み込めませんでした。</p>}
      {backups.data?.length === 0 && <p>バックアップはまだありません。</p>}
      <ul className="space-y-3">{backups.data?.map(backup => <li key={backup.name} className="rounded border p-3 space-y-2"><p className="text-xs break-all">{backup.name}</p><p className="text-xs text-muted-foreground">{new Date(backup.createdAt).toLocaleString("ja-JP")} / {(backup.bytes / 1024).toFixed(1)} KB</p><Button size="sm" variant="outline" disabled={verify.isPending} onClick={() => verify.mutate({name:backup.name})}>ファイルの整合性を検証</Button></li>)}</ul>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>復元と終了</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <p>復元は新しい空のデータベースへ行います。現在利用中のデータは上書きしません。</p>
      <pre className="whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">pnpm local:restore バックアップファイル名 rehab_restore_example</pre>
      <p>復元コマンドは全行の値を照合します。成功後に.envのDATABASE_URLを復元先へ切り替え、アプリを再起動します。詳しい手順はdocs/LOCAL_USER_GUIDE.mdに記載しています。</p>
      <p>アプリを終了するには、起動用ターミナルでControl + Cを押してください。画面を閉じるだけではサーバーは終了しません。</p>
    </CardContent></Card>
  </div>;
}
