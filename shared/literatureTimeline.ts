import { z } from "zod";

export const PRECISION_LABELS = {
  exact: "明確な時点",
  approximate: "概算",
  mean: "研究集団の平均値",
  median: "研究集団の中央値",
  unknown: "特定できない",
} as const;
const dayValue = z.number().finite().min(0).max(100000);
export const matchRangeDaysSchema = z
  .object({
    min: dayValue,
    max: dayValue,
    basis: z
      .string()
      .trim()
      .min(1, "照合範囲の根拠・設定理由を入力してください")
      .max(2000),
  })
  .strict()
  .refine(range => range.min <= range.max, {
    message: "照合範囲の開始日は終了日以下にしてください",
    path: ["max"],
  });
export const timepointSchema = z
  .object({
    value: z.number().finite().min(0).max(100000).nullable(),
    unit: z.enum(["day", "month"]),
    precision: z.enum(["exact", "approximate", "mean", "median", "unknown"]),
    matchRangeDays: matchRangeDaysSchema.optional(),
    originalMonthValue: z
      .number()
      .finite()
      .min(0)
      .max(100000 / 30)
      .optional(),
    originalText: z
      .string()
      .trim()
      .max(1000)
      .default(""),
    basis: z
      .string()
      .trim()
      .max(2000)
      .default(""),
  })
  .strict()
  .superRefine((point, ctx) => {
    if (point.precision === "unknown" && point.matchRangeDays)
      ctx.addIssue({
        code: "custom",
        path: ["matchRangeDays"],
        message: "時点を特定できない場合は照合範囲を設定できません",
      });
    if (
      point.precision === "unknown"
        ? point.value !== null
        : point.value === null
    )
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message:
          "時点が特定できない場合は数値なし、それ以外は発症からの数値を入力してください",
      });
    if (
      point.value !== null &&
      point.unit === "month" &&
      point.value > 100000 / 30
    )
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "月数が大きすぎます",
      });
  });
export type LiteratureTimepoint = z.infer<typeof timepointSchema>;
export const referenceDays = (p: LiteratureTimepoint): number | null =>
  p.value === null
    ? null
    : Number((p.value * (p.unit === "month" ? 30 : 1)).toFixed(6));

// Accept legacy month records, but do not turn calendar months into exact days.
export function toDayTimepoint(
  point: LiteratureTimepoint
): LiteratureTimepoint {
  if (point.unit === "day") return point;
  return {
    ...point,
    value: referenceDays(point),
    unit: "day",
    precision: point.precision === "exact" ? "approximate" : point.precision,
    ...(point.value !== null ? { originalMonthValue: point.value } : {}),
  };
}

export function formatMatchRange(point: LiteratureTimepoint): string | null {
  const range = point.matchRangeDays;
  return range
    ? `照合範囲：発症後${range.min}〜${range.max}日（両端を含む）`
    : null;
}

export const literatureTimelineSchema = z
  .object({
    version: z.literal(1),
    anchor: z.literal("stroke_onset"),
    kind: z.enum(["future", "concurrent"]),
    evaluation: timepointSchema,
    target: timepointSchema.optional(),
  })
  .strict()
  .superRefine((timeline, ctx) => {
    if (timeline.kind === "future" && !timeline.target)
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: "予測対象時点を入力してください",
      });
    if (timeline.kind === "concurrent" && timeline.target)
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: "同時点の判別では別の予測対象時点を登録しません",
      });
    const a = timeline.evaluation,
      b = timeline.target;
    // Compare explicit values in the same unit; never equate calendar months with days.
    if (
      timeline.kind === "future" &&
      b &&
      a.precision === "exact" &&
      b.precision === "exact" &&
      a.unit === b.unit &&
      a.value !== null &&
      b.value !== null &&
      b.value <= a.value
    )
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message:
          "将来予測の対象時点は評価時点より後にしてください。同じ時点なら「同時点の判別」を選択してください",
      });
  })
  .transform(timeline => ({
    ...timeline,
    evaluation: toDayTimepoint(timeline.evaluation),
    ...(timeline.target ? { target: toDayTimepoint(timeline.target) } : {}),
  }));
