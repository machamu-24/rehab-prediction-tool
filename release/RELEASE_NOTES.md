**Node.js・MySQLの個別導入が不要なデスクトップ版になりました。**

### ダウンロードと起動

| PC | ダウンロードするファイル | 起動まで |
| --- | --- | --- |
| Windows（64bit・Intel/AMD） | `RehabPredict-2.0.0-Windows-x64-Setup.exe` | インストーラーを実行し、アイコンを開く |
| Apple Silicon Mac | `RehabPredict-2.0.0-macOS-arm64.dmg` | appをApplicationsへコピーして開く |
| Intel Mac | `RehabPredict-2.0.0-macOS-x64.dmg` | appをApplicationsへコピーして開く |

初回起動時にSQLiteのデータベースと文献を自動準備します。DB接続設定・管理パスワード・ビルド作業は不要です。[導入・移行・バックアップの手順](https://github.com/machamu-24/rehab-prediction-tool/blob/main/docs/RELEASE_GUIDE.md)

### 文献とデータ

- 2026-11-10に最新の通常版DBから書き出した **7アウトカム・23文献ルール**を同梱。式・係数・条件・時間軸・出典URL・有効／無効状態を引き継ぎます。
- **新規利用時の照合履歴・個別結果は0件**。症例入力・実績・メモ・接続情報・バックアップを配布物に含みません。
- SQLiteは各PCの利用者データ領域に保存。アプリの更新・再インストールで文献や履歴を初期化しません。
- 「接続・バックアップ」からJSONの保存・検証・復元を操作できます。復元前は自動バックアップし、新しいDBファイルへ復元します。旧MySQL版のJSONバックアップも取り込めます。元のMySQL DBは変更しません。

### 動作確認

Windows x64・Mac arm64・Mac x64の実際のインストーラーから起動し、初期文献・履歴0件、文献編集、照合保存、CSV、バックアップ復元、再起動後の保持を検証しています。Windowsはインストーラーの再実行後も保持することを確認します。検証結果は `INSTALLER_TESTS.json`、配布ファイルのSHA-256は `SHA256SUMS.txt` に添付しています。

### 署名について

この版はWindowsの発行元署名とAppleのDeveloper ID署名・公証が未設定です。Mac版はアドホック署名です。初回にOSの発行元確認が表示される場合があり、組織のPC設定によっては管理者の許可が必要です。署名・公証なしで確認操作まで不要にできることは保証していません。
