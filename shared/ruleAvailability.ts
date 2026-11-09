import { z } from "zod";

/** Retain explicit reference-only exclusions from existing literature data. */
export function getRuleExclusionReason(definition: unknown): string | null {
  const review = (
    definition as {
      evidenceReview?: { status?: string; reason?: string };
    } | null
  )?.evidenceReview;
  return review?.status === "blocked"
    ? review.reason || "計算に必要な情報・モデル定義が不足しています"
    : null;
}

const referenceMetadataSchema = z.object({
  type: z.literal("nomogram"),
  inputTimepoint: z.string().optional(),
  variables: z.array(z.object({
    field: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
    fieldLabel: z.string().optional(),
  })).min(1).max(100),
});

/** Reference lookup never requires or fabricates coefficients for calculation. */
export function readNomogramReference(definition: unknown) {
  const def = definition as { type?: string; modelType?: string } | null;
  if (def?.type !== "nomogram") return null;
  const exclusion = getRuleExclusionReason(definition);
  if (!exclusion && (!def.modelType || def.modelType === "logistic")) return null;
  const parsed = referenceMetadataSchema.safeParse(definition);
  if (!parsed.success) return null;
  return {
    reason: exclusion ?? "このノモグラムの自動計算には対応していません。",
    variables: parsed.data.variables.map(variable =>
      parsed.data.inputTimepoint === "admission" && variable.field === "days_since_onset"
        ? { field: "days_onset_to_admission", fieldLabel: "発症から入院までの日数" }
        : variable
    ),
  };
}
