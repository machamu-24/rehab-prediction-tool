import type { SqliteStore } from "../../server/sqliteStore";
import type { InsertLiteratureRule, LiteratureRule } from "../../drizzle/schema";
import { validateRuleDefinition, applyConditionSchema } from "../../shared/ruleValidation";
import { fingerprint } from "./literature-review.mjs";
import { createStrokeWalkingRules, WALKING_SOURCE_DOIS } from "./stroke-walking-2026.mjs";

const sameRule = (actual: LiteratureRule, expected: InsertLiteratureRule) =>
  fingerprint(Object.fromEntries(Object.keys(expected).map(key => [key, actual[key as keyof LiteratureRule]]))) === fingerprint(expected);

/** Insert-only migration for the current SQLite app. Never reseed or overwrite. */
export function importStrokeWalkingRules(store: SqliteStore, apply = false) {
  return store.transaction(() => {
    const outcomes = store.getAllOutcomes().filter(outcome => outcome.name === "歩行自立");
    if (outcomes.length !== 1 || !outcomes[0].description?.includes("FAC")) throw new Error("登録先の歩行自立アウトカムを一意に確認できません。変更せず停止しました。");
    const expected = createStrokeWalkingRules(outcomes[0].id) as InsertLiteratureRule[];
    const all = store.getAllRules();
    const existing = all.filter(row => expected.some(rule => rule.name === row.name) || WALKING_SOURCE_DOIS.some((doi: string) => `${row.source} ${row.sourceUrl}`.includes(doi)));
    if (existing.some(row => !expected.some(rule => rule.name === row.name))) throw new Error("同文献に別名の登録があります。上書きせず停止しました。");
    // Preflight all models before any write; edits are never treated as defaults.
    for (const rule of expected) {
      const error = validateRuleDefinition(rule.ruleDefinition);
      if (error || !applyConditionSchema.array().safeParse(rule.applyConditions).success) throw new Error(error || "適用条件が不正です");
      const matches = existing.filter(row => row.name === rule.name);
      if (matches.length > 1 || (matches.length === 1 && !sameRule(matches[0], rule))) throw new Error(`既存定義が異なります。上書きせず停止しました: ${rule.name}`);
    }
    // Compare raw rows, including timestamps and JSON bytes, without exposing them.
    const raw = (table: "outcomes" | "literature_rules" | "predictions" | "prediction_results") => store.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    const before = { outcomes: raw("outcomes"), rules: raw("literature_rules"), predictions: raw("predictions"), results: raw("prediction_results") };
    const originalIds = new Set(all.map(rule => rule.id));
    const models = expected.map(rule => {
      const current = existing.find(row => row.name === rule.name);
      const id = current?.id ?? (apply ? store.createRule(rule) : null);
      if (apply && (!id || !sameRule(store.getRuleById(id)!, rule))) throw new Error(`読み戻し検証に失敗しました: ${rule.name}`);
      return { id, name: rule.name, status: current ? "already_registered" : "new", consensusEligible: rule.consensusEligible };
    });
    const after = raw("literature_rules");
    if (fingerprint(before.rules) !== fingerprint(after.filter(row => originalIds.has(Number(row.id)))) ||
        fingerprint(before.outcomes) !== fingerprint(raw("outcomes")) ||
        fingerprint(before.predictions) !== fingerprint(raw("predictions")) ||
        fingerprint(before.results) !== fingerprint(raw("prediction_results"))) throw new Error("既存ルール・アウトカム・履歴が変更されています。ロールバックします。");
    const added = apply ? models.filter(model => model.status === "new").length : 0;
    if (after.length !== all.length + added) throw new Error("追加件数が一致しません。");
    return { mode: apply ? "apply" : "dry-run", papers: 4, totalRules: after.length, added, models };
  });
}
