const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

exports.runDesktopSelfTest = async ({
  app,
  window,
  base,
  token,
  resources,
}) => {
  const call = async (procedure, input, mutation = false) => {
    const response = await fetch(
      `${base}/api/trpc/${procedure}${mutation ? "" : `?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}`}`,
      {
        method: mutation ? "POST" : "GET",
        headers: {
          "X-Rehab-Token": token,
          ...(mutation ? { "Content-Type": "application/json" } : {}),
        },
        ...(mutation ? { body: JSON.stringify({ json: input }) } : {}),
      }
    );
    const body = await response.json();
    assert.equal(
      response.status,
      200,
      `API ${procedure} failed: ${JSON.stringify(body)}`
    );
    return body.result.data.json;
  };
  const phase = process.env.REHAB_SELF_TEST_PHASE || "fresh";
  const manifest = JSON.parse(
    fs.readFileSync(path.join(resources, "release-manifest.json"), "utf8")
  );
  const status = await call("local.status");
  assert.equal(status.storage, "sqlite");
  assert.equal(status.database, "connected");
  assert.equal(status.schemaReady, true);
  assert.equal((await fetch(`${base}/api/local/health`)).status, 403);
  assert.equal(
    (
      await fetch(`${base}/api/local/health`, {
        headers: { "X-Rehab-Token": token, Origin: "https://invalid.example" },
      })
    ).status,
    403
  );
  const preferences = window.webContents.getLastWebPreferences();
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  assert.equal(new URL(window.webContents.getURL()).origin, base);
  const outcomes = await call("outcomes.list");
  const rules = await call("rules.list", {});
  assert.equal(outcomes.length, manifest.counts.outcomes);
  assert.equal(rules.length, manifest.counts.literatureRules);
  if (phase === "fresh") {
    assert.deepEqual(await call("history.list", { limit: 20, offset: 0 }), []);
    const original = rules.find(
      rule =>
        rule.ruleType === "cutoff" &&
        rule.isActive &&
        rule.ruleDefinition.timeline
    );
    assert.ok(original);
    await call(
      "rules.create",
      {
        ...original,
        name: "TEST_DESKTOP_RULE",
        source: "架空の自動検証用",
        sourceUrl: "",
      },
      true
    );
    let added = (await call("rules.list", {})).find(
      rule => rule.name === "TEST_DESKTOP_RULE"
    );
    assert.ok(added);
    const tokenBefore = added.editToken;
    await call(
      "rules.update",
      {
        id: added.id,
        editToken: tokenBefore,
        data: { name: "TEST_DESKTOP_RULE_UPDATED" },
      },
      true
    );
    const stale = await fetch(`${base}/api/trpc/rules.update`, {
      method: "POST",
      headers: { "X-Rehab-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        json: { id: added.id, editToken: tokenBefore, data: { name: "STALE" } },
      }),
    });
    assert.equal(stale.status, 409);
    const input = {
      outcomeId: original.outcomeId,
      patientInputs: {
        bbs_score: 25,
        admission_fim_motor_total: 40,
        admission_fim_cognitive_total: 20,
        knee_ext_paretic_nm_kg: 0.7,
      },
      caseId: "TEST-DESKTOP-001",
      assessedOn: "2026-11-10",
      assessmentPhase: "followup",
      timeContext: { kind: "future" },
    };
    const preview = await call("predict.preview", input, true);
    assert.ok(Array.isArray(preview.results));
    assert.deepEqual(await call("history.list", { limit: 20, offset: 0 }), []);
    const saved = await call("predict.run", input, true);
    assert.ok(saved.predictionId > 0);
    const snapshot = await call("history.get", { id: saved.predictionId });
    assert.equal(snapshot.prediction.patientInputs.bbs_score, 25);
    assert.ok(snapshot.results.some(result => result.ruleId === added.id));
    await call("rules.delete", { id: added.id }, true);
    const after = await call("history.get", { id: saved.predictionId });
    assert.deepEqual(after.results, snapshot.results);
    await call(
      "history.updateOutcome",
      {
        id: saved.predictionId,
        actualOutcome: {
          value: 4,
          label: "FAC4",
          scale: "fac",
          measuredOn: "2026-11-10",
          daysSinceOnset: 60,
        },
        notes: "自動検証用の架空記録",
      },
      true
    );
    const backup = await call("local.createBackup", undefined, true);
    assert.equal(backup.counts.predictions, 1);
    const verified = await call(
      "local.verifyBackup",
      { name: backup.name },
      true
    );
    assert.equal(verified.counts.predictions, 1);
    const download = await call("local.downloadBackup", { name: backup.name });
    const payload = JSON.parse(download.content);
    assert.equal(payload.payload.tables.predictions.length, 1);
    const inspect = await call(
      "local.inspectBackup",
      { content: download.content },
      true
    );
    assert.equal(inspect.legacyTimeZone, false);
    const restored = await call(
      "local.restoreBackup",
      { name: backup.name, confirmed: true },
      true
    );
    assert.equal(restored.counts.predictions, 1);
    const newStatus = await call("local.status");
    assert.notEqual(newStatus.databaseFile, status.databaseFile);
    assert.ok(fs.existsSync(status.databaseFile));
  }
  const history = await call("history.list", {
    limit: 20,
    offset: 0,
    caseId: "TEST-DESKTOP-001",
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].actualOutcome.value, 4);
  const csv = await call("history.exportCsv", {});
  assert.ok(
    typeof csv.csv === "string" && csv.csv.includes("TEST-DESKTOP-001")
  );
  return {
    ok: true,
    phase,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    sqlite: process.versions.sqlite,
    version: app.getVersion(),
    sourceCommit: manifest.sourceCommit,
    literatureChecksum: manifest.literatureChecksum,
    initialHistoryCount: phase === "fresh" ? 0 : null,
    packaged: app.isPackaged,
    counts: {
      outcomes: outcomes.length,
      rules: rules.length,
      histories: history.length,
    },
    storage: "sqlite",
    runtimeBundled: true,
    tokenRequired: true,
    rendererIsolated: true,
    backupRestored: true,
  };
};
