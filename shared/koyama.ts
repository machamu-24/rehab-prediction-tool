import type { LiteratureTimeline, TimeMatch, TimeQuery } from "./literatureTimeline";

export const KOYAMA_FORMULA = "koyama_fim_total_a + (koyama_fim_total_b - koyama_fim_total_a) * ln(koyama_target_day / koyama_day_a) / ln(koyama_day_b / koyama_day_a)";
export const KOYAMA_FIELDS = ["koyama_day_a", "koyama_fim_total_a", "koyama_day_b", "koyama_fim_total_b", "koyama_target_day"] as const;

/** The dedicated form owns the time axis when only this model is selected. */
export function koyamaTimeQuery(inputs: Record<string, unknown>): TimeQuery {
  const point = (field: string) => {
    const value = Number(inputs[field]);
    return Number.isSafeInteger(value) && value > 0
      ? { value, unit: "day" as const, precision: "exact" as const }
      : undefined;
  };
  return {
    kind: "future",
    evaluation: point("koyama_day_b"),
    target: point("koyama_target_day"),
  };
}

export function koyamaResultTimeline(inputs: Record<string, unknown>): LiteratureTimeline {
  return {
    version: 1, anchor: "stroke_onset", kind: "future",
    evaluation: { value: Number(inputs.koyama_day_b), unit: "day", precision: "exact",
      originalText: "今回入力したB（再評価）の発症後日数", basis: "患者ごとの専用入力B。研究集団の固定評価日ではない。" },
    target: { value: Number(inputs.koyama_target_day), unit: "day", precision: "exact",
      originalText: "今回入力したX（予測対象）の発症後日数", basis: "患者ごとの専用入力X。研究集団の固定退院日ではない。" },
  };
}

/** Conservative implementation limits; not additional exclusions reported by the original study. */
export function koyamaInputReason(inputs: Record<string, unknown>): string | null {
  const a = Number(inputs.koyama_day_a), b = Number(inputs.koyama_day_b), x = Number(inputs.koyama_target_day);
  if (!(0 < a && a < b && b < x))
    return "対数モデルの日数は 0 < A（入院時）< B（再評価）< X（予測対象）にしてください。すべて発症日＝0日からの日数です。";
  if (a < 30 || a > 60)
    return "A（入院時）は発症後30〜60日で入力してください。原著抄録の転院時期に合わせたアプリの制限です。";
  if (b - a < 14 || b - a > 42)
    return `AとBの評価間隔は14〜42日（総説の2〜6週間）にしてください。現在の間隔は${b - a}日です。Aが発症後${a}日の場合、Bには発症後${a + 14}〜${a + 42}日を入力します（Aからの経過日数ではありません）。`;
  if (x > 180)
    return "予測対象Xは発症後180日以内にしてください。総説の約半年を180日としたアプリの上限で、厳密な検証境界ではありません。";
  if (Number(inputs.koyama_fim_total_b) < Number(inputs.koyama_fim_total_a))
    return "FIM総得点が低下しているため、回復を近似する本モデルの通常予測は行いません。測定条件・合併症などを確認してください（アプリの制限）。";
  return null;
}

/** B/X define this model's future time axis independently of the query for other rules. */
export function matchKoyamaTime(): TimeMatch {
  return { status: "reference", reason: "専用入力のA・B・Xの日数から算出する将来の参考予測です。上部の時間軸は他の文献の照合に使い、本モデルはBを評価時点、Xを予測対象時点として扱います。" };
}
