import { koyamaTimeQuery } from "@shared/koyama";
import type { TimeQuery } from "@shared/literatureTimeline";
import { getRuleExclusionReason } from "@shared/ruleAvailability";

type Rule = {
  isActive: boolean;
  ruleDefinition: unknown;
};

export function hasKoyamaTimeAxis(rules: readonly Rule[] | undefined): boolean {
  return rules?.some(rule => usesKoyamaTimeAxis([rule])) ?? false;
}

export function usesKoyamaTimeAxis(rules: readonly Rule[] | undefined): boolean {
  const active = rules?.filter(
    rule => rule.isActive && !getRuleExclusionReason(rule.ruleDefinition)
  ) ?? [];
  return active.length > 0 && active.every(rule => {
    const def = rule.ruleDefinition as { type?: string; modelType?: string } | null;
    return def?.type === "custom_formula" && def.modelType === "koyama_fim_total";
  });
}

export function predictionTimeContext(
  rules: readonly Rule[] | undefined,
  inputs: Record<string, unknown>,
  manual: TimeQuery
): TimeQuery {
  return usesKoyamaTimeAxis(rules) ? koyamaTimeQuery(inputs) : manual;
}
