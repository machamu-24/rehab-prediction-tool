import { RULE_TYPES } from "../shared/ruleTypes";
import { readNomogramReference } from "../shared/ruleAvailability";
import { applyConditionLabel } from "../shared/applyConditionLabel";
import { serializeCsv } from "../shared/csv";
import { getResultStatus } from "../shared/resultStatus";
import { actualOutcomeSchema } from "../shared/actualOutcome";
import { timeQuerySchema } from "../shared/literatureTimeline";
import { TRPCError } from "@trpc/server";
import { patientInputsSchema } from "../shared/patientValidation";
import { assessmentSchema, ENGINE_VERSION } from "../shared/assessment";
import { prepareRuleEdit, getEditToken } from "./ruleReview";
import { localOperationsRouter } from "./localOperations";
import {
  applyConditionSchema,
  validateRuleDefinition,
} from "../shared/ruleValidation";
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
  savePredictionWithResults,
  getAllPredictions,
  getPredictionById,
  updatePredictionOutcome,
  getPredictionResultsByPredictionId,
} from "./db";
import { runEngine, extractRequiredFieldsFromDef } from "./ruleEngine";
import type { PatientInputs, ActualOutcome } from "../drizzle/schema";

// ---- Zod スキーマ ----

const ruleDefinitionSchema = z.unknown().superRefine((definition, ctx) => {
  const error = validateRuleDefinition(definition);
  if (error) ctx.addIssue({ code: "custom", message: error });
});

const historyFiltersSchema = z.object({
  caseId: z.string().trim().max(64).optional(),
  outcomeId: z.number().int().positive().optional(),
  search: z.string().trim().max(200).optional(),
});

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
  ruleType: z.enum(RULE_TYPES),
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

// ============================================================
// ルーター定義
// ============================================================

