import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { createHash, randomBytes } from "node:crypto";

const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const source = path.resolve(`dist/release/RehabPredict-v${pkg.version}`);
const temp = await fs.mkdtemp(
  path.join(os.tmpdir(), "RehabPredict release test ")
);
const app = path.join(temp, "app with spaces");
const dataDir = path.join(temp, "data with spaces");
await fs.cp(source, app, { recursive: true });
await fs.mkdir(dataDir);
const withMysql = process.argv.includes("--mysql");
const database = `rehab_local_release_test_${randomBytes(6).toString("hex")}`;
let admin;
let appConnection;
let account;
let child;
let logs = "";
const port = 35000 + Math.floor(Math.random() * 15000);
let uri = "mysql://unused:unused@127.0.0.1:1/unavailable";
const request = async (procedure, input, mutation = false) => {
  const response = await fetch(
    `http://127.0.0.1:${port}/api/trpc/${procedure}${mutation ? "" : `?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}`}`,
    mutation
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: input }),
        }
      : {}
  );
  const body = await response.json();
  assert.equal(response.status, 200, `API ${procedure} failed`);
  return body.result.data.json;
};
try {
  const seed = JSON.parse(
    await fs.readFile(path.join(app, "release/literature.seed.json"), "utf8")
  );
  const manifest = JSON.parse(
    await fs.readFile(path.join(app, "release-manifest.json"), "utf8")
  );
  assert.equal(manifest.counts.predictions, 0);
  assert.equal(manifest.counts.predictionResults, 0);
  assert.equal(
    seed.checksum,
    createHash("sha256").update(JSON.stringify(seed.payload)).digest("hex")
  );
  assert.deepEqual(Object.keys(seed.payload.tables).sort(), [
    "literature_rules",
    "outcomes",
  ]);
  for (const name of [
    "Start RehabPredict.command",
    "Setup RehabPredict.command",
    "Start RehabPredict.cmd",
    "Setup RehabPredict.cmd",
    "THIRD_PARTY_LICENSES.txt",
  ])
    assert.ok((await fs.stat(path.join(app, name))).size > 0);
  const { initializeReleaseDatabase } = await import(
    pathToFileURL(path.join(app, "scripts/release/setup.mjs")).href
  );
  if (withMysql) {
    const adminUri =
      process.env.REHAB_RELEASE_TEST_MYSQL ||
      dotenv.parse(await fs.readFile(".env", "utf8")).DATABASE_URL;
    const parsed = new URL(adminUri);
    parsed.pathname = "/";
    admin = await mysql.createConnection({
      uri: parsed.toString(),
      dateStrings: true,
      timezone: "Z",
    });
    const adminQuery = admin.query.bind(admin);
    admin.query = async (...args) => {
      const result = await adminQuery(...args);
      if (String(args[0]).startsWith("CREATE USER")) account = args[1][0];
      return result;
    };
    const result = await initializeReleaseDatabase(
      admin,
      database,
      seed,
      Number(parsed.port || 3306)
    );
    uri = result.uri;
    account = decodeURIComponent(new URL(uri).username);
    assert.deepEqual(result.counts, {
      outcomes: seed.payload.tables.outcomes.length,
      rules: seed.payload.tables.literature_rules.length,
      predictions: 0,
      predictionResults: 0,
    });
    await assert.rejects(
      initializeReleaseDatabase(admin, database, seed),
      error => error.code === "ER_DB_CREATE_EXISTS"
    );
    appConnection = await mysql.createConnection({ uri, dateStrings: true });
  }
  await fs.writeFile(
    path.join(dataDir, ".env"),
    `DATABASE_URL=${uri}\nPORT=${port}\n`
  );
  const launch = () => {
    child = spawn(
      process.execPath,
      [path.join(app, "scripts/release/start.mjs")],
      {
        cwd: app,
        env: { ...process.env, REHAB_DATA_DIR: dataDir, REHAB_NO_OPEN: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    child.stdout.on("data", chunk => {
      logs += chunk;
    });
    child.stderr.on("data", chunk => {
      logs += chunk;
    });
  };
  const ready = async () => {
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null)
        throw new Error(`配布版が終了しました: ${logs}`);
      try {
        const response = await fetch(
          `http://127.0.0.1:${port}/api/local/health`
        );
        const health = await response.json();
        if (health.app === "rehab-prediction-tool") return health;
      } catch {
        /* Wait briefly for the process, not a human approval. */
      }
      await setTimeout(100);
    }
    throw new Error(`配布版が起動しません: ${logs}`);
  };
  const stop = async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once("exit", resolve));
      if (process.platform === "win32")
        execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      else child.kill("SIGTERM");
      await exited;
    }
    child = undefined;
  };
  launch();
  const health = await ready();
  assert.equal(health.database, withMysql ? "connected" : "unavailable");
  if (withMysql) assert.equal(health.schemaReady, true);
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert.ok(html.includes('<div id="root">'));
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(`http://127.0.0.1:${port}${asset}`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/history`)).status, 200);
  if (withMysql) {
    const outcomes = await request("outcomes.list");
    assert.equal(outcomes.length, manifest.counts.outcomes);
    const rules = await request("rules.list", {});
    assert.equal(rules.length, manifest.counts.literatureRules);
    assert.deepEqual(
      await request("history.list", { limit: 20, offset: 0 }),
      []
    );
    const input = {
      outcomeId: outcomes[0].id,
      patientInputs: {
        bbs_score: 25,
        admission_fim_motor_total: 40,
        admission_fim_cognitive_total: 20,
      },
      caseId: "TEST-RELEASE-001",
      assessedOn: "2026-11-09",
      assessmentPhase: "followup",
      timeContext: { kind: "future" },
    };
    const preview = await request("predict.preview", input, true);
    assert.ok(Array.isArray(preview.results));
    assert.deepEqual(
      await request("history.list", { limit: 20, offset: 0 }),
      []
    );
    const saved = await request("predict.run", input, true);
    assert.ok(Number.isInteger(saved.predictionId));
    const history = await request("history.list", { limit: 20, offset: 0 });
    assert.equal(history.length, 1);
    assert.equal(history[0].caseId, input.caseId);
    const detail = await request("history.get", { id: saved.predictionId });
    assert.equal(detail.prediction.patientInputs.bbs_score, 25);
    const backup = await request("local.createBackup", undefined, true);
    assert.equal(backup.counts.predictions, 1);
    assert.ok(
      (await fs.stat(path.join(dataDir, "backups", backup.name))).size > 0
    );
    await stop();
    launch();
    await ready();
    assert.equal(
      (await request("history.list", { limit: 20, offset: 0 })).length,
      1
    );
    console.log(
      "MySQL検証: 文献全列一致・初期履歴0・既存DB拒否・照合/履歴保存/詳細/バックアップ/再起動後保持を確認"
    );
  }
  await stop();
  console.log(
    `配布版検証成功: ${process.platform}/${process.arch} / リポジトリ外・空白を含むパス / node_modulesなし`
  );
} finally {
  if (child && child.exitCode === null) {
    if (process.platform === "win32")
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    else child.kill("SIGTERM");
  }
  await appConnection?.end();
  if (admin) {
    // Only the unique disposable database and account created by this test are removed.
    if (account) await admin.query("DROP USER ?@'127.0.0.1'", [account]);
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
  }
  await fs.rm(temp, { recursive: true, force: true });
}
