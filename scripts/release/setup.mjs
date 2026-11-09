import mysql from "mysql2/promise";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createLocalTables } from "../lib/local-schema.mjs";
import {
  importLiteratureSeed,
  validateLiteratureSeed,
} from "../lib/literature-seed.mjs";
import { checkNodeVersion, dataDir, envFile, releaseRoot } from "./paths.mjs";

/** Only CREATE a new DB. No DROP, TRUNCATE, DELETE or upsert of existing records. */
export async function initializeReleaseDatabase(
  admin,
  database,
  seed,
  port = 3306
) {
  if (!/^rehab_local_[a-zA-Z0-9_]{1,40}$/.test(database))
    throw new Error(
      "DB名はrehab_local_で始め、半角英数字と_のみ使用してください"
    );
  validateLiteratureSeed(seed);
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
  await admin.query(`USE \`${database}\``);
  await admin.query("SET time_zone = '+00:00'");
  await createLocalTables(admin);
  const counts = await importLiteratureSeed(admin, seed);
  const username = `rehab_${randomBytes(6).toString("hex")}`;
  const password = randomBytes(32).toString("hex");
  // Values are generated hex strings, never supplied SQL. Escape identifiers separately.
  await admin.query("CREATE USER ?@'127.0.0.1' IDENTIFIED BY ?", [
    username,
    password,
  ]);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON \`${database}\`.* TO ?@'127.0.0.1'`,
    [username]
  );
  const uri = new URL(`mysql://127.0.0.1:${port}/${database}`);
  uri.username = username;
  uri.password = password;
  const app = await mysql.createConnection({
    uri: uri.toString(),
    dateStrings: true,
  });
  try {
    await app.query("SELECT 1");
  } finally {
    await app.end();
  }
  return { uri: uri.toString(), counts };
}

export async function main() {
  checkNodeVersion();
  process.chdir(releaseRoot);
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  try {
    await fs.access(envFile);
    console.log(
      "初期設定は完了済みです。Start RehabPredictから起動してください。既存データは変更していません。"
    );
    return;
  } catch {
    /* Fresh installation. */
  }
  const lockPath = path.join(dataDir, ".setup.lock");
  const lock = await fs.open(lockPath, "wx", 0o600);
  let rl;
  let connection;
  try {
    const seed = JSON.parse(
      await fs.readFile(
        path.join(releaseRoot, "release/literature.seed.json"),
        "utf8"
      )
    );
    validateLiteratureSeed(seed);
    console.log("RehabPredict 初回設定：新しいDBに文献のみを取り込みます。");
    console.log(`データ保存先: ${dataDir}`);
    console.log(
      "先にMySQL 8.0以上をインストールし、サービスを起動してください。"
    );
    let muted = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) process.stdout.write(chunk);
        callback();
      },
    });
    rl = createInterface({
      input: process.stdin,
      output,
      terminal: Boolean(process.stdin.isTTY),
    });
    const portText =
      (await rl.question("MySQLのポート [3306]: ")).trim() || "3306";
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("ポート番号が不正です");
    const user =
      (await rl.question("MySQL管理ユーザー [root]: ")).trim() || "root";
    process.stdout.write("MySQL管理パスワード（表示しません）: ");
    muted = true;
    const password = await rl.question("");
    muted = false;
    process.stdout.write("\n");
    const defaultDb = `rehab_local_${Date.now()}`;
    const database =
      (await rl.question(`新しく作るDB名 [${defaultDb}]: `)).trim() ||
      defaultDb;
    rl.close();
    rl = undefined;
    connection = await mysql.createConnection({
      host: "127.0.0.1",
      port,
      user,
      password,
      dateStrings: true,
      timezone: "Z",
      connectTimeout: 5000,
    });
    const result = await initializeReleaseDatabase(
      connection,
      database,
      seed,
      port
    );
    await fs.writeFile(
      envFile,
      `DATABASE_URL=${result.uri}\nJWT_SECRET=${randomBytes(32).toString("hex")}\nPORT=3020\n`,
      { mode: 0o600, flag: "wx" }
    );
    console.log(
      `設定完了：文献${result.counts.rules}件・アウトカム${result.counts.outcomes}件・照合履歴0件。`
    );
    console.log(
      "Start RehabPredictを開いてください。管理パスワードは保存していません。"
    );
  } finally {
    rl?.close();
    await connection?.end();
    await lock.close();
    await fs.unlink(lockPath);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch(error => {
    // mysql errors can contain SQL/credentials; show the code only.
    console.error(
      error.code
        ? `初期設定できませんでした（${error.code}）。MySQLの起動・ポート・管理ユーザー・権限を確認してください。既存DBは上書きしません。`
        : error.message
    );
    process.exitCode = 1;
  });
