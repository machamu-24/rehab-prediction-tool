# RehabPredict 配布版：Windows・Macの初回設定と起動

GitHubの [Releases](https://github.com/machamu-24/rehab-prediction-tool/releases) から `RehabPredict-v1.1.0-Windows-macOS.zip` をダウンロードします。Windows・Mac共通のZIPです。`Source code` は開発用なので、通常は名前が `RehabPredict-` で始まるZIPを選んでください。

## 最初に必要なもの

- WindowsまたはmacOS。アプリはそのPCのブラウザで開きます。
- [Node.js](https://nodejs.org/) の **24以上のLTS版**。PCに合うWindows／macOSのインストーラーを使います。
- [MySQL Community Server](https://dev.mysql.com/downloads/mysql/) の **8.0以上（8.4 LTS推奨）**。MySQLサービスを起動し、設定時に決めた管理ユーザーとパスワードを用意します。WindowsではMySQLサービス、Macではインストール方法に応じてMySQL設定画面またはサービスから起動します。

この配布物はNode.jsとMySQLを別途必要とするローカル用ブラウザアプリです。単独の `.exe` / `.app` インストーラーではありません。アプリ本体はビルド済みで、Git・pnpm・npm install・ソースのビルドは不要です。環境のインストールと配布ZIPの取得後は、文献URLを開く場合などを除き、インターネット接続なしで使用できます。

## 1. ZIPを展開する

WindowsではZIPを右クリックして「すべて展開」、MacではZIPを開きます。展開したフォルダーを任意の場所に保存してください。ZIPの中から直接起動しないでください。

## 2. 初回だけ設定する

1. Windowsは **Setup RehabPredict.cmd**、Macは **Setup RehabPredict.command** を開きます。
2. MySQLのポート（通常3306）、管理ユーザー（通常root）、管理パスワードを入力します。パスワードは画面に表示しません。管理ユーザーにはDB作成・ユーザー作成・権限付与の権限が必要です。
3. 新しいDB名を入力するか、Enterで自動生成された名前を使います。
4. 「設定完了：文献23件・アウトカム7件・照合履歴0件」が表示されれば完了です。件数はこの版のものです。

現在の文献データを新しいDBへ取り込みます。無効化状態・適用条件・式・係数・時間軸・出典URLも含めて引き継ぎます。症例入力・照合履歴・実績・メモ・ユーザーアカウント・バックアップ・下書きは同梱していません。文献に同じ研究の複数ルールがあるため、文献数は登録ルール数です。

初回設定は、既存のDB名が指定された場合には停止します。既存環境を削除・初期化する操作はありません。アプリ専用のMySQLユーザーを作成し、その接続設定を保存します。MySQL管理パスワードは保存しません。

## 3. 起動・終了する

Windowsは **Start RehabPredict.cmd**、Macは **Start RehabPredict.command** を開きます。ブラウザが開いたら、左の「接続・バックアップ」で「準備ができています」を確認してください。標準URLは `http://localhost:3020/` です。別のアプリがポートを使っていれば空きポートで起動し、実際のURLを表示します。

終了は起動したターミナル／コマンド画面で **Ctrl+C**。Windowsで終了の確認が表示された場合は画面の案内に従ってください。ブラウザを閉じるだけではアプリは終了しません。MySQLのデータは終了後も残ります。

起動ファイルが実行できない場合は、展開フォルダーでターミナルを開いて実行できます。

```sh
node scripts/release/setup.mjs
node scripts/release/start.mjs
```

Macで実行権限がないと表示される場合は、ターミナルで展開フォルダーへ移動し、`chmod +x *.command` を実行するか、上の `node` コマンドを使用してください。

## データの保存場所・更新

- 文献・症例・履歴・実績は、初回設定で作成したそのPCのMySQL DBに保存します。PC間で自動共有されません。
- 接続設定と画面から作成したバックアップの保存先：Windowsは `%LOCALAPPDATA%\RehabPredict`、Macは `~/Library/Application Support/RehabPredict`。`.env` は接続情報なので配布しないでください。バックアップはその中の `backups` に保存されます。
- アプリ本体のフォルダーと保存設定は分離しています。新しい版は別フォルダーへ展開し、古いアプリを終了して、新しい版のStartを開きます。同じ接続設定・DBを使うため、文献や履歴は残ります。Setupを開いても設定済みなら取り込み直しません。
- 今回の新規配布では履歴0件で開始します。更新時には利用者が追加した文献・履歴を自動リセットしません。将来のDBスキーマ変更が必要な版では、その版の更新手順を確認してください。
- バックアップは「接続・バックアップ」から作成します。コマンドでも `node scripts/release/db.mjs backup` が使えます。復元は `node scripts/release/db.mjs restore <バックアップ名> <新しいDB名 rehab_restore_...>` です。復元にはDB作成権限のあるユーザーでの接続設定が必要です。アプリ専用ユーザーの権限では新しいDBを作れないため、管理者へ依頼してください。

## 起動できない場合

- `Node.js ... required`：Node.jsの24以上のLTS版をインストールし、コマンド画面を開き直してください。
- `ECONNREFUSED`：MySQLサービスの起動とポートを確認してください。
- `ER_ACCESS_DENIED_ERROR`：管理ユーザー・パスワードを確認してください。
- `ER_DB_CREATE_EXISTS`：指定したDBは既にあります。別の新しいDB名を指定してください。
- 初回設定が途中で止まった場合：既存DBを上書きしないため、新しいDB名で再実行してください。前の試行で作成された空のDB／専用ユーザーの整理はMySQL管理者が行います。
- 強制終了後に `.setup.lock` が残った場合：他の初回設定が動いていないことを確認してから、上記設定保存先の `.setup.lock` だけを削除して再実行します。
- その他の入力・文献登録・履歴操作は同梱の `docs/LOCAL_USER_GUIDE.md` を参照してください。同ガイド中の `pnpm` コマンドは開発用ソース版向けです。配布版の起動はこのページの手順を使います。

## 配布内容の確認

`release-manifest.json` にコード版・文献の書き出し日時・件数・文献チェックサムを記録しています。`SHA256SUMS.txt` はGitHub ReleasesのZIPのSHA-256です。

新たに配布版を作成する開発者は、最新の通常版DBを起動した状態で `pnpm export:release-literature` を実行し、`release/literature.seed.json` の文献内容を確認・コミットしてからリリースを作成します。通常のバックアップを配布用に流用しないでください。書き出し処理は文献・アウトカムの許可された列だけを読み取り、症例・履歴テーブルにはアクセスしません。