export type LiteratureTimeline = z.infer<typeof literatureTimelineSchema>;

export function parseOptionalTimeline(
  draft: LiteratureTimeline
): LiteratureTimeline | undefined {
  const parsed = literatureTimelineSchema.safeParse(draft);
  if (!parsed.success)
    throw new Error(`時間軸: ${parsed.error.issues[0].message}`);
  const timeline = parsed.data;
  const points = [
    timeline.evaluation,
    ...(timeline.target ? [timeline.target] : []),
  ];
  return points.every(
    point => point.precision === "unknown" && !point.originalText && !point.basis
  )
    ? undefined
    : timeline;
}

export function readTimeline(definition: unknown): LiteratureTimeline | null {
  const parsed = literatureTimelineSchema.safeParse(
    (definition as { timeline?: unknown })?.timeline
  );
  return parsed.success ? parsed.data : null;
}
export function formatTimepoint(point: LiteratureTimepoint): string {
  point = toDayTimepoint(point);
  if (point.precision === "unknown")
    return point.originalText
      ? `発症後の時点不明（原著: ${point.originalText}）`
      : "発症後の時点不明";
  const prefix = point.precision === "approximate" ? "約" : "";
  const statistic =
    point.precision === "mean"
      ? "・平均"
      : point.precision === "median"
        ? "・中央値"
        : "";
  return `発症後${prefix}${point.value}日${statistic}`;
}
export function timelineWarnings(
  t: LiteratureTimeline,
  continuous = false
): string[] {
  const points = [t.evaluation, ...(t.target ? [t.target] : [])];
  const warnings: string[] = [];
  if (
    points.some(
      p =>
        (p.unit === "month" || p.originalMonthValue !== undefined) &&
        p.value !== null
    )
  )
    warnings.push(
      "月数の日数換算は1ヶ月＝30日の目安です。暦月と正確に一致しません。"
    );
  const missingRangeLabels = [
    { label: "評価時点", point: t.evaluation },
    ...(t.kind === "future" && t.target
      ? [{ label: "予測対象時点", point: t.target }]
      : []),
  ]
    .filter(
      ({ point }) =>
        ["mean", "median"].includes(point.precision) &&
        !matchRangeDaysSchema.safeParse(point.matchRangeDays).success
    )
    .map(({ label }) => label);
  if (continuous && missingRangeLabels.length)
    warnings.push(
      `${missingRangeLabels.join("・")}は研究集団の平均値・中央値です。個人の評価日・予測対象日を示すものではありません。`
    );
  const a = referenceDays(t.evaluation),
    b = t.target ? referenceDays(t.target) : null;
  if (t.kind === "future" && a !== null && b !== null && b <= a)
    warnings.push(
      "換算上、予測対象が評価時点以前です。概算・代表値の根拠と原著の前後関係を確認してください。"
    );
  return warnings;
}

const queryPointSchema = z
  .object({
    value: z.number().finite().min(0).max(100000),
    unit: z.enum(["day", "month"]),
    precision: z.enum(["exact", "approximate"]),
  })
  .strict()
  .superRefine((point, ctx) => {
    if (point.unit === "month" && point.value > 100000 / 30)
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "月数が大きすぎます",
      });
  })
  .transform(point => ({
    ...point,
    value: Number((point.value * (point.unit === "month" ? 30 : 1)).toFixed(6)),
    unit: "day" as const,
    precision:
      point.unit === "month" ? ("approximate" as const) : point.precision,
  }));
export const timeQuerySchema = z
  .object({
    kind: z.enum(["future", "concurrent"]),
    evaluation: queryPointSchema.optional(),
    target: queryPointSchema.optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.kind === "concurrent" && q.target)
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: "同時点判別では予測対象時点を指定しません",
      });
    if (
      q.kind === "future" &&
      q.evaluation &&
      q.target &&
      q.target.value <= q.evaluation.value
    )
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: "予測対象時点は評価時点より後にしてください",
      });
  });
