import { PATIENT_FIELDS, type FieldDef } from "./patientFields";
import {
  assessmentSchema,
  ASSESSMENT_PHASES,
  type AssessmentPhase,
} from "@shared/assessment";
import { timeQuerySchema, type TimeQuery } from "@shared/literatureTimeline";
import { patientInputsSchema } from "@shared/patientValidation";
import { withCalculatedFimTotals } from "@shared/patientFimTotals";

export type ReuseMode = "repeat" | "followup";
export type SavedAssessment = {
  id: number;
  outcomeId: number;
  caseId?: string | null;
  assessedOn?: string | null;
  assessmentPhase?: string | null;
  timeContext?: TimeQuery | null;
  outcomeSnapshot?: { name?: string } | null;
  patientInputs: Record<string, unknown>;
};
export type ReuseContext = { record: SavedAssessment; mode: ReuseMode };
export type FormInputs = Record<string, string | number | boolean | undefined>;

const extras: FieldDef[] = [
  { key: "nihss", label: "NIHSS", type: "number", unit: "点" },
  {
    key: "motricity_index_lower",
    label: "Motricity Index 下肢",
    type: "number",
    unit: "点",
  },
  { key: "fbs_score", label: "FBS（旧項目）", type: "number", unit: "点" },
  {
    key: "fim_motor",
    label: "FIM 運動項目合計（旧項目）",
    type: "number",
    unit: "点",
  },
  {
    key: "fim_cognitive",
    label: "FIM 認知項目合計（旧項目）",
    type: "number",
    unit: "点",
  },
  {
    key: "days_post_stroke",
    label: "評価時点の発症後日数（旧項目）",
    type: "number",
    unit: "日",
  },
];
export const savedFieldDefinitions = new Map(
  [...PATIENT_FIELDS.flatMap(section => section.fields), ...extras].map(
    field => [field.key, field]
  )
);
export const savedFieldName = (field: string) =>
  savedFieldDefinitions.get(field)?.label ?? field;
export const savedDateLabel = (record: Pick<SavedAssessment, "assessedOn">) =>
  record.assessedOn || "評価日未記録";
export const savedPhaseLabel = (
  record: Pick<SavedAssessment, "assessmentPhase">
) =>
  ASSESSMENT_PHASES[record.assessmentPhase as AssessmentPhase] ??
  "評価時点未記録";

export function formatSavedValue(
  value: unknown,
  field?: FieldDef,
  depth = 0
): string {
  if (value === undefined || value === null) return "未記録";
  if (value === "") return "未入力";
  if (typeof value === "boolean")
    return value
      ? (field?.booleanLabels?.true ?? "該当")
      : (field?.booleanLabels?.false ?? "非該当");
  if (Array.isArray(value))
    return (
      value
        .map(item => formatSavedValue(item, undefined, depth + 1))
        .join("、") || "未記録"
    );
  if (typeof value === "object") {
    if (depth > 4) return "詳細データ";
    return Object.entries(value)
      .map(
        ([key, item]) =>
          `${savedFieldName(key)}：${formatSavedValue(item, savedFieldDefinitions.get(key), depth + 1)}`
      )
      .join(" ／ ");
  }
  return `${String(value)}${field?.unit ? ` ${field.unit}` : ""}`;
}

/** Show the stored values exactly, using rule snapshots for additional field labels. */
export function groupSavedInputs(
  inputs: Record<string, unknown>,
  definitions: unknown[] = []
) {
  const fields = new Map(savedFieldDefinitions);
  const visit = (value: unknown, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 32) return;
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, depth + 1));
      return;
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.field === "string" && !fields.has(obj.field))
      fields.set(obj.field, {
        key: obj.field,
        label:
          typeof obj.fieldLabel === "string" && obj.fieldLabel
            ? obj.fieldLabel
            : obj.field,
        type: "text",
        unit:
          typeof obj.unit === "string" && obj.unit !== "binary"
            ? obj.unit
            : undefined,
      });
    for (const [key, item] of Object.entries(obj))
      if (!["timeline", "evidenceReview"].includes(key)) visit(item, depth + 1);
  };
  definitions.forEach(definition => visit(definition));
  const seen = new Set<string>();
  const makeRow = (key: string) => {
    seen.add(key);
    const field = fields.get(key);
    return {
      key,
      label: field?.label ?? key,
      value: formatSavedValue(inputs[key], field),
    };
  };
  const groups = PATIENT_FIELDS.map(section => ({
    title: section.section,
    rows: section.fields
      .filter(field => Object.hasOwn(inputs, field.key))
      .map(field => makeRow(field.key)),
  })).filter(group => group.rows.length);
  const other = Object.keys(inputs)
    .filter(key => !seen.has(key))
    .map(makeRow);
  if (other.length) groups.push({ title: "その他の保存項目", rows: other });
  return groups;
}

