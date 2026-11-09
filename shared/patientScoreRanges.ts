export type PatientScoreRange = Readonly<{ min: number; max: number }>;

const balance = { min: 0, max: 56 };
const mmse = { min: 0, max: 30 };
const cba = { min: 6, max: 30 };
const fimMotor = { min: 13, max: 91 };
const fimCognitive = { min: 5, max: 35 };
const careLevel = { min: 0, max: 5 };

const scoreRanges: Readonly<Record<string, PatientScoreRange>> = {
  bbs_score: balance,
  fbs_score: balance,
  admission_bbs_score: balance,
  admission_brs_upper: { min: 1, max: 6 },
  mmse_score: mmse,
  admission_mmse_score: mmse,
  cba_score: cba,
  admission_cba_score: cba,
  fim_motor_total: fimMotor,
  fim_motor: fimMotor,
  admission_fim_motor_total: fimMotor,
  week3_fim_motor_total: fimMotor,
  admission_fim_total: { min: 18, max: 126 },
  fim_cognitive_total: fimCognitive,
  fim_cognitive: fimCognitive,
  admission_fim_cognitive_total: fimCognitive,
  fim_total: { min: 18, max: 126 },
  koyama_fim_total_a: { min: 18, max: 126 },
  koyama_fim_total_b: { min: 18, max: 126 },
  care_level: careLevel,
  admission_care_level: careLevel,
  admission_fim_walk: { min: 1, max: 7 },
  admission_gcs: { min: 3, max: 15 },
  prestroke_mrs: { min: 0, max: 5 },
  fugl_meyer_lower: { min: 0, max: 34 },
  admission_fugl_meyer_lower: { min: 0, max: 34 },
  admission_fac: { min: 0, max: 5 },
};

export function getPatientScoreRange(
  field: string
): PatientScoreRange | undefined {
  return Object.hasOwn(scoreRanges, field) ? scoreRanges[field] : undefined;
}

export function classifyPatientScoreInput(
  value: string,
  range: PatientScoreRange
): "empty" | "valid" | "partial" | "invalid" {
  if (value === "") return "empty";
  if (!/^(0|[1-9]\d*)$/.test(value)) return "invalid";
  const number = Number(value);
  if (
    Number.isSafeInteger(number) &&
    number >= range.min &&
    number <= range.max
  )
    return "valid";
  // Allow the first digit of e.g. FIM motor 13, without saving it as score 1.
  if (number < range.min) {
    for (let candidate = range.min; candidate <= range.max; candidate++) {
      if (String(candidate).startsWith(value)) return "partial";
    }
  }
  return "invalid";
}

/** Older drafts may contain scores entered before input limits existed. */
export function omitInvalidPatientScores<T>(
  inputs: Record<string, T>
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(inputs).filter(([field, value]) => {
      const range = getPatientScoreRange(field);
      if (!range || value === "" || value === undefined) return true;
      return (
        (typeof value === "string" || typeof value === "number") &&
        classifyPatientScoreInput(String(value), range) === "valid"
      );
    })
  );
}
