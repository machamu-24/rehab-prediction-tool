# リハビリ予後予測支援ツール（RehabPredict）

**静的デモ版:** [https://machamu-24.github.io/rehab-prediction-tool/](https://machamu-24.github.io/rehab-prediction-tool/)

脳卒中リハビリテーション領域の予後予測研究で報告されたカットオフ値、決定木、スコアリング、回帰式などを登録し、患者情報と文献ルールを照合するWebアプリケーションです。  
現在の画面上では「予測」というより、入力条件に対して登録済み文献が何を支持するかを整理する「文献照合」ツールとして扱っています。

> 静的デモ版はGitHub Pages上で動作し、MySQL/Express/tRPC APIは使いません。追加・編集・履歴は閲覧者ごとのブラウザ `localStorage` に保存されます。実患者情報や個人情報は入力しないでください。

> 本ツールは研究・検証・説明用の予後支援ツールです。診断、治療方針、退院判断などを単独で決定する目的では使用しないでください。

---

## 現在の主な機能

| 機能 | 内容 |
|------|------|
| **文献照合** | 患者情報を入力し、選択したアウトカムに紐づく文献ルールを一括評価 |
| **照合サマリー** | 文献ごとの判定を「歩行自立を支持」「歩行自立困難を示唆」「判定不可」「適用条件外」に分類 |
| **文献の要点表示** | 対象集団、使用評価項目、文献メモ、今回の入力で該当した理由をカード内に表示 |
| **追加評価の提案** | 未入力のため使えない文献ルールについて、追加すべき評価項目を提示 |
| **時期・条件による適用制御** | 発症後日数などの適用条件に合わないルールを「適用条件外」として分離 |
| **アウトカム管理** | 歩行自立、FIM運動項目、地域歩行などの予測対象を追加・編集・削除 |
| **文献ルール管理** | 7種類のルールタイプ、文献URL、エビデンスレベル、精度指標、適用条件、有効/無効を管理 |
| **ルール作成支援** | カットオフ値・重回帰式はフォーム入力からルール定義JSONを生成。その他は詳細JSON編集に対応 |
| **照合履歴** | 実行した照合結果、個別ルール結果、退院時実績、メモを保存 |
| **CSV出力** | 照合履歴と実績入力をCSVとしてエクスポート |
| **静的デモ版** | 既存文献ルールをビルド時に同梱し、DBなしでGitHub Pagesに公開 |

---

## 画面構成

| パス | 画面 |
|------|------|
| `/` | 文献照合 |
| `/history` | 照合履歴・退院時実績入力・CSVエクスポート |
| `/rules` | 文献ルール管理 |
| `/outcomes` | アウトカム管理 |

---

## デモデータ

静的デモ版およびシードデータには、主に以下のアウトカムが含まれます。

| アウトカム | 概要 |
|------------|------|
| **歩行自立** | 回復期リハビリテーション退院時または6ヶ月後の歩行自立（FAC >= 4） |
| **FIM運動項目** | 退院時FIM運動項目合計スコア |
| **地域歩行** | 退院後の地域歩行能力（5MWT >= 0.8 m/s などを目安） |

含まれる主な文献ルールは、膝伸展筋力カットオフ、FBS/起居動作/認知機能による決定木、歩行自立スコア、平地歩行自立時期ノモグラム、FIM運動項目の重回帰式、BBS/TUG/FMAによる地域歩行予測、半側空間無視・認知障害関連ルール、非歩行者の歩行自立予測メタ解析などです。

---

## 対応ルールタイプ

| タイプ | 内容 |
|--------|------|
| `cutoff` | 単一または補助条件付きのカットオフ値 |
| `decision_tree` | ノード定義に基づく決定木 |
| `regression` | 切片と係数による重回帰式、閾値判定 |
| `scoring_system` | 項目別スコアの合計点による判定 |
| `nomogram` | ロジスティック回帰ベースの確率算出 |
| `composite_rule` | AND / OR / NOT の複合条件 |
| `custom_formula` | 四則演算・べき乗を使った任意の数式 |

---

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 19, TypeScript, Vite 7, Tailwind CSS 4 |
| UI | Radix UI, lucide-react, shadcn/ui系コンポーネント |
| 状態・API | TanStack Query, tRPC 11 |
| バックエンド | Express 4 |
| データベース | MySQL / TiDB Cloud互換 |
| ORM・マイグレーション | Drizzle ORM / drizzle-kit |
| テスト | Vitest |
| 静的デモ | `VITE_DEMO_MODE=true` + GitHub Pages |

---

## ローカル起動

### 前提条件

| ソフトウェア | 目安 |
|--------------|------|
| Node.js | 20以上 |
| pnpm | 10以上 |
| MySQL互換DB | ローカルMySQLまたはTiDB Cloudなど |

### 1. 依存関係のインストール

```bash
git clone https://github.com/machamu-24/rehab-prediction-tool.git
cd rehab-prediction-tool
pnpm install
```

### 2. `.env` を作成

```env
DATABASE_URL=mysql://root:password@localhost:3306/rehab_predict
JWT_SECRET=change-this-to-a-random-secret-string
NODE_ENV=development
PORT=3000

# Manus OAuthを使う場合のみ設定
VITE_APP_ID=
OAUTH_SERVER_URL=
VITE_OAUTH_PORTAL_URL=
OWNER_OPEN_ID=
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=
VITE_FRONTEND_FORGE_API_KEY=
```

`.env` はコミットしないでください。ローカル開発ではOAuth未設定でも、公開tRPC手続きとして主要機能を操作できます。

### 3. DB作成・マイグレーション

```sql
CREATE DATABASE rehab_predict CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
pnpm db:push
```

### 4. 初期データ投入

```bash
node scripts/seed.mjs
node scripts/seed_literature.mjs
node scripts/seed_gdrive_literature.mjs
```

### 5. 開発サーバー起動

```bash
pnpm dev
```

通常は `http://localhost:3000/` で起動します。3000番ポートが使用中の場合は、サーバーログに表示された別ポートを開いてください。

---

## 静的デモ版

静的デモ版はDB/APIサーバーなしで動作します。ビルド時に `client/src/demo/staticData.generated.ts` を生成し、tRPC呼び出しをブラウザ内の `demoLink` に差し替えます。

```bash
pnpm build:demo
pnpm exec vite preview --host 0.0.0.0
```

GitHub Pagesへのデプロイは `.github/workflows/deploy-demo-pages.yml` で管理しています。詳細は [DEMO_DEPLOY.md](./DEMO_DEPLOY.md) を参照してください。

---

## 開発コマンド

| コマンド | 内容 |
|----------|------|
| `pnpm dev` | 開発サーバー起動 |
| `pnpm build` | フロントエンドとサーバーの本番ビルド |
| `pnpm start` | 本番ビルド済みサーバー起動 |
| `pnpm test` | Vitest実行 |
| `pnpm check` | TypeScript型チェック |
| `pnpm db:push` | Drizzleマイグレーション生成・適用 |
| `pnpm generate:demo-data` | 静的デモ用データ生成 |
| `pnpm build:demo` | GitHub Pages向け静的デモビルド |

---

## プロジェクト構成

```text
rehab-prediction-tool/
├── .github/workflows/
│   └── deploy-demo-pages.yml       # GitHub Pagesデプロイ
├── client/
│   └── src/
│       ├── pages/
│       │   ├── PredictPage.tsx      # 文献照合
│       │   ├── HistoryPage.tsx      # 照合履歴
│       │   ├── RulesPage.tsx        # 文献ルール管理
│       │   └── OutcomesPage.tsx     # アウトカム管理
│       ├── demo/
│       │   ├── demoLink.ts          # 静的デモ用tRPCリンク
│       │   ├── demoStore.ts         # localStorage保存
│       │   └── staticData.generated.ts
│       └── components/
├── server/
│   ├── routers.ts                   # tRPCルーター
│   ├── db.ts                        # Drizzle DB操作
│   └── ruleEngine.ts                # 文献ルール評価エンジン
├── shared/
│   └── ruleEngine.ts                # デモ版から参照する共有エクスポート
├── drizzle/
│   ├── schema.ts                    # DBスキーマ・型定義
│   └── 000*.sql                     # マイグレーション
├── scripts/
│   ├── seed.mjs
│   ├── seed_literature.mjs
│   ├── seed_gdrive_literature.mjs
│   ├── generate-demo-data.mjs
│   └── prepare-demo-pages.mjs
├── DEMO_DEPLOY.md
├── ENV_SETUP.md
└── README.md
```

---

## 主な参考文献・ルールソース

| 文献 | ルール例 |
|------|----------|
| 松下達也ら（2022）理学療法科学 37(4): 275-280 | 麻痺側・両側合計膝伸展筋力カットオフ |
| 吉松竜貴ら（2018）理学療法科学 33(1): 145-150 | FBS、起居動作、認知機能による決定木 |
| 池上滉一ら（2025）理学療法科学 40(4): 181-187 | 年齢、BBS、FIM運動、FIM認知による歩行自立スコア |
| 池上滉一ら（2025）Jpn J Rehabil Med 62(11): 1139-1150 | 平地歩行自立時期予測ノモグラム |
| 石野晶大ら（2023）愛知県理学療法学会誌 第35巻 | ΔBBS、ΔFIM、CBAを用いた決定木 |
| 阿部専之ら（2026）J-STAGE早期公開 | 退院時FIM運動項目の重回帰式 |
| Louie DR, Eng JJ (2018) J Rehabil Med 50: 37-44 | BBSによる地域歩行・非補助歩行予測 |
| Lee GC et al. (2016) J Phys Ther Sci 28: 2184-2189 | TUG、BBS、FMA下肢による地域歩行予測 |
| 妹尾祐太, 井上優（2022）理学療法科学 | 退棟時歩行自立可否の決定木 |
| Kurosaki M, Tosaka M et al. (2022) | 重度片麻痺患者の機能回復予測 |
| Kimura Y, Yamada M et al. J Rehabil Med | 半側空間無視と認知障害の複合影響 |
| Preston E et al. (2021) Stroke 52: 1818-1828 | 非歩行者の歩行自立予測メタ解析 |

---

## ライセンス

MIT License

---

## 関連リポジトリ

- [stroke-walking-prediction](https://github.com/machamu-24/stroke-walking-prediction) - 本ツールの元になった歩行予測デモ
