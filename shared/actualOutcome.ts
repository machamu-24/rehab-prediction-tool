import { z } from "zod";
import { assessmentSchema } from "./assessment";
export const OUTCOME_SCALES = {
  fac: "FAC（0～5）",
  fim_motor: "FIM運動（13～91）",
  fim_cognitive: "FIM認知（5～35）",
  fim_total: "FIM合計（18～126）",
  binary: "二値（0＝非達成、1＝達成）",
  other: "その他（尺度名を記録）",
} as const;
export const actualOutcomeSchema = z
  .object({
    value: z.union([
      z.string().trim().min(1).max(1000),
      z.number().finite(),
      z.boolean(),
    ]),
    label: z.string().trim().min(1).max(1000),
    scale: z.enum([
      "fac",
      "fim_motor",
      "fim_cognitive",
      "fim_total",
      "binary",
      "other",
    ]),
    scaleName: z.string().trim().max(200).optional(),
    measuredOn: assessmentSchema.shape.assessedOn.unwrap(),
    daysSinceOnset: z.number().int().min(0).max(100000),
    fac_at_discharge: z.number().int().min(0).max(5).optional(),
    fim_at_discharge: z.number().int().min(18).max(126).optional(),
    hospital_days: z.number().int().min(0).max(100000).optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.scale === "other") {
      if (!a.scaleName)
        ctx.addIssue({
          code: "custom",
          path: ["scaleName"],
          message: "その他の尺度名・単位を入力してください",
        });
      return;
    }
    const ranges = {
      fac: [0, 5],
      fim_motor: [13, 91],
      fim_cognitive: [5, 35],
      fim_total: [18, 126],
      binary: [0, 1],
    } as const;
    const [min, max] = ranges[a.scale];
    if (
      typeof a.value !== "number" ||
      !Number.isInteger(a.value) ||
      a.value < min ||
      a.value > max
    )
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `${OUTCOME_SCALES[a.scale]}の範囲の整数を入力してください`,
      });
  });
export type RecordedOutcome = z.infer<typeof actualOutcomeSchema>;
