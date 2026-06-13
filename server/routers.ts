import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getAllOutcomes,
  getOutcomeById,
  createOutcome,
  updateOutcome,
  deleteOutcome,
  getAllRules,
  getRuleById,
  createRule,
  updateRule,
  deleteRule,
  createPrediction,
  getAllPredictions,
  getPredictionById,
  updatePredictionOutcome,
  createPredictionResults,
  getPredictionResultsByPredictionId,
} from "./db";
import { runEngine, extractRequiredFieldsFromDef } from "./ruleEngine";
import type { PatientInputs, ActualOutcome } from "../drizzle/schema";

// ---- Zod スキーマ ----

const applyConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["<=", ">=", "<", ">", "==", "!=", "equals", "boolean", "boolean_negative"]),
  value: z.union([z.number(), z.string(), z.boolean()]),
  label: z.string().optional(),
}).transform((condition) => ({
  ...condition,
  operator: condition.operator === "equals" ? "==" : condition.operator,
}));

const ruleDefinitionSchema = z.any(); // 複雑な型のためanyで受け取りDB保存

const outcomeSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  unit: z.string().optional(),
  positiveLabel: z.string().default("自立"),
  negativeLabel: z.string().default("非自立"),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const ruleSchema = z.object({
  outcomeId: z.number().int(),
  name: z.string().min(1).max(256),
  ruleType: z.enum([
    "cutoff",
    "decision_tree",
    "regression",
    "scoring_system",
    "nomogram",
    "composite_rule",
    "custom_formula",
  ]),
  source: z.string().min(1).max(512),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  evidenceLevel: z.enum([
    "Systematic Review",
    "RCT",
    "Cohort Study",
    "Case-Control",
    "Expert Classification",
    "Other",
  ]),
  applyConditions: z.array(applyConditionSchema).default([]),
  ruleDefinition: ruleDefinitionSchema,
  accuracy: z.number().min(0).max(100).optional().nullable(),
  sensitivity: z.number().min(0).max(100).optional().nullable(),
  specificity: z.number().min(0).max(100).optional().nullable(),
  auc: z.number().min(0).max(1).optional().nullable(),
  consensusEligible: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const patientInputsSchema = z.object({
  age: z.number().optional(),
  sex: z.enum(["男性", "女性"]).optional(),
  days_since_onset: z.number().optional(),
  stroke_type: z.string().optional(),
  nihss: z.number().optional(),
  tct_score: z.number().optional(),
  bbs_score: z.number().optional(),
  motricity_index_lower: z.number().optional(),
  walk_speed_10m: z.number().optional(),
  sitting_balance_30s: z.boolean().optional(),
  spatial_neglect: z.boolean().optional(),
  mmse_score: z.number().optional(),
  caregiver_available: z.boolean().optional(),
  diabetes: z.boolean().optional(),
  fim_motor: z.number().optional(),
  fim_cognitive: z.number().optional(),
  fim_total: z.number().optional(),
  fugl_meyer_lower: z.number().optional(),
  moca_score: z.number().optional(),
  trunk_control: z.number().optional(),
}).passthrough();

// ============================================================
// ルーター定義
// ============================================================

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ---- アウトカム管理 ----
  outcomes: router({
    list: publicProcedure.query(async () => {
      return getAllOutcomes();
    }),

    get: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        return getOutcomeById(input.id);
      }),

    create: publicProcedure
      .input(outcomeSchema)
      .mutation(async ({ input }) => {
        await createOutcome(input);
        return { success: true };
      }),

    update: publicProcedure
      .input(z.object({ id: z.number().int(), data: outcomeSchema.partial() }))
      .mutation(async ({ input }) => {
        await updateOutcome(input.id, input.data);
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteOutcome(input.id);
        return { success: true };
      }),
  }),

  // ---- 文献ルール管理 ----
  rules: router({
    list: publicProcedure
      .input(z.object({ outcomeId: z.number().int().optional() }))
      .query(async ({ input }) => {
        const rules = await getAllRules(input.outcomeId);
        // 各ルールの必要フィールドを抽出して返却
        return rules.map((r) => ({
          ...r,
          requiredFields: Array.from(new Set(extractRequiredFieldsFromDef(r.ruleDefinition))),
          applyConditionFields: Array.isArray(r.applyConditions)
            ? (r.applyConditions as Array<{ field: string; label?: string }>)
                .filter((c, i, arr) => arr.findIndex((x) => x.field === c.field) === i)
                .map((c) => ({
                  field: c.field,
                  label: c.label ?? c.field,
                }))
            : [],
        }));
      }),

    get: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        return getRuleById(input.id);
      }),

    create: publicProcedure
      .input(ruleSchema)
      .mutation(async ({ input }) => {
        await createRule({
          ...input,
          sourceUrl: input.sourceUrl || null,
          accuracy: input.accuracy ?? null,
          sensitivity: input.sensitivity ?? null,
          specificity: input.specificity ?? null,
          auc: input.auc ?? null,
        });
        return { success: true };
      }),

    update: publicProcedure
      .input(z.object({ id: z.number().int(), data: ruleSchema.partial() }))
      .mutation(async ({ input }) => {
        const data = { ...input.data };
        if ("sourceUrl" in data && !data.sourceUrl) {
          (data as Record<string, unknown>).sourceUrl = null;
        }
        await updateRule(input.id, data);
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteRule(input.id);
        return { success: true };
      }),
  }),

  // ---- 予測実行 ----
  predict: router({
    run: publicProcedure
      .input(
        z.object({
          outcomeId: z.number().int(),
          patientInputs: patientInputsSchema,
        })
      )
      .mutation(async ({ input }) => {
        const rules = await getAllRules(input.outcomeId);
        const inputs = input.patientInputs as PatientInputs;
        const { results, consensus, suggestions } = runEngine(rules, inputs);

        // 予測セッションを保存
        const insertResult = await createPrediction({
          patientInputs: inputs,
          outcomeId: input.outcomeId,
          consensusScore: consensus.score,
          consensusLabel: consensus.label,
        });

        // 個別結果を保存
        const insertId = (insertResult as unknown as { insertId: number }).insertId;
        if (insertId && results.length > 0) {
          await createPredictionResults(
            results.map((r) => ({
              predictionId: insertId,
              ruleId: r.ruleId,
              ruleName: r.ruleName,
              isApplicable: r.isApplicable,
              unavailableReason: r.unavailableReason ?? null,
              isPositive: r.isPositive ?? null,
              prediction: r.prediction ?? null,
              probability: r.probability ?? null,
              details: r.details,
            }))
          );
        }

        return {
          predictionId: insertId,
          results,
          consensus,
          suggestions,
        };
      }),

    // 予測のみ（保存なし・プレビュー用）
    preview: publicProcedure
      .input(
        z.object({
          outcomeId: z.number().int(),
          patientInputs: patientInputsSchema,
        })
      )
      .mutation(async ({ input }) => {
        const rules = await getAllRules(input.outcomeId);
        const inputs = input.patientInputs as PatientInputs;
        return runEngine(rules, inputs);
      }),
  }),

  // ---- 予測履歴 ----
  history: router({
    list: publicProcedure
      .input(z.object({ limit: z.number().int().default(100) }))
      .query(async ({ input }) => {
        return getAllPredictions(input.limit);
      }),

    get: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        const prediction = await getPredictionById(input.id);
        const results = await getPredictionResultsByPredictionId(input.id);
        return { prediction, results };
      }),

    updateOutcome: publicProcedure
      .input(
        z.object({
          id: z.number().int(),
          actualOutcome: z.object({
            value: z.union([z.string(), z.number(), z.boolean()]),
            label: z.string(),
            fac_at_discharge: z.number().optional(),
            fim_at_discharge: z.number().optional(),
            hospital_days: z.number().optional(),
            notes: z.string().optional(),
          }),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await updatePredictionOutcome(
          input.id,
          input.actualOutcome as ActualOutcome,
          input.notes
        );
        return { success: true };
      }),

    exportCsv: publicProcedure
      .input(z.object({ limit: z.number().int().default(1000) }))
      .query(async ({ input }) => {
        const preds = await getAllPredictions(input.limit);
        const headers = [
          "ID", "評価日時", "アウトカムID", "年齢", "性別", "発症日数",
          "NIHSS", "TCT", "BBS", "10m速度", "MMSE",
          "座位30秒", "空間無視", "介護者", "糖尿病",
          "FIM運動", "FIM認知", "FIM合計",
          "コンセンサススコア", "コンセンサスラベル",
          "実績値", "実績記録日", "メモ",
        ];
        const rows = preds.map((p) => {
          const inp = p.patientInputs as PatientInputs;
          const ao = p.actualOutcome as ActualOutcome | null;
          return [
            p.id,
            new Date(p.createdAt).toLocaleString("ja-JP"),
            p.outcomeId,
            inp.age ?? "",
            inp.sex ?? "",
            inp.days_since_onset ?? "",
            inp.nihss ?? "",
            inp.tct_score ?? "",
            inp.bbs_score ?? "",
            inp.walk_speed_10m ?? "",
            inp.mmse_score ?? "",
            inp.sitting_balance_30s != null ? (inp.sitting_balance_30s ? 1 : 0) : "",
            inp.spatial_neglect != null ? (inp.spatial_neglect ? 1 : 0) : "",
            inp.caregiver_available != null ? (inp.caregiver_available ? 1 : 0) : "",
            inp.diabetes != null ? (inp.diabetes ? 1 : 0) : "",
            inp.fim_motor ?? "",
            inp.fim_cognitive ?? "",
            inp.fim_total ?? "",
            p.consensusScore != null ? p.consensusScore.toFixed(3) : "",
            p.consensusLabel ?? "",
            ao?.value ?? "",
            p.outcomeRecordedAt ? new Date(p.outcomeRecordedAt).toLocaleString("ja-JP") : "",
            p.notes ?? "",
          ];
        });

        const bom = "\uFEFF";
        const csv =
          bom +
          [headers, ...rows]
            .map((row) =>
              row
                .map((cell) => {
                  const s = String(cell ?? "");
                  return s.includes(",") || s.includes('"') || s.includes("\n")
                    ? `"${s.replace(/"/g, '""')}"`
                    : s;
                })
                .join(",")
            )
            .join("\n");

        return { csv };
      }),
  }),
});

export type AppRouter = typeof appRouter;
