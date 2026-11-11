# リハビリ予後予測支援ツール（RehabPredict）

**静的デモ版:** [https://machamu-24.github.io/rehab-prediction-tool/](https://machamu-24.github.io/rehab-prediction-tool/)

**Windows・Mac用の通常版配布:** [GitHub Releases](https://github.com/machamu-24/rehab-prediction-tool/releases) ／ [初回設定・起動手順](docs/RELEASE_GUIDE.md)。Node.js・MySQLの個別導入は不要です。実行環境とSQLite、最新文献を同梱し、新規利用は照合履歴0件から開始します。

**v2.1.0:** 歩行関連4文献から7ルールを追加（同梱30ルール）。入院時FACT・TCT・非麻痺側SIASなどの入力に対応しました。[追加文献と登録内容](docs/STROKE_WALKING_2026_REVIEW.md)。

脳卒中リハビリテーション領域の予後予測研究で報告されたカットオフ値、決定木、スコアリング、回帰式などを登録し、患者情報と文献ルールを照合するWebアプリケーションです。  
現在の画面上では「予測」というより、入力条件に対して登録済み文献が何を支持するかを整理する「文献照合」ツールとして扱っています。

> 静的デモ版はGitHub Pages上で動作し、MySQL/Express/tRPC APIは使いません。追加・編集・履歴は閲覧者ごとのブラウザ `localStorage` に保存されます。実患者情報や個人情報は入力しないでください。

> 本ツールは研究・検証・説明用の予後支援ツールです。診断、治療方針、退院判断などを単独で決定する目的では使用しないでください。

---

## 現在の主な機能

| 機能 | 内容 |
|------|------|
| **文献照合** | 患者情報を入力し、選択したアウトカムに紐づく文献ルールを一括評価 |
| **照合サマリー** | 文献ごとの判定を「歩行自立を支持」「歩行自立困難を示唆」「参考結果」「判定対象外」に分類。判定対象外の文献と理由は折りたたんで表示 |
| **文献の要点表示** | 対象集団、使用評価項目、文献メモ、今回の入力で該当した理由をカード内に表示 |
| **追加評価の提案** | 未入力のため使えない文献ルールについて、追加すべき評価項目を提示 |
| **時期・条件による適用制御** | 発症後日数などの適用条件に合わないルールを「適用条件外」として分離 |
| **アウトカム管理** | 歩行自立、FIM運動項目、地域歩行などの予測対象を追加・編集・削除 |
| **文献ルール管理** | 8種類のルールタイプ、文献URL、エビデンスレベル、精度指標、適用条件、有効/無効を管理 |
| **ルール作成支援** | 8種類のルールをフォームで登録。決定木の分岐、スコア区分、カテゴリ変換、数式の挿入に対応。詳細JSON編集も利用可能 |
| **照合履歴** | 結果・実績・メモを保存し、入力値を分類別の表で確認。保存症例を選び、再照合・次回評価へ再利用 |
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

文献照合画面の「架空患者モデル」から、4症例 × 入院時・入棟3週間後・1ヶ月後の計12パターンを入力できます。設定値と使い方は [架空患者モデル一覧](./docs/PATIENT_MODELS.md) を参照してください。

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
| `logistic_regression` | ロジスティック回帰式による確率算出（確率のみ／明示した閾値による判定） |
| `nomogram` | 文献のノモグラムに対応したモデルで算出 |
| `composite_rule` | AND / OR / NOT の複合条件 |
| `custom_formula` | 四則演算・べき乗・自然対数 `ln()` による数式。数値予測／閾値判定 |

ロジスティック回帰は、フォームで切片・各変数の非標準化回帰係数・必要なカテゴリ変換・出力方法を設定します。確率の閾値や研究内割合は画面で％入力し、内部では0〜1の値を保持します。`outputMode: "probability"` は確率のみを表示し、`"binary"` は文献に基づく `probabilityThreshold` と判定メッセージを必須とします。確率だけの結果を0.5で自動分類することはありません。適用条件では病型などの「次のいずれかに一致」を複数選択でき、条件の行どうしはANDで照合します。

現在の文献は8タイプに対応したSQLiteへ初回起動時に取り込みます。旧MySQL版専用の `migrate-*.mjs`・`seed*.mjs` はSQLiteへ適用しません。旧データの移行はJSONバックアップから画面上で行えます。

---

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 19, TypeScript, Vite 7, Tailwind CSS 4 |
| UI | Radix UI, lucide-react, shadcn/ui系コンポーネント |
| 状態・API | TanStack Query, tRPC 11 |
| バックエンド | Express 4 |
| データベース | 内蔵SQLite（node:sqlite）。旧MySQLは移行用の読み出しのみ |
| デスクトップ・配布 | Electron 45 / electron-builder、Windows NSIS・Mac DMG |
| テスト | Vitest |
| 静的デモ | `VITE_DEMO_MODE=true` + GitHub Pages |

---

## ローカル起動（開発用ソース）

一般の利用者は [配布インストーラー](https://github.com/machamu-24/rehab-prediction-tool/releases/latest) を使用してください。以下は開発者向けです。

Node.js 24以上とpnpm 10を用意し、次を実行します。MySQLは不要です。

```sh
pnpm install --frozen-lockfile
pnpm local:start
```

SQLiteの初期化と文献の取り込みは自動です。`.env` は任意で、`PORT` と `REHAB_DATA_DIR` を設定できます。標準ポートは3020です。既存のMySQL接続設定ではなくSQLiteを使用します。

デスクトップ版のビルドは `pnpm desktop:dist`、型チェックとテストは `pnpm check`・`pnpm test` です。詳細は [配布手順](docs/RELEASE_GUIDE.md) を参照してください。


## 静的デモ版

静的デモ版はDB/APIサーバーなしで動作します。ビルド時に `scripts/demo-data.snapshot.json` から `client/src/demo/staticData.generated.ts` を生成し、tRPC呼び出しをブラウザ内の `demoLink` に差し替えます。

```bash
pnpm build:demo
pnpm exec vite preview --host 0.0.0.0
```

ローカルDBの文献ルールを静的デモへ反映する場合は、DB接続できる環境で以下を実行してスナップショットを更新します。

```bash
pnpm refresh:demo-data
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
| `pnpm desktop:dist` | 実行したOS用のデスクトップアプリ・インストーラー作成 |
| `pnpm local:backup` | SQLiteのJSONバックアップを作成 |
| `pnpm export:release-literature` | 利用中のSQLiteから配布用の最新文献だけを書き出す |
| `pnpm db:push` | 旧MySQL版用。現在のSQLiteには使わない |
| `pnpm export:demo-data` | ローカルDBから静的デモ用スナップショットを出力 |
| `pnpm generate:demo-data` | スナップショットから静的デモ用データ生成 |
| `pnpm refresh:demo-data` | ローカルDBからスナップショットと静的データを再生成 |
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
