import legacyRules from "./louie2018Legacy.json";
import { DEMO_RULES } from "./staticData.generated";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  return value;
}
function signature(rule: Record<string, unknown>) {
  const { createdAt, updatedAt, ...definition } = rule;
  return JSON.stringify(canonical(definition));
}

// Upgrade only an untouched bundled record. Preserve user-authored rules and
// the surrounding state (including all saved predictions and result snapshots).
export function migrateLouie2018Rules<T extends { id: number }>(rules: T[]): T[] {
  return rules.map(rule => {
    const legacy = legacyRules.find(candidate => candidate.id === rule.id);
    const updated = DEMO_RULES.find(candidate => candidate.id === rule.id);
    if (!legacy || !updated || signature(rule) !== signature(legacy)) return rule;
    return { ...rule, ...structuredClone(updated) } as T;
  });
}
