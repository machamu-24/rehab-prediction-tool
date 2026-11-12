// The study's unilateral impairment is broader than hemiparesis. The common
// field is a conservative eligibility proxy, not a claim that the scales match.
export const LEGACY_UNILATERAL_FIELD = "admission_unilateral_impairment";
export const COMMON_HEMIPARESIS_FIELD = "hemiparesis_present";
export const UNILATERAL_PROXY_NOTE = "原著の片側性障害は片麻痺より広い概念です。本アプリでは共通入力「今回の脳卒中に伴う片麻痺あり」を適合確認に使用し、片麻痺なしの患者はこの文献の照合対象に含めません。";

export function commonPatientInputField(field: string): string {
  return field === LEGACY_UNILATERAL_FIELD ? COMMON_HEMIPARESIS_FIELD : field;
}

/** A new explicit common input wins; old saved inputs remain readable as-is. */
export function withWalkingEligibilityInputs<T extends Record<string, unknown>>(inputs: T): T {
  return typeof inputs.hemiparesis_present === "boolean"
    ? { ...inputs, admission_unilateral_impairment: inputs.hemiparesis_present }
    : inputs;
}
