import { getFimTotalCalculation, type FimFormInputs } from "@shared/patientFimTotals";

export function FimTotalCalculation({ inputs, field }: { inputs: FimFormInputs; field: string }) {
  const calculation = getFimTotalCalculation(inputs, field);
  if (!calculation) return null;
  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      自動計算：運動{calculation.motor}点 ＋ 認知{calculation.cognitive}点 ＝ {calculation.total}点
    </p>
  );
}