export const appRouter = router({
  local: localOperationsRouter,
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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

    create: publicProcedure.input(outcomeSchema).mutation(async ({ input }) => {
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
        return rules.map(r => ({
          ...r,
          editToken: getEditToken(r),
          requiredFields: Array.from(
            new Set(extractRequiredFieldsFromDef(r.ruleDefinition))
          ),
          applyConditionFields: Array.isArray(r.applyConditions)
            ? (
                r.applyConditions as Array<{
                  field: string;
                  label?: string;
                  operator: string;
                  value?: unknown;
                }>
              ).map(c => ({
                field: c.field,
                label: applyConditionLabel(c),
              }))
            : [],
        }));
      }),

    get: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        return getRuleById(input.id);
      }),

    create: publicProcedure.input(ruleSchema).mutation(async ({ input }) => {
      if ((input.ruleDefinition as { type: string }).type !== input.ruleType)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ルール種別と定義が一致しません",
        });
      if (!(await getOutcomeById(input.outcomeId)))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "アウトカムが見つかりません",
        });
      if (!(input.ruleDefinition as { timeline?: unknown }).timeline)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "時間軸を登録してください。数値化できない場合は理由を記録してください",
        });
      await createRule({
        ...input,
        ruleDefinition: prepareRuleEdit(undefined, input),
        sourceUrl: input.sourceUrl || null,
        consensusEligible: readNomogramReference(input.ruleDefinition) ? false : input.consensusEligible,
        accuracy: input.accuracy ?? null,
        sensitivity: input.sensitivity ?? null,
        specificity: input.specificity ?? null,
        auc: input.auc ?? null,
      });
      return { success: true };
    }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number().int(),
          editToken: z.string().length(64),
          data: ruleSchema.partial(),
        })
      )
      .mutation(async ({ input }) => {
        const existing = await getRuleById(input.id);
        if (!existing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "文献ルールが見つかりません",
          });
        if (getEditToken(existing) !== input.editToken)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "編集中にルールが更新されました。入力内容を控え、一覧を再読み込みして開き直してください",
          });
        const definition = input.data.ruleDefinition ?? existing.ruleDefinition;
        if (
          (definition as { type: string }).type !==
          (input.data.ruleType ?? existing.ruleType)
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "ルール種別と定義が一致しません",
          });
        if (
          input.data.outcomeId !== undefined &&
          !(await getOutcomeById(input.data.outcomeId))
        )
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "アウトカムが見つかりません",
          });
        const data = { ...input.data };
        data.ruleDefinition = prepareRuleEdit(existing, input.data);
        if (readNomogramReference(data.ruleDefinition)) data.consensusEligible = false;
        if ("sourceUrl" in data && !data.sourceUrl) {
          (data as Record<string, unknown>).sourceUrl = null;
        }
        await updateRule(
          input.id,
          data as Partial<import("../drizzle/schema").InsertLiteratureRule>,
          input.editToken
        );
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
        assessmentSchema.extend({
          outcomeId: z.number().int(),
          patientInputs: patientInputsSchema,
          timeContext: timeQuerySchema.optional(),
        })
      )
      .mutation(async ({ input }) => {
        const outcome = await getOutcomeById(input.outcomeId);
        if (!outcome)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "アウトカムが見つかりません",
          });
        const rules = await getAllRules(input.outcomeId, true);
        const inputs = input.patientInputs as PatientInputs;
        const { results, consensus, suggestions } = runEngine(
          rules,
          inputs,
          input.timeContext
        );

        if (!rules.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "有効な文献ルールがありません",
          });
        const insertId = await savePredictionWithResults(
          {
            patientInputs: inputs,
            outcomeId: input.outcomeId,
            consensusScore: consensus.score,
            consensusLabel: consensus.label,
            caseId: input.caseId || null,
            assessedOn: input.assessedOn ?? null,
            assessmentPhase: input.assessmentPhase ?? null,
            timeContext: input.timeContext ?? null,
            engineVersion: ENGINE_VERSION,
            outcomeSnapshot: structuredClone(outcome),
          },
          results.map(r => ({
            ruleId: r.ruleId,
            ruleName: r.ruleName,
            isApplicable: r.isApplicable,
            unavailableReason: r.unavailableReason,
            isPositive: r.isPositive,
            prediction: r.prediction,
            probability: r.probability,
            details: r.details,
            ruleSnapshot: structuredClone(
              rules.find(rule => rule.id === r.ruleId)!
            ),
            resultSnapshot: structuredClone({ ...r }),
          }))
        );

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
          timeContext: timeQuerySchema.optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (!(await getOutcomeById(input.outcomeId)))
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "アウトカムが見つかりません",
          });
        const rules = await getAllRules(input.outcomeId, true);
        const inputs = input.patientInputs as PatientInputs;
        return runEngine(rules, inputs, input.timeContext);
      }),
  }),

  // ---- 予測履歴 ----
  history: router({
    list: publicProcedure
      .input(
        historyFiltersSchema.extend({
          limit: z.number().int().min(1).max(1000).default(100),
          offset: z.number().int().min(0).default(0),
        })
      )
      .query(async ({ input }) => {
        return getAllPredictions(input.limit, {
          offset: input.offset,
          outcomeId: input.outcomeId,
          search: input.search,
          caseId: input.caseId,
        });
      }),

    get: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        const prediction = await getPredictionById(input.id);
        if (!prediction)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "照合履歴が見つかりません",
          });
        const results = await getPredictionResultsByPredictionId(input.id);
        return { prediction, results };
      }),

    updateOutcome: publicProcedure
      .input(
        z.object({
          id: z.number().int(),
          actualOutcome: actualOutcomeSchema,
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (!(await getPredictionById(input.id)))
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "照合履歴が見つかりません",
          });
        await updatePredictionOutcome(
          input.id,
          input.actualOutcome as ActualOutcome,
          input.notes
        );
        return { success: true };
      }),

    exportDetailedCsv: publicProcedure
      .input(
        historyFiltersSchema.extend({
          limit: z.number().int().min(1).max(1000).default(1000),
        })
      )
      .query(async ({ input }) => {
        const preds = await getAllPredictions(input.limit, {
          outcomeId: input.outcomeId,
          search: input.search,
          caseId: input.caseId,
        });
        const rows: unknown[][] = [
          [
            "履歴ID",
            "症例ID",
            "評価日",
            "保存時アウトカム",
            "エンジン版",
            "照合時間軸JSON",
            "患者入力JSON",
            "実績JSON",
            "文献ID",
            "文献名",
            "集計区分",
            "時間軸の照合",
            "数値予測",
            "確率",
            "判定文",
            "対象外理由",
            "保存時文献JSON",
            "保存時結果JSON",
          ],
        ];
        for (const p of preds) {
          const base = [
            p.id,
            p.caseId,
            p.assessedOn,
            p.outcomeSnapshot?.name,
            p.engineVersion,
            JSON.stringify(p.timeContext ?? null),
            JSON.stringify(p.patientInputs),
            JSON.stringify(p.actualOutcome),
          ];
          const results = await getPredictionResultsByPredictionId(p.id);
          if (!results.length) rows.push([...base, "", "", "詳細未保存"]);
          for (const r of results) {
            const snapshot = r.resultSnapshot as Record<string, unknown> | null;
            const category = snapshot
              ? getResultStatus({
                  ...r,
                  consensusEligible: snapshot.consensusEligible === true,
                  status: String(snapshot.status ?? ""),
                })
              : "未記録";
            rows.push([
              ...base,
              r.ruleId,
              r.ruleName,
              category,
              (snapshot?.timeMatch as { reason?: string })?.reason,
              snapshot?.numericValue,
              r.probability,
              r.prediction,
              r.unavailableReason,
              JSON.stringify(r.ruleSnapshot),
              JSON.stringify(snapshot),
            ]);
          }
        }
        return { csv: serializeCsv(rows) };
      }),

    exportCsv: publicProcedure
      .input(
        historyFiltersSchema.extend({
          limit: z.number().int().min(1).max(1000).default(1000),
        })
      )
      .query(async ({ input }) => {
        const preds = await getAllPredictions(input.limit, {
          outcomeId: input.outcomeId,
          search: input.search,
          caseId: input.caseId,
        });
        const headers = [
          "ID",
          "評価日時",
          "アウトカムID",
          "年齢",
          "性別",
          "発症日数",
          "NIHSS",
          "TCT",
          "BBS",
          "10m速度",
          "MMSE",
          "座位30秒",
          "空間無視",
          "介護者",
          "糖尿病",
          "FIM運動",
          "FIM認知",
          "FIM合計",
          "コンセンサススコア",
          "コンセンサスラベル",
          "実績値",
          "実績記録日",
          "メモ",
          "症例ID",
          "評価日",
          "評価時点",
          "保存時アウトカム",
          "エンジン版",
          "照合時間軸JSON",
          "入院時年齢",
          "入院時FIM運動",
          "入院時FIM認知",
          "入院までの発症日数",
          "実績測定日",
          "実績発症後日数",
          "実績尺度",
          "実績尺度名",
          "実績ラベル",
          "患者入力JSON",
          "実績JSON",
        ];
        const rows = preds.map(p => {
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
            inp.sitting_balance_30s != null
              ? inp.sitting_balance_30s
                ? 1
                : 0
              : "",
            inp.spatial_neglect != null ? (inp.spatial_neglect ? 1 : 0) : "",
            inp.caregiver_available != null
              ? inp.caregiver_available
                ? 1
                : 0
              : "",
            inp.diabetes != null ? (inp.diabetes ? 1 : 0) : "",
            inp.fim_motor_total ?? inp.fim_motor ?? "",
            inp.fim_cognitive_total ?? inp.fim_cognitive ?? "",
            inp.fim_total ?? "",
            p.resultCount > 0 && p.consensusScore != null
              ? p.consensusScore.toFixed(3)
              : "",
            p.resultCount === 0 ? "詳細未保存" : (p.consensusLabel ?? ""),
            ao?.value ?? "",
            p.outcomeRecordedAt
              ? new Date(p.outcomeRecordedAt).toLocaleString("ja-JP")
              : "",
            p.notes ?? "",
            p.caseId ?? "",
            p.assessedOn ?? "",
            p.assessmentPhase ?? "",
            p.outcomeSnapshot?.name ?? "",
            p.engineVersion ?? "",
            JSON.stringify(p.timeContext ?? null),
            inp.admission_age ?? "",
            inp.admission_fim_motor_total ?? "",
            inp.admission_fim_cognitive_total ?? "",
            inp.days_onset_to_admission ?? "",
            ao?.measuredOn ?? "",
            ao?.daysSinceOnset ?? "",
            ao?.scale ?? "",
            ao?.scaleName ?? "",
            ao?.label ?? "",
            JSON.stringify(inp),
            JSON.stringify(ao),
          ];
        });

        const csv = serializeCsv([headers, ...rows]);

        return { csv };
      }),
  }),
});

export type AppRouter = typeof appRouter;
