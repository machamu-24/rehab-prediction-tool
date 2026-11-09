Windows・Macの各PCで使う通常版です。

**ダウンロード：`RehabPredict-v1.1.0-Windows-macOS.zip`**（両OS共通）。ZIPを展開し、同梱の `START_HERE.md` を確認してください。

### 動作環境と起動

- Node.js 24以上のLTS版とMySQL 8.0以上が必要です（8.4 LTS推奨）。単独のexe/appではありません。
- Windows：初回は `Setup RehabPredict.cmd`、以後は `Start RehabPredict.cmd`。
- Mac：初回は `Setup RehabPredict.command`、以後は `Start RehabPredict.command`。
- 初回設定にはMySQLの管理ユーザーが必要です。新規DBとアプリ専用ユーザーを作成します。アプリはビルド済みで、pnpm・npm installは不要です。

### 同梱データ

- 2026-11-09に現在の通常版DBから書き出した **7アウトカム・23文献ルール**。式・適用条件・時間軸・出典URL・有効／無効状態を引き継ぎます。
- **新規利用時の照合履歴・個別結果は0件**。症例入力、実績、メモ、バックアップ、接続情報を含みません。
- 既存環境への更新では、そのPCの追加文献・履歴を保持します。既存DBの初期化・上書きは行いません。

### 主な改善

- 文献登録を8種類のGUIに対応。
- 自動計算できないノモグラムを、理由・入力状況付きの参考文献として表示。
- 将来予測／同時点の判別に応じた評価項目欄の整理。
- 保存入力を日本語の分類別表で表示し、再照合・次回評価への引き継ぎに対応。前回の評価日と値を参照可能。

文献の書き出し日時とチェックサムはZIP内の `release-manifest.json`、ZIP自体のSHA-256は添付の `SHA256SUMS.txt` で確認できます。
