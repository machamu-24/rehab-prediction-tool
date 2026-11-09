export type ResultStatus =
  | "supports"
  | "against"
  | "reference"
  | "estimate"
  | "unknown"
  | "outside";

export type ResultDisplayStatus =
  | Exclude<ResultStatus, "unknown" | "outside">
  | "excluded";

/** Use the model's output definition, including when it could not be evaluated. */
export function readContinuousOutput(definition: unknown): {
  outputMode: "continuous";
  outputUnit: string | null;
} | null {
  if (!definition || typeof definition !== "object") return null;
  const def = definition as Record<string, unknown>;
  if (!["regression", "custom_formula"].includes(String(def.type)) || def.outputMode !== "continuous") return null;
  return {
    outputMode: "continuous",
    outputUnit: typeof def.outputUnit === "string" ? def.outputUnit : null,
  };
}

export function isContinuousResult(result: { outputMode?: string }) {
  return result.outputMode === "continuous";
}
export function isConsensusResult(r: {
  consensusEligible?: boolean;
  isApplicable: boolean;
  isPositive: boolean | null;
}) {
  return (
    r.consensusEligible === true && r.isApplicable && r.isPositive !== null
  );
}
export function getResultStatus(r: {
  consensusEligible?: boolean;
  isApplicable: boolean;
  isPositive: boolean | null;
  status?: string;
}): ResultStatus {
  if (!r.isApplicable) return r.status === "outside" ? "outside" : "unknown";
  if (r.isPositive === null) return "estimate";
  return isConsensusResult(r)
    ? r.isPositive
      ? "supports"
      : "against"
    : "reference";
}

/** Consolidate display groups while preserving the engine's detailed statuses. */
export function getResultDisplayStatus(
  result: Parameters<typeof getResultStatus>[0] & { outputMode?: string }
): ResultDisplayStatus {
  const status = getResultStatus(result);
  if (status === "unknown" || status === "outside") return "excluded";
  return status === "estimate" && !isContinuousResult(result)
    ? "reference"
    : status;
}

export function getExclusionReasonLabel(result: { status?: string }): string {
  switch (result.status) {
    case "missing_input":
      return "入力不足";
    case "outside":
      return "条件不一致";
    case "unsupported":
      return "計算未対応";
    case "invalid_definition":
      return "文献設定の不備";
    case "calculation_error":
      return "計算エラー";
    default:
      return "理由未記録";
  }
}

export const REFERENCE_RESULT_DESCRIPTION =
  "必要な評価項目はそろっており、結果を確認できる文献です。対象期間・時点の違いや不明点、数値予測・研究内割合などのため、支持・困難の集計には含めず、参考として表示しています。各文献の時期と理由を確認してください。";
