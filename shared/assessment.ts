import { z } from "zod";

export const ENGINE_VERSION = "local-2026.11.12-v1";
export const ASSESSMENT_PHASES = {
  admission: "入院時",
  week3: "入棟3週間後",
  month1: "入棟1ヶ月後",
  followup: "経過評価",
  discharge: "退院時",
} as const;
export type AssessmentPhase = keyof typeof ASSESSMENT_PHASES;

const CHANGE_FIELDS: ReadonlySet<string> = new Set([
  "delta_bbs",
  "delta_fim_motor",
  "delta_fim_cognitive",
]);

export function getAssessmentFieldPhase(field: string): "week3" | "month1" | undefined {
  if (field === "week3_fim_motor_total") return "week3";
  if (CHANGE_FIELDS.has(field)) return "month1";
}

export function isAssessmentFieldAvailable(field: string, phase: AssessmentPhase) {
  if (field === "week3_fim_motor_total") return phase !== "admission";
  return !CHANGE_FIELDS.has(field) || (phase !== "admission" && phase !== "week3");
}

export function getInputsForAssessmentPhase<T>(inputs: Record<string, T>, phase: AssessmentPhase): Record<string, T> {
  return Object.fromEntries(
    Object.entries(inputs).filter(([field]) => isAssessmentFieldAvailable(field, phase))
  );
}

export const assessmentSchema = z.object({
  caseId: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/, "症例IDは半角英数字・ハイフン・アンダースコアで入力してください").optional(),
  assessedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "有効な評価日を指定してください").optional(),
  assessmentPhase: z.enum(["admission", "week3", "month1", "followup", "discharge"]).optional(),
});