export type TimeQuery = z.infer<typeof timeQuerySchema>;
export type TimeMatch = {
  status: "matched" | "within_range" | "review" | "reference" | "unknown" | "mismatch";
  reason: string;
  requiresReview?: boolean;
};
export const TIME_MATCH_LABELS: Record<TimeMatch["status"], string> = {
  matched: "時点一致",
  within_range: "設定範囲内",
  review: "評価時期の確認",
  reference: "時期は参考扱い",
  unknown: "時期未確認",
  mismatch: "時期不一致",
};

export function requiresTimingReview(match?: TimeMatch | null): boolean {
  return match?.status === "review" || match?.requiresReview === true;
}

export function timeMatchLabel(match: TimeMatch): string {
  return requiresTimingReview(match)
    ? TIME_MATCH_LABELS.review
    : TIME_MATCH_LABELS[match.status];
}

export function matchTimeline(
  t: LiteratureTimeline | null,
  query?: TimeQuery | null
): TimeMatch {
  const parsedTimeline = literatureTimelineSchema.safeParse(t);
  const parsedQuery = timeQuerySchema.safeParse(query);
  if ((t && !parsedTimeline.success) || (query && !parsedQuery.success))
    return {
      status: "unknown",
      reason: "時間軸の設定が不正です。集計対象外です。",
    };
  if (!parsedTimeline.success || !parsedQuery.success)
    return {
      status: "review",
      reason: "文献または照合条件の時間軸が未登録です。日数は補完せず、ほかの集計条件を満たす場合に集計します。",
    };
  t = parsedTimeline.data;
  query = parsedQuery.data;
  if (t.kind !== query.kind)
    return {
      status: "mismatch",
      reason: "将来予測と同時点判別の種類が異なります。",
    };
  const pairs: [LiteratureTimepoint | undefined, TimeQuery["evaluation"]][] = [
    [t.evaluation, query.evaluation],
  ];
  if (t.kind === "future") pairs.push([t.target, query.target]);
  let withinRange = false,
    requiresReview = false;
  const reviewReasons = new Set<string>();
  for (const [a, b] of pairs) {
    if (!a || a.value === null || !b) {
      reviewReasons.add("評価時点またはアウトカム測定時点が未指定・不明です。");
      continue;
    }
    if (a.matchRangeDays) {
      if (b.value < a.matchRangeDays.min || b.value > a.matchRangeDays.max) {
        reviewReasons.add("評価時点またはアウトカム測定時点が文献に設定された照合範囲外です。");
        continue;
      }
      if (a.precision !== "exact" || b.precision !== "exact")
        requiresReview = true;
      if (
        a.precision !== "exact" ||
        b.precision !== "exact" ||
        a.value !== b.value
      )
        withinRange = true;
      continue;
    }
    if (
      a.precision !== "exact" ||
      b.precision !== "exact" ||
      a.unit !== b.unit
    ) {
      reviewReasons.add("評価時点またはアウトカム測定時点に概算・平均値・中央値が含まれます。");
      continue;
    }
    if (a.value !== b.value)
      reviewReasons.add("文献の評価時点またはアウトカム測定時点と、今回指定した時点が異なります。");
  }
  if (reviewReasons.size)
    return {
      status: "review",
      reason: `${[...reviewReasons].join("")}日数差に制限を設けず、ほかの集計条件を満たす場合に集計します。`,
    };
  if (withinRange)
    return {
      status: "within_range",
      reason:
        "評価時点と予測対象時点が、文献ごとに設定された照合範囲内、または明確な時点と一致しました。",
      ...(requiresReview ? { requiresReview: true } : {}),
    };
  return {
    status: "matched",
    reason: "評価時点と対象時点が同じ単位の明確な値で一致しました。",
  };
}
export function formatTimeQuery(q?: TimeQuery | null): string {
  if (!q) return "照合時間軸：未記録";
  const parsed = timeQuerySchema.safeParse(q);
  if (!parsed.success) return "照合時間軸：設定を確認してください";
  q = parsed.data;
  const point = (p?: TimeQuery["evaluation"]) =>
    p
      ? `発症後${p.precision === "approximate" ? "約" : ""}${p.value}日`
      : "時点未指定";
  return `照合時間軸：${point(q.evaluation)} → ${q.kind === "concurrent" ? "同時点の判別" : point(q.target)}`;
}
