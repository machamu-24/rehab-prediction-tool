import type { RuleEvaluationResult } from "@shared/ruleEngine";
import { getExclusionReasonLabel } from "@shared/resultStatus";
import { TimelineSummary } from "@/components/LiteratureTimeline";
import { PATIENT_FIELDS } from "@/lib/patientFields";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ExternalLink } from "lucide-react";

type ReferenceResult = Pick<RuleEvaluationResult, "ruleName"> &
  Partial<Pick<RuleEvaluationResult,
    "source" | "sourceUrl" | "status" | "missingFields" | "unavailableReason" |
    "timeline" | "timeMatch" | "literatureSummary"
  >> & { referenceOnly: NonNullable<RuleEvaluationResult["referenceOnly"]> };

export function NomogramReferenceCard({ result }: { result: ReferenceResult }) {
  const missing = new Set(result.missingFields ?? []);
  const fieldLabel = (field: string) =>
    PATIENT_FIELDS.flatMap(section => section.fields).find(item => item.key === field)?.label ?? field;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <BookOpen className="h-4 w-4 mt-0.5 shrink-0 text-slate-600" />
        <div className="space-y-1">
          <p className="text-sm font-semibold">{result.ruleName}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">自動計算なし・原文確認</Badge>
            <Badge variant="outline">
              {result.status === "reference_only" ? "必要項目入力済み" : getExclusionReasonLabel(result)}
            </Badge>
            <Badge variant="outline">支持・困難の集計対象外</Badge>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{result.literatureSummary?.overview}</p>
      <p className="text-xs"><span className="font-medium">自動計算できない理由：</span>{result.referenceOnly.reason}</p>
      {result.status === "outside" && (
        <p className="text-xs text-amber-800">今回の入力では対象外：{result.unavailableReason}</p>
      )}
      {missing.size > 0 && (
        <p className="text-xs text-amber-800">不足している評価項目：{[...missing].map(fieldLabel).join("、")}</p>
      )}
      <div className="space-y-1">
        <p className="text-xs font-medium">原文の参照に必要な評価項目</p>
        <div className="flex flex-wrap gap-1.5">
          {result.referenceOnly.requiredFields.map(field => (
            <Badge key={field} variant="outline" className="text-[10px]">
              {fieldLabel(field)}：{missing.has(field) ? "未入力" : "入力済み"}
            </Badge>
          ))}
        </div>
      </div>
      {result.literatureSummary?.targetPopulation && (
        <p className="text-xs text-muted-foreground">{result.literatureSummary.targetPopulation}</p>
      )}
      {result.literatureSummary?.clinicalNote && (
        <p className="text-xs text-muted-foreground">文献の補足：{result.literatureSummary.clinicalNote}</p>
      )}
      {result.referenceOnly.conditions.length > 0 ? (
        <div className="text-xs text-muted-foreground">
          <p className="font-medium">登録済みの適用条件</p>
          {result.referenceOnly.conditions.map((condition, index) => <p key={index}>{condition}</p>)}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">適用条件は構造化されていません。入力項目が揃っていても、対象患者に適用できるとは限りません。</p>
      )}
      <TimelineSummary definition={{ timeline: result.timeline }} />
      {result.timeMatch && <p className="text-xs text-muted-foreground">{result.timeMatch.reason}</p>}
      <p className="text-xs">予測値・確率は算出していません。対象集団・評価時点・予測対象時点を確認し、原文のノモグラムを参照してください。</p>
      <div className="text-xs space-y-1">
        {result.source && <p className="text-muted-foreground">{result.source}</p>}
        {result.sourceUrl ? (
          <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            原文のノモグラムを確認する <ExternalLink className="h-3 w-3" />
          </a>
        ) : <p className="text-muted-foreground">原文URLは未登録です。文献情報から原文を確認してください。</p>}
      </div>
    </div>
  );
}
