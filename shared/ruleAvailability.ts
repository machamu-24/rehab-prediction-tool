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
