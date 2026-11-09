import type { TimeQuery } from "@shared/literatureTimeline";
import { withCalculatedFimTotals } from "@shared/patientFimTotals";

type Inputs = Record<string, string | number | boolean | undefined>;

// Keep the user's entries separate from derived defaults so later source edits
// are reflected, while an explicit edit (including clearing a field) wins.
export function koyamaSharedInputs(inputs: Inputs, query: TimeQuery): Inputs {
  const result = withCalculatedFimTotals(inputs);
  const copy = (target: string, source: unknown, min: number, max: number) => {
    if (inputs[target] !== undefined || source === "" || source === undefined || typeof source === "boolean") return;
    const value = Number(source);
    if (Number.isSafeInteger(value) && value >= min && value <= max)
      result[target] = value;
  };
  copy("koyama_day_a", inputs.days_onset_to_admission, 1, 100000);
  copy("koyama_fim_total_a", result.admission_fim_total, 18, 126);
  if (query.kind === "future" && query.target?.unit === "day")
    copy("koyama_target_day", query.target.value, 1, 100000);
  return result;
}

export function koyamaSharedInputSource(field: string): string | undefined {
  const sources: Record<string, string> = {
    koyama_day_a: "「発症から入院までの日数」",
    koyama_fim_total_a: "「入院時 FIM総得点」",
    koyama_target_day: "上部の「予測したい時点」",
  };
  return sources[field];
}
