import type { RuleEvaluationResult } from "@shared/ruleEngine";
import { timeMatchLabel } from "@shared/literatureTimeline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TimelineSummary } from "@/components/LiteratureTimeline";

export type NumericPredictionResult = Pick<
  RuleEvaluationResult,
  | "ruleId"
  | "ruleName"
  | "isApplicable"
  | "status"
  | "numericValue"
  | "outputUnit"
  | "prediction"
  | "timeline"
  | "timeMatch"
  | "unavailableReason"
> &
  Partial<
    Pick<
      RuleEvaluationResult,
      "literatureSummary" | "details" | "source" | "sourceUrl" | "evidenceLevel"
    >
  > & {
    savedDefinition?: unknown;
    savedConditions?: unknown;
  };

export function NumericPredictionValue({
  result,
}: {
  result: Pick<
    NumericPredictionResult,
    "numericValue" | "outputUnit" | "prediction"
  >;
}) {
  return typeof result.numericValue === "number" &&
    Number.isFinite(result.numericValue) ? (
    <p className="text-3xl font-bold tracking-tight tabular-nums text-violet-900">
      {result.numericValue.toFixed(2)}
      {result.outputUnit && (
        <span className="ml-1 text-sm font-medium">{result.outputUnit}</span>
      )}
    </p>
  ) : (
    <p className="text-sm text-muted-foreground">
      {result.prediction ?? "予測値の記録なし"}
    </p>
  );
}

export function NumericPredictionResults({
  results,
}: {
  results: NumericPredictionResult[];
}) {
  const estimates = results.filter(result => result.isApplicable);
  const missingCount = results.filter(
    result => result.status === "missing_input"
  ).length;
  const outsideCount = results.filter(
    result => result.status === "outside"
  ).length;
  const otherCount =
    results.length - estimates.length - missingCount - outsideCount;

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">数値予測の照合結果</CardTitle>
        <CardDescription>
          文献のモデルから算出したアウトカムの予測値です。単位・予測対象時点とあわせて確認してください。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div>
            <dt className="inline">予測値あり：</dt>
            <dd className="inline font-semibold text-foreground">
              {estimates.length}件
            </dd>
          </div>
          <div>
            <dt className="inline">入力不足：</dt>
            <dd className="inline">{missingCount}件</dd>
          </div>
          <div>
            <dt className="inline">適用条件外：</dt>
            <dd className="inline">{outsideCount}件</dd>
          </div>
          {otherCount > 0 && (
            <div>
              <dt className="inline">計算・評価不可：</dt>
              <dd className="inline">{otherCount}件</dd>
            </div>
          )}
        </dl>
        {estimates.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            算出できた予測値はありません。各文献の入力項目と適用条件を確認してください。
          </p>
        )}
        {results.map(result => (
          <article
            key={result.ruleId}
            className={`rounded-lg border p-4 space-y-3 ${result.isApplicable ? "border-violet-200 bg-violet-50/60" : "border-border bg-muted/30"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold">{result.ruleName}</p>
              {result.timeMatch && (
                <Badge variant="outline">
                  {timeMatchLabel(result.timeMatch)}
                </Badge>
              )}
            </div>
            {result.isApplicable ? (
              <>
                <p className="text-xs text-violet-700">予測値</p>
                <NumericPredictionValue result={result} />
              </>
            ) : (
              <div className="space-y-1 text-sm">
                <Badge variant="outline">
                  {result.status === "missing_input"
                    ? "入力不足"
                    : result.status === "outside"
                      ? "適用条件外"
                      : "計算・評価不可"}
                </Badge>
                <p className="text-muted-foreground">
                  {result.unavailableReason ?? "予測値を算出できませんでした。"}
                </p>
              </div>
            )}
            <TimelineSummary
              definition={{ timeline: result.timeline }}
              continuous
            />
            <details className="border-t border-violet-200 pt-3 text-xs">
              <summary className="cursor-pointer font-medium text-violet-900 focus-visible:outline-2 focus-visible:outline-offset-4">
                根拠・計算詳細
              </summary>
              <div className="pt-3 space-y-3">
                {result.literatureSummary && (
                  <div className="space-y-2">
                    <p className="font-semibold">文献の要点・適用対象</p>
                    {result.literatureSummary.overview && (
                      <p>{result.literatureSummary.overview}</p>
                    )}
                    {result.literatureSummary.targetPopulation && (
                      <p>{result.literatureSummary.targetPopulation}</p>
                    )}
                    {result.literatureSummary.predictors.length > 0 && (
                      <p>
                        使用評価：
                        {result.literatureSummary.predictors.join("、")}
                      </p>
                    )}
                    {result.literatureSummary.clinicalNote && (
                      <p className="text-muted-foreground">
                        {result.literatureSummary.clinicalNote}
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  <p className="font-semibold">計算の内訳</p>
                  {result.details && result.details.length > 0 ? (
                    <ul className="space-y-1 text-muted-foreground">
                      {result.details.map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">
                      {result.isApplicable
                        ? "計算の内訳は記録されていません。"
                        : "予測値を算出していないため、計算の内訳はありません。"}
                    </p>
                  )}
                </div>
                {(result.source || result.sourceUrl) && (
                  <div className="space-y-1">
                    <p className="font-semibold">出典</p>
                    {result.source && (
                      <p className="text-muted-foreground break-words">
                        {result.source}
                      </p>
                    )}
                    {result.sourceUrl && (
                      <a
                        className="text-primary underline"
                        href={result.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        原著を確認
                      </a>
                    )}
                    {result.evidenceLevel && (
                      <p className="text-muted-foreground">
                        研究デザイン：{result.evidenceLevel}
                      </p>
                    )}
                  </div>
                )}
                {result.savedDefinition != null && (
                  <details>
                    <summary className="cursor-pointer">
                      保存時のルール定義・適用条件
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all text-muted-foreground">
                      {JSON.stringify(
                        {
                          definition: result.savedDefinition,
                          conditions: result.savedConditions,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                )}
              </div>
            </details>
          </article>
        ))}
        <p className="text-xs text-muted-foreground">
          モデルによる推定値には誤差があります。
          {results.length > 1 &&
            "対象集団や尺度、予測時点が異なるため、文献ごとの値を個別に表示しています。"}
        </p>
      </CardContent>
    </Card>
  );
}