/** Only historical baseline values and stable case attributes carry forward. */
const fixedFields = new Set([
  "sex",
  "stroke_type",
  "days_onset_to_admission",
  "first_stroke",
  "prestroke_adl_independent",
  "prestroke_mrs",
  "unilateral_hemispheric_stroke",
  "supratentorial_stroke",
  "koyama_day_a",
  "koyama_fim_total_a",
  "week3_fim_motor_total",
]);
export function prepareSavedAssessment(
  record: SavedAssessment,
  mode: ReuseMode,
  today: string
) {
  if (
    !record.patientInputs ||
    typeof record.patientInputs !== "object" ||
    Array.isArray(record.patientInputs)
  )
    throw new Error("保存された入力値の形式を読み込めません");
  const warnings: string[] = [];
  const omitted: string[] = [];
  const inputs: FormInputs = {};
  for (const [key, raw] of Object.entries(record.patientInputs)) {
    if (
      mode === "followup" &&
      !key.startsWith("admission_") &&
      !fixedFields.has(key)
    )
      continue;
    if (raw === null || raw === undefined || raw === "") continue;
    const field = savedFieldDefinitions.get(key);
    const value =
      field?.type === "number" &&
      typeof raw === "string" &&
      raw.trim() &&
      Number.isFinite(Number(raw))
        ? Number(raw)
        : raw;
    if (
      !["number", "string", "boolean"].includes(typeof value) ||
      !patientInputsSchema.safeParse({ [key]: value }).success
    ) {
      omitted.push(key);
      continue;
    }
    inputs[key] = value as string | number | boolean;
  }
  // This alias is also normalized when the form is submitted.
  if (
    mode === "repeat" &&
    inputs.days_since_onset === undefined &&
    inputs.days_post_stroke !== undefined
  )
    inputs.days_since_onset = inputs.days_post_stroke;
  const calculated = withCalculatedFimTotals(inputs);
  for (const field of ["admission_fim_total", "fim_total"]) {
    if (inputs[field] !== undefined && calculated[field] !== inputs[field])
      warnings.push(
        `${savedFieldName(field)}は保存値と内訳の合計が異なるため、内訳から再計算しました。`
      );
  }
  if (omitted.length)
    warnings.push(
      `現在の入力形式・範囲に合わない項目は空欄にしました：${omitted.map(savedFieldName).join("、")}`
    );
  const originalDate =
    record.assessedOn &&
    assessmentSchema.safeParse({ assessedOn: record.assessedOn }).success
      ? record.assessedOn
      : "";
  const originalPhase = Object.hasOwn(
    ASSESSMENT_PHASES,
    record.assessmentPhase ?? ""
  )
    ? (record.assessmentPhase as AssessmentPhase)
    : undefined;
  const savedTime = timeQuerySchema.safeParse(record.timeContext);
  if (mode === "repeat" && !originalDate)
    warnings.push(
      "保存時の評価日が未記録です。評価日を確認して入力してください。"
    );
  if (mode === "repeat" && !originalPhase)
    warnings.push("保存時の評価時点が未記録です。評価時点を確認してください。");
  if (mode === "repeat" && !savedTime.success)
    warnings.push(
      "保存時の時間軸が未記録・不正です。照合する時間軸を確認してください。"
    );
  return {
    inputs: calculated,
    caseId: record.caseId ?? "",
    assessedOn: mode === "followup" ? today : originalDate,
    assessmentPhase:
      mode === "followup"
        ? ("followup" as const)
        : (originalPhase ?? ("followup" as const)),
    timeContext:
      mode === "followup"
        ? ({
            kind: savedTime.success ? savedTime.data.kind : "future",
          } as TimeQuery)
        : savedTime.success
          ? savedTime.data
          : ({ kind: "future" } as TimeQuery),
    warnings,
  };
}

export function readReuseRequest(
  search: string
): { id: number; mode: ReuseMode } | null {
  const params = new URLSearchParams(search);
  const id = params.get("history");
  const mode = params.get("reuse");
  return id &&
    /^\d+$/.test(id) &&
    Number.isSafeInteger(Number(id)) &&
    Number(id) > 0 &&
    (mode === "repeat" || mode === "followup")
    ? { id: Number(id), mode }
    : null;
}

export function readReuseContext(value: unknown): ReuseContext | null {
  if (!value || typeof value !== "object") return null;
  const context = value as ReuseContext;
  if (
    !["repeat", "followup"].includes(context.mode) ||
    !Number.isSafeInteger(context.record?.id) ||
    context.record.id <= 0 ||
    !context.record.patientInputs ||
    typeof context.record.patientInputs !== "object" ||
    Array.isArray(context.record.patientInputs)
  )
    return null;
  if (
    !Number.isSafeInteger(context.record.outcomeId) ||
    context.record.outcomeId <= 0
  )
    return null;
  for (const key of ["caseId", "assessedOn", "assessmentPhase"] as const) {
    if (context.record[key] != null && typeof context.record[key] !== "string")
      return null;
  }
  return context;
}
