import type { LiteratureRule, RuleDefinition } from "../drizzle/schema";
import { createHash } from "node:crypto";

export function prepareRuleEdit(
  existing: LiteratureRule | undefined,
  edit: Record<string, unknown>
): RuleDefinition {
  const definition = structuredClone(
    (edit.ruleDefinition ?? existing?.ruleDefinition) as RuleDefinition & {
      evidenceReview?: { status?: string };
      verification?: unknown;
    }
  );
  delete definition.verification;
  // Registration and edits need no separate review. Keep explicit exclusions.
  if (definition.evidenceReview?.status !== "blocked")
    delete definition.evidenceReview;
  return definition;
}

export function getEditToken(rule: LiteratureRule): string {
  const canonical = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, canonical(v)])
      );
    return value;
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(rule)))
    .digest("hex");
}
