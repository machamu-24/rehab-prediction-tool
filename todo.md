# リハビリ予後予測支援ツール TODO

## 今後の作業課題（2026-11-09）

ユーザーの課題メモ8件、現状の実装確認、対応案・推奨順序を [今後の作業課題と対応案](docs/FUTURE_WORK.md) に記録。項目1の膝伸展筋力欄の整理、項目2の8種類の文献登録GUI化、項目3のノモグラム参考文献表示、項目5の履歴の表形式表示・症例再利用は2026-11-09に対応済み。同日にWindows・Mac用配布ZIP・初回設定・Releaseの検証と公開ワークフロー、文献のみの初期データも追加。開発元DBの履歴削除は行っていない。

## バックエンド・DB

- [x] DBスキーマ設計（outcomes, literature_rules, predictions, prediction_results）
- [x] 文献ルールタイプを予後予測研究の手法に合わせて拡張（ノモグラム・スコアリングシステム・複合条件・カスタム式）
- [x] DBマイグレーション実行
- [x] アウトカム管理 tRPC ルーター（CRUD）
- [x] 文献ルール管理 tRPC ルーター（CRUD）
- [x] 予測実行 tRPC ルーター（ルールエンジン評価）
- [x] 予測履歴 tRPC ルーター（一覧・実績更新・CSV出力）
- [x] デモ用シードデータ投入（既存5ルール + 歩行自立アウトカム）

## フロントエンド・UI

- [x] グリーン調カラーテーマ設定（index.css）
- [x] DashboardLayout を使ったサイドバーナビゲーション構成
- [x] 予測実行ページ（患者情報入力フォーム）
- [x] 時期依存ルール適用状況リアルタイム表示
- [x] 予測結果表示（コンセンサスゲージ・個別ルールカード）
- [x] 追加評価提案パネル
- [x] アウトカム管理ページ（追加・編集・削除）
- [x] 文献ルール管理ページ（追加・編集・削除、7タイプ対応）
- [x] 予測履歴一覧ページ（退院実績入力・CSV出力）
- [x] レスポンシブデザイン対応（PC・タブレット）

## テスト・配布

- [x] バックエンドユニットテスト（ルールエンジン 18件）
- [x] README作成（Windows/Mac起動手順）
- [x] GitHubリポジトリ作成・プッシュ（machamu-24/rehab-prediction-tool）

## 追加作業（2026-05-07）

- [x] Google Driveの「予後予測関連＿文献」フォルダの論文一覧を確認する
- [x] 追加論文PDFを読み取り・内容解析する
- [x] 追加論文の文献ルールをDBに登録する（seed_literature_v2.mjs）
- [x] 患者情報フォームに膝伸展筋力フィールドを追加する（麻痺側・非麻痺側 Nm/kg）
- [x] 患者情報フォームにFBS（Functional Balance Scale）フィールドを追加する（0-56点）
- [x] 患者情報フォームにCBA（Cognitive Behavioral Assessment）フィールドを追加する（0-30点）
- [x] 患者情報フォームにFIM認知フィールドを追加する（5-35点）
- [x] 患者情報フォームに起居動作フィールドを追加する（自立/監視/介助）
- [x] ruleEngine.tsの必要フィールドリストを新フィールドに対応させる
- [x] 動作確認・GitHubプッシュ・チェックポイント保存
## バグ修正（2026-05-07）
- [x] 「Cannot read properties of undefined (reading 'filter')」エラーの原因特定
- [x] ID 30006・30007（decision_tree）のruleDefinitionをnodes配列形式に変換・DB更新
- [x] ID 60007・60008（composite_rule）のruleDefinitionをroot形式に変換・DB更新
- [x] ruleEngine.tsにnodes/root未定義時の防御コードを追加
- [x] storageProxy.tsのTypeScriptエラー修正（req.params[0]型問題）
- [x] 全18テストパス確認・GitHubプッシュ・チェックポイント保存

## バグ修正（2026-05-07）
- [x] Cannot read properties of undefined (reading filter) エラーの原因特定
- [x] ID 30006・30007（decision_tree）のruleDefinitionをnodes配列形式に変換・DB更新
- [x] ID 60007・60008（composite_rule）のruleDefinitionをroot形式に変換・DB更新
- [x] ruleEngine.tsにnodes/root未定義時の防御コードを追加
- [x] storageProxy.tsのTypeScriptエラー修正
- [x] 全18テストパス確認・GitHubプッシュ・チェックポイント保存
