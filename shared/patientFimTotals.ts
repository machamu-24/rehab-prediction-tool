import { classifyPatientScoreInput, getPatientScoreRange } from "./patientScoreRanges";

export type FimFormInputs = Record<string, string | number | boolean | undefined>;

const components: Record<string, readonly [string, string]> = {
  admission_fim_total: ["admission_fim_motor_total", "admission_fim_cognitive_total"],
  fim_total: ["fim_motor_total", "fim_cognitive_total"],
};

/** Only add valid motor and cognitive scores from the same assessment. */
export function getFimTotalCalculation(inputs: FimFormInputs, field: string) {
  const pair = Object.hasOwn(components, field) ? components[field] : undefined;
  if (!pair) return undefined;
  const scores = pair.map(key => {
    const value = inputs[key];
    const range = getPatientScoreRange(key)!;
    return (typeof value === "string" || typeof value === "number") &&
      classifyPatientScoreInput(String(value), range) === "valid"
      ? Number(value) : undefined;
  });
  const [motor, cognitive] = scores;
  return motor === undefined || cognitive === undefined
    ? undefined : { motor, cognitive, total: motor + cognitive };
}

export function withCalculatedFimTotals(inputs: FimFormInputs): FimFormInputs {
  const result = { ...inputs };
  for (const field of Object.keys(components)) {
    const calculation = getFimTotalCalculation(inputs, field);
    if (calculation) result[field] = calculation.total;
  }
  return result;
}
