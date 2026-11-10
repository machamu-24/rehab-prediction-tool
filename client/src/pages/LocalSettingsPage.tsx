import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type RestoreSelection = {
  name?: string;
  content?: string;
  counts: Record<string, number>;
  legacyTimeZone?: boolean;
};
export default function LocalSettingsPage() {
  const utils = trpc.useUtils();
  const status = trpc.local.status.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  const backups = trpc.local.backups.useQuery();
  const [restore, setRestore] = useState<RestoreSelection | null>(null);
  const [legacyUTC, setLegacyUTC] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const create = trpc.local.createBackup.useMutation({
    onSuccess: () => {
      backups.refetch();
      toast.success("バックアップを作成しました");
    },
    onError: () =>
      toast.error(
        "バックアップを作成できません。保存先の空き容量を確認してください。"
      ),
  });
  const verify = trpc.local.verifyBackup.useMutation({
    onSuccess: data =>
      toast.success(
        `形式・チェックサム正常：${Object.values(data.counts).reduce((sum, n) => sum + n, 0)}行`
      ),
    onError: () =>
      toast.error("バックアップの形式・チェックサムを確認できません"),
  });
  const inspect = trpc.local.inspectBackup.useMutation();
  const restoring = trpc.local.restoreBackup.useMutation({
    onSuccess: async () => {
      setRestore(null);
      await utils.invalidate();
      toast.success(
        "別のデータファイルへ復元し、切り替えました。元のデータも保存されています。"
      );
    },
    onError: error => toast.error(`復元できませんでした：${error.message}`),
  });
  const ready =
    status.data?.database === "connected" && status.data.schemaReady;
  const download = async (name: string) => {
    try {
      const data = await utils.local.downloadBackup.fetch({ name });
      const url = URL.createObjectURL(
        new Blob([data.content], { type: "application/json" })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = data.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("バックアップを保存できませんでした");
    }
  };
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">接続・バックアップ</h1>
      <Card>
        <CardHeader>
          <CardTitle>アプリの状態</CardTitle>
          <CardDescription>
            データはこのPCのSQLiteデータベースに保存されます。接続設定は不要です。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p role="status">
            {status.isLoading
              ? "確認中…"
              : status.error
                ? "アプリの状態を確認できません。アプリを開き直してください。"
                : ready
                  ? "データ保存の準備ができています"
                  : "データを開けませんでした。保存先の空き容量とアクセス権を確認してください。"}
          </p>
          <p className="text-xs text-muted-foreground">
            計算版：{status.data?.version ?? "確認中"}
          </p>
          {status.data?.dataDirectory && (
            <div className="text-sm space-y-1">
              <p>データの保存先</p>
              <code className="block rounded bg-muted p-3 text-xs break-all">
                {status.data.dataDirectory}
              </code>
            </div>
          )}
          <Button
            variant="outline"
            disabled={status.isFetching}
            onClick={() => status.refetch()}
          >
            状態を再確認
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>バックアップ</CardTitle>
          <CardDescription>
            文献・アウトカム・照合履歴・実績・メモをまとめて保存します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => create.mutate()}
            disabled={!ready || create.isPending || restoring.isPending}
          >
            {create.isPending ? "作成中…" : "バックアップを作成"}
          </Button>
          <p className="text-xs text-muted-foreground">
            バックアップは上の保存先のbackupsフォルダーに保存します。「別の場所に保存」から外部媒体などへコピーできます。
          </p>
          {backups.error && (
            <p role="alert">バックアップ一覧を読み込めませんでした。</p>
          )}
          {backups.data?.length === 0 && <p>バックアップはまだありません。</p>}
          <ul className="space-y-3">
            {backups.data?.map(backup => (
              <li key={backup.name} className="rounded border p-3 space-y-2">
                <p className="text-xs break-all">{backup.name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(backup.createdAt).toLocaleString("ja-JP")} ／{" "}
                  {(backup.bytes / 1024).toFixed(1)} KB
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => download(backup.name)}
                  >
                    別の場所に保存
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={verify.isPending}
                    onClick={() => verify.mutate({ name: backup.name })}
                  >
                    整合性を検証
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={inspect.isPending || restoring.isPending}
                    onClick={async () => {
                      try {
                        const data = await utils.local.downloadBackup.fetch({
                          name: backup.name,
                        });
                        const info = await inspect.mutateAsync({
                          content: data.content,
                        });
                        setLegacyUTC(false);
                        setRestore({ name: backup.name, ...info });
                      } catch {
                        toast.error("バックアップを読み込めませんでした");
                      }
                    }}
                  >
                    このバックアップから復元
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ファイルから復元・移行</CardTitle>
          <CardDescription>
            別のPCで保存したバックアップや、旧MySQL版のJSONバックアップを読み込めます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            復元用の新しいデータファイルを作成し、アプリの参照先を切り替えます。現在のデータファイルは残します。
          </p>
          <input
            ref={file}
            className="hidden"
            type="file"
            accept=".json,application/json"
            onChange={async event => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              if (!selected) return;
              if (selected.size > 40_000_000) {
                toast.error("40 MB以下のJSONバックアップを選択してください");
                return;
              }
              try {
                const content = await selected.text();
                const info = await inspect.mutateAsync({ content });
                setLegacyUTC(false);
                setRestore({ content, ...info });
              } catch {
                toast.error("バックアップの形式・チェックサムが不正です");
              }
            }}
          />
          <Button
            variant="outline"
            disabled={inspect.isPending || restoring.isPending}
            onClick={() => file.current?.click()}
          >
            {inspect.isPending ? "確認中…" : "バックアップファイルを選択"}
          </Button>
          <p className="text-xs text-muted-foreground">
            旧MySQL版のデータは、旧版の「バックアップを作成」でJSONを書き出してから選択してください。MySQL自体のデータは変更しません。
          </p>
          <p>
            {status.data?.desktop
              ? "終了はアプリのウィンドウを閉じるか、メニューの「終了」を選びます。保存済みデータは次回も利用できます。"
              : "ブラウザ版の終了は、起動したターミナルでCtrl+Cを押してください。"}
          </p>
        </CardContent>
      </Card>
      <AlertDialog
        open={Boolean(restore)}
        onOpenChange={open => {
          if (!open && !restoring.isPending) setRestore(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              このバックアップへ切り替えますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              バックアップの文献・症例履歴を別のファイルへ復元します。現在のデータは元のファイルに残ります。入力中のフォームは切り替え前に保存してください。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {restore && (
            <div className="text-sm space-y-2">
              <p>
                アウトカム：{restore.counts.outcomes}件 ／ 文献：
                {restore.counts.literature_rules}件
              </p>
              <p>
                照合履歴：{restore.counts.predictions}件 ／ 個別結果：
                {restore.counts.prediction_results}件
              </p>
              {restore.legacyTimeZone && (
                <label className="block text-xs space-y-1">
                  旧バックアップの保存日時の解釈
                  <select
                    className="block border rounded p-2 w-full"
                    value={legacyUTC ? "utc" : "local"}
                    onChange={event =>
                      setLegacyUTC(event.target.value === "utc")
                    }
                  >
                    <option value="local">
                      元のDBはこのPCと同じタイムゾーン
                    </option>
                    <option value="utc">元のDBはUTC</option>
                  </select>
                  <span className="block text-muted-foreground">
                    時差情報のない旧保存日時だけに適用します。評価日そのものは変更しません。
                  </span>
                </label>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring.isPending}>
              キャンセル
            </AlertDialogCancel>
            <Button
              disabled={!restore || restoring.isPending}
              onClick={() =>
                restore &&
                restoring.mutate({
                  name: restore.name,
                  content: restore.content,
                  confirmed: true,
                  legacyUTC,
                })
              }
            >
              {restoring.isPending ? "復元中…" : "復元して切り替える"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
