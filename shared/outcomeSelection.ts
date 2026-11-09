type OutcomeChoice = { id: number; name: string };

export const FIM_MOTOR_OUTCOME_NAME = "FIM運動項目";
export const LEGACY_FUKUDA_OUTCOME_NAME = "発症90日後の運動FIM >61点";
const hiddenPredictionOutcomes = new Set([
  LEGACY_FUKUDA_OUTCOME_NAME,
  "退院時の運動FIM >61点",
  "退院時FIS身体自立度 ≥5",
]);

/** Keep source records available to literature management and historical records. */
export function getPredictionOutcomes<T extends OutcomeChoice>(outcomes: T[]): T[] {
  return outcomes.filter(outcome => !hiddenPredictionOutcomes.has(outcome.name));
}

export function resolvePredictionOutcomeId(id: number | null, outcomes: OutcomeChoice[]): number | null {
  if (id === null) return null;
  const outcome = outcomes.find(item => item.id === id);
  if (outcome?.name === LEGACY_FUKUDA_OUTCOME_NAME)
    return outcomes.find(item => item.name === FIM_MOTOR_OUTCOME_NAME)?.id ?? null;
  return outcome && !hiddenPredictionOutcomes.has(outcome.name) ? id : null;
}
