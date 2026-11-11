import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SqliteStore } from "./sqliteStore";
import { importStrokeWalkingRules } from "../scripts/lib/import-stroke-walking-2026";

const seed = JSON.parse(fs.readFileSync(new URL("../release/literature.seed.json", import.meta.url), "utf8"));
let store: SqliteStore;
afterEach(() => { vi.restoreAllMocks(); store?.close(); });
const setup = () => {
  store = new SqliteStore(":memory:", seed);
  store.db.prepare("INSERT INTO predictions(patientInputs,outcomeId,caseId,notes) VALUES (?,?,?,?)").run("{}", 1, "IMPORT-TEST", "existing-history");
  return store.db.prepare("SELECT * FROM predictions").all();
};

describe("SQLiteへの歩行文献追加", () => {
  it("dry-runは追加せず、適用後は同じIDで再実行でき、既存文献・履歴を保持する", () => {
    const history = setup();
    const before = store.db.prepare("SELECT * FROM literature_rules ORDER BY id").all();
    // This test remains valid after these papers are included in the distribution.
    store.db.exec("DELETE FROM literature_rules WHERE sourceUrl IN ('https://doi.org/10.3138/ptc-2019-0090','https://doi.org/10.2340/jrm.v58.45663','https://doi.org/10.31662/jmaj.2024-0212','https://doi.org/10.11336/jjcrs.17.24')");
    const original = store.getAllRules();
    expect(importStrokeWalkingRules(store).added).toBe(0);
    expect(store.getAllRules()).toHaveLength(original.length);
    const applied = importStrokeWalkingRules(store, true);
    expect(applied.added).toBe(7);
    const repeat = importStrokeWalkingRules(store, true);
    expect(repeat.added).toBe(0);
    expect(repeat.models.map(model => model.id)).toEqual(applied.models.map(model => model.id));
    const originalIds = new Set(original.map(rule => rule.id));
    expect(store.db.prepare("SELECT * FROM literature_rules ORDER BY id").all().filter(row => originalIds.has(Number(row.id))))
      .toEqual(before.filter(row => originalIds.has(Number(row.id))));
    expect(store.db.prepare("SELECT * FROM predictions").all()).toEqual(history);
  });

  it("既存の同名ルールが編集されていれば上書きしない", () => {
    setup();
    importStrokeWalkingRules(store, true);
    const rule = store.getAllRules().find(row => row.sourceUrl?.includes("ptc-2019-0090"))!;
    store.updateRule(rule.id, { isActive: false });
    const before = store.db.prepare("SELECT * FROM literature_rules ORDER BY id").all();
    expect(() => importStrokeWalkingRules(store, true)).toThrow("既存定義が異なります");
    expect(store.db.prepare("SELECT * FROM literature_rules ORDER BY id").all()).toEqual(before);
  });

  it("同じDOIの別名登録を重複追加せず、途中失敗は全件ロールバックする", () => {
    setup();
    store.db.exec("DELETE FROM literature_rules WHERE sourceUrl IN ('https://doi.org/10.3138/ptc-2019-0090','https://doi.org/10.2340/jrm.v58.45663','https://doi.org/10.31662/jmaj.2024-0212','https://doi.org/10.11336/jjcrs.17.24')");
    const before = store.db.prepare("SELECT * FROM literature_rules ORDER BY id").all();
    const create = store.createRule.bind(store);
    let calls = 0;
    const spy = vi.spyOn(store, "createRule").mockImplementation(data => {
      if (++calls === 3) throw new Error("injected failure");
      return create(data);
    });
    expect(() => importStrokeWalkingRules(store, true)).toThrow("injected failure");
    expect(store.db.prepare("SELECT * FROM literature_rules ORDER BY id").all()).toEqual(before);
    spy.mockRestore();
    importStrokeWalkingRules(store, true);
    const rule = store.getAllRules().find(row => row.sourceUrl?.includes("ptc-2019-0090"))!;
    store.updateRule(rule.id, { name: "ユーザーが変更した文献名" });
    expect(() => importStrokeWalkingRules(store, true)).toThrow("別名の登録");
  });
});
