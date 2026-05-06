# リハビリ予後予測支援ツール（RehabPredict）

脳卒中リハビリテーション領域における文献ベースのアウトカム予測Webアプリケーション。  
既存デモ（[stroke-walking-prediction](https://github.com/machamu-24/stroke-walking-prediction)）を拡張し、アウトカムや文献ルールをUIから自由に管理できる形に再設計した。

---

## 主な機能

| 機能 | 説明 |
|------|------|
| **アウトカム管理** | 歩行自立・FIM・入院日数など、予測対象をUIから自由に追加・編集・削除 |
| **文献ルール管理** | 7種類のルールタイプ（後述）に対応した文献ルールをUIから登録・編集・削除 |
| **患者情報入力** | 年齢・性別・発症日数・NIHSS・BBS・TCT・MI下肢・歩行速度など |
| **予測エンジン** | 登録された文献ルールを動的に評価し、コンセンサス分析を実施 |
| **予測結果表示** | 個別ルール結果カード・総合コンセンサススコア・色分け表示 |
| **時期依存ガイド** | 発症日数に応じてEPOS・TWISTなど時期限定ルールの適用可否をリアルタイム表示 |
| **追加評価の提案** | 現在の入力では使えないルールについて、追加取得すべき評価項目を案内 |
| **予測履歴** | 予測結果をDBに保存し、退院時実績の入力・CSV出力が可能 |

---

## 対応ルールタイプ（7種類）

| タイプ | 説明 | 代表例 |
|--------|------|--------|
| `cutoff` | カットオフ値 | BBS ≥ 14 → 歩行自立 |
| `decision_tree` | 決定木 | EPOSモデル（座位保持 × MI下肢） |
| `regression` | 重回帰式 | 退院日数の予測（BBS・FIM・年齢の線形結合） |
| `scoring_system` | スコアリングシステム | NIHSS重症度スコア |
| `nomogram` | ノモグラム | ロジスティック回帰ベースの確率算出 |
| `composite_rule` | 複合条件（AND/OR/NOT） | NIHSS性別補正カットオフ |
| `custom_formula` | カスタム数式 | `0.3 * bbs_score + 0.2 * tct_score - 5` |

---

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 19 + TypeScript + Tailwind CSS 4 |
| バックエンド | Express 4 + tRPC 11 |
| データベース | MySQL（クラウド管理型） |
| ORM | Drizzle ORM |
| テスト | Vitest |

---

## ローカル環境での起動手順

### 前提条件

以下のソフトウェアが必要です。

| ソフトウェア | バージョン | 備考 |
|-------------|-----------|------|
| Node.js | 20以上 | [nodejs.org](https://nodejs.org/) からダウンロード |
| pnpm | 10以上 | `npm install -g pnpm` でインストール |
| Git | 任意 | リポジトリのクローン用 |

### Windows での起動手順

```powershell
# 1. リポジトリをクローン
git clone https://github.com/machamu-24/rehab-prediction-tool.git
cd rehab-prediction-tool

# 2. 依存パッケージをインストール
pnpm install

# 3. 環境変数ファイルを作成（初回のみ）
copy .env.example .env
# .env ファイルを編集して DATABASE_URL などを設定

# 4. 開発サーバーを起動
pnpm dev
```

ブラウザで `http://localhost:3000` を開く。

### Mac での起動手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/machamu-24/rehab-prediction-tool.git
cd rehab-prediction-tool

# 2. 依存パッケージをインストール
pnpm install

# 3. 環境変数ファイルを作成（初回のみ）
cp .env.example .env
# .env ファイルを編集して DATABASE_URL などを設定

# 4. 開発サーバーを起動
pnpm dev
```

ブラウザで `http://localhost:3000` を開く。

### 環境変数の設定

`.env` ファイルに以下の変数を設定する。

```env
# データベース接続文字列（MySQL）
DATABASE_URL=mysql://user:password@host:3306/dbname

# セッション署名用シークレット（任意の文字列）
JWT_SECRET=your-secret-key
```

> **注意**: `.env` ファイルはGitにコミットしないこと。

---

## 開発コマンド

```bash
# 開発サーバー起動（ホットリロード対応）
pnpm dev

# テスト実行
pnpm test

# 型チェック
pnpm check

# ビルド（本番用）
pnpm build

# 本番サーバー起動
pnpm start
```

---

## プロジェクト構成

```
rehab-prediction-tool/
├── client/                  # フロントエンド（React）
│   └── src/
│       ├── pages/
│       │   ├── PredictPage.tsx      # 予測実行ページ
│       │   ├── HistoryPage.tsx      # 予測履歴ページ
│       │   ├── RulesPage.tsx        # 文献ルール管理ページ
│       │   └── OutcomesPage.tsx     # アウトカム管理ページ
│       └── components/
├── server/                  # バックエンド（Express + tRPC）
│   ├── ruleEngine.ts        # 文献ベースルール評価エンジン
│   ├── ruleEngine.test.ts   # ルールエンジンのユニットテスト
│   ├── routers.ts           # tRPC ルーター
│   └── db.ts                # DB クエリヘルパー
├── drizzle/
│   └── schema.ts            # DBスキーマ定義
├── scripts/
│   └── seed.mjs             # 初期データ投入スクリプト
└── README.md
```

---

## 参考文献（デモデータに含まれるルール）

| ルール名 | 文献 |
|----------|------|
| EPOSモデル（決定木） | Veerbeek JM et al. (2011). *Early prediction of outcome of activities of daily living after stroke.* Stroke. |
| BBSカットオフ（歩行自立） | Jenkin SE et al. (2021). *Predictors of independent walking after stroke.* Physiotherapy Canada. |
| NIHSS性別補正カットオフ | Murata Y et al. (2019). *Sex-specific NIHSS cutoff for walking independence.* J Stroke Cerebrovasc Dis. |
| TCTカットオフ（TWIST） | Ohura T et al. (2000). *Trunk Control Test for stroke outcome prediction.* Disabil Rehabil. |
| MI下肢カットオフ | Collin C, Wade D. (1990). *Motricity Index for stroke rehabilitation.* Clin Rehabil. |

---

## ライセンス

MIT License

---

## 関連リポジトリ

- [stroke-walking-prediction](https://github.com/machamu-24/stroke-walking-prediction) — 本ツールの元となったデモアプリ
