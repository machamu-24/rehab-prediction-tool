# 静的デモ版のデプロイ手順

このデモ版は、既存の文献ルールをビルド時にJSONとして同梱し、ブラウザ内で予測エンジンを動かします。
MySQL、Express、tRPC APIサーバーは使いません。

## デモ版でできること

- 既存文献ルールでの文献照合
- アウトカム・文献ルールの追加、編集、削除
- 照合履歴の保存
- CSV出力

追加・編集・履歴はサーバーには保存されず、閲覧者ごとのブラウザ `localStorage` に保存されます。
実患者情報や個人情報は入力しないでください。

## ローカルで静的デモを確認

```bash
pnpm build:demo
pnpm exec vite preview --host 0.0.0.0
```

## GitHub Pages

このリポジトリには `.github/workflows/deploy-demo-pages.yml` を追加済みです。

1. GitHubのリポジトリ設定で `Settings > Pages` を開く
2. `Build and deployment > Source` を `GitHub Actions` にする
3. `main` ブランチへpushする、またはActions画面から `Deploy static demo to GitHub Pages` を手動実行する

公開URLは通常 `https://<owner>.github.io/<repository>/` です。

## Cloudflare Pages

Cloudflare PagesでGitHubリポジトリを接続し、以下を設定します。

```text
Build command: pnpm build:demo
Build output directory: dist/public
Environment variables:
  VITE_DEMO_MODE=true
  VITE_BASE_PATH=/
```

Cloudflare Pagesは通常ルート配信なので、`VITE_BASE_PATH=/` のままで問題ありません。
