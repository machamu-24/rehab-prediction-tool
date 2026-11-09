import { getRuleExclusionReason } from "@shared/ruleAvailability";

export function RuleExclusion({ definition }: { definition: unknown }) {
  const reason = getRuleExclusionReason(definition);
  if (!reason) return null;
  return (
    <div className="mt-3 rounded-md border p-3 text-xs space-y-2">
      <p className="font-medium">参考文献として保持・計算対象外</p>
      <p className="text-muted-foreground">{reason}</p>
    </div>
  );
}
