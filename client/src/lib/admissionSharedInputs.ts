import type { AssessmentPhase } from "@shared/assessment";
import type { TimeQuery } from "@shared/literatureTimeline";

type Inputs = Record<string, string | number | boolean | undefined>;

export function validAdmissionDay(value: unknown): number | undefined {
  if ((typeof value !== "number" && typeof value !== "string") || value === "") return;
  const day = Number(value);
  return Number.isSafeInteger(day) && day >= 0 && day <= 100000 ? day : undefined;
}

export function admissionMeasurementDay(query: TimeQuery): number | undefined {
  return query.evaluation?.unit === "day" ? validAdmissionDay(query.evaluation.value) : undefined;
}

/** Preserve saved differences: admission assessments may be measured days later. */
export function initiallyLinkAdmissionDays(inputs: Inputs, query: TimeQuery): boolean {
  const entered = inputs.days_onset_to_admission;
  return entered === undefined || (validAdmissionDay(entered) !== undefined && validAdmissionDay(entered) === admissionMeasurementDay(query));
}

export function admissionSharedInputs(inputs: Inputs, query: TimeQuery, phase: AssessmentPhase, linked: boolean): Inputs {
  const day = admissionMeasurementDay(query);
  return phase === "admission" && linked && day !== undefined
    ? { ...inputs, days_onset_to_admission: day }
    : inputs;
}

/** Freeze the admission value on leaving admission; later measurements cannot change it. */
export function switchAdmissionPhase(inputs: Inputs, query: TimeQuery, current: AssessmentPhase, next: AssessmentPhase, linked: boolean) {
  const result = { ...admissionSharedInputs(inputs, query, current, linked) };
  const admissionDay = validAdmissionDay(result.days_onset_to_admission);
  return {
    inputs: result,
    timeContext: next === "admission" && current !== "admission" && admissionDay !== undefined
      ? { ...query, evaluation: { value: admissionDay, unit: "day" as const, precision: "exact" as const } }
      : query,
    linked: next === "admission" && current !== "admission" ? true : linked,
  };
}
