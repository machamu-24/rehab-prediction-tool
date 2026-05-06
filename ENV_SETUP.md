# 環境変数設定ガイド

ローカル環境での起動に必要な環境変数の設定方法を説明します。

## 設定ファイルの作成

プロジェクトルートに `.env` ファイルを作成し、以下の内容を記述してください。

```env
# データベース接続文字列（必須）
# ローカルMySQLの場合
DATABASE_URL=mysql://root:password@localhost:3306/rehab_predict

# セッションCookieの署名用シークレット（必須）
# 任意の長い文字列を設定してください
JWT_SECRET=change-this-to-a-random-secret-string
```

## 必須項目

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `DATABASE_URL` | MySQL接続文字列 | `mysql://root:pass@localhost:3306/rehab_predict` |
| `JWT_SECRET` | セッション署名用シークレット | `my-secret-key-12345` |

## データベースのセットアップ

### ローカルMySQLを使用する場合

1. MySQLをインストールして起動する
2. データベースを作成する

```sql
CREATE DATABASE rehab_predict CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. `.env` の `DATABASE_URL` を設定する

```env
DATABASE_URL=mysql://root:your_password@localhost:3306/rehab_predict
```

4. マイグレーションを実行する

```bash
pnpm db:push
```

5. 初期データを投入する（任意）

```bash
node scripts/seed.mjs
```

### TiDB Cloud（無料枠）を使用する場合

クラウドMySQLを使用する場合は、TiDB Cloudの無料枠が利用できます。

1. [TiDB Cloud](https://tidbcloud.com/) でアカウントを作成
2. Serverlessクラスターを作成
3. 接続文字列を取得して `.env` に設定

```env
DATABASE_URL=mysql://user:pass@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/rehab_predict?ssl=true
```

## Manus Webアプリとして動作させる場合

Manus Webアプリとして公開する場合は、追加の環境変数が必要です。  
これらはManusプラットフォームが自動的に注入するため、通常は手動設定不要です。

| 変数名 | 説明 |
|--------|------|
| `VITE_APP_ID` | Manus OAuthアプリケーションID |
| `OAUTH_SERVER_URL` | Manus OAuthバックエンドURL |
| `VITE_OAUTH_PORTAL_URL` | ManusログインポータルURL |
| `OWNER_OPEN_ID` | オーナーのOpenID |
| `OWNER_NAME` | オーナー名 |
