import {
  formatTimepoint,
  formatMatchRange,
  readTimeline,
  timelineWarnings,
  PRECISION_LABELS,
  type LiteratureTimeline,
  type LiteratureTimepoint,
} from "@shared/literatureTimeline";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

export const emptyTimeline = (): LiteratureTimeline => ({
  version: 1,
  anchor: "stroke_onset",
  kind: "future",
  evaluation: emptyPoint(),
  target: emptyPoint(),
});
const emptyPoint = (): LiteratureTimepoint => ({
  value: null,
  unit: "day",
  precision: "unknown",
  originalText: "",
  basis: "",
});
const selectStyle = "w-full h-9 rounded-md border px-2 bg-background text-sm";

export function TimelineEditor({
  value,
  onChange,
}: {
  value: LiteratureTimeline;
  onChange: (t: LiteratureTimeline) => void;
}) {
  const pointEditor = (key: "evaluation" | "target", title: string) => {
    const p = value[key]!;
    const change = (patch: Partial<LiteratureTimepoint>) =>
      onChange({ ...value, [key]: { ...p, ...patch } });
    return (
      <fieldset className="rounded-md border p-3 space-y-3">
        <legend className="px-1 text-sm font-medium">{title}</legend>
        <div>
          <div>
            <Label htmlFor={`${key}-precision`}>時点の確かさ・値の種類</Label>
            <select
              id={`${key}-precision`}
              className={selectStyle}
              value={p.precision}
              onChange={e =>
                change({
                  precision: e.target.value as LiteratureTimepoint["precision"],
                  ...(e.target.value === "unknown"
                    ? { value: null, matchRangeDays: undefined }
                    : {}),
                })
              }
            >
              {Object.entries(PRECISION_LABELS).map(([k, label]) => (
                <option value={k} key={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor={`${key}-value`}>{title}：発症からの日数</Label>
          <Input
            id={`${key}-value`}
            type="number"
            min="0"
            step="any"
            disabled={p.precision === "unknown"}
            value={p.value ?? ""}
            placeholder="例: 30"
            onChange={e =>
              change({
                value: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </div>
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <input
              id={`${key}-range-enabled`}
              type="checkbox"
              className="h-4 w-4"
              disabled={p.precision === "unknown"}
              checked={!!p.matchRangeDays}
              onChange={e =>
                change({
                  matchRangeDays: e.target.checked
                    ? { min: p.value ?? 0, max: p.value ?? 0, basis: "" }
                    : undefined,
                })
              }
            />
            <Label htmlFor={`${key}-range-enabled`}>
              照合する時期の範囲を設定する
            </Label>
          </div>
          {p.matchRangeDays && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(["min", "max"] as const).map(bound => (
                  <div key={bound}>
                    <Label htmlFor={`${key}-range-${bound}`}>
                      {bound === "min" ? "開始" : "終了"}（発症後の日数）
                    </Label>
                    <Input
                      id={`${key}-range-${bound}`}
                      type="number"
                      min={0}
                      max={100000}
                      step="any"
                      value={
                        Number.isFinite(p.matchRangeDays![bound])
                          ? p.matchRangeDays![bound]
                          : ""
                      }
                      onChange={e =>
                        change({
                          matchRangeDays: {
                            ...p.matchRangeDays!,
                            [bound]: e.target.valueAsNumber,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <div>
                <Label htmlFor={`${key}-range-basis`}>
                  照合範囲の根拠・設定理由（必須）
                </Label>
                <Textarea
                  id={`${key}-range-basis`}
                  maxLength={2000}
                  value={p.matchRangeDays.basis}
                  placeholder="例: 原著の対象が発症後7〜30日。または、管理者が設定した許容幅とその理由。"
                  onChange={e =>
                    change({
                      matchRangeDays: {
                        ...p.matchRangeDays!,
                        basis: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                開始日・終了日を含みます。この範囲は時期の確認用です。範囲外でも日数差だけでは集計から除外しません。研究対象の条件は別途「適用条件」で設定してください。
              </p>
            </>
          )}
        </div>
        <div>
          <Label htmlFor={`${key}-original`}>{title}：原著の時点表記（任意）</Label>
          <Input
            id={`${key}-original`}
            maxLength={1000}
            value={p.originalText}
            placeholder="例: 入院時、退院時、評価から4週後"
            onChange={e => change({ originalText: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor={`${key}-basis`}>{title}：根拠・換算方法（任意）</Label>
          <Textarea
            id={`${key}-basis`}
            maxLength={2000}
            value={p.basis}
            placeholder="例: 表1の入院時の発症後日数の平均値。特定できない場合はその理由。"
            onChange={e => change({ basis: e.target.value })}
          />
        </div>
      </fieldset>
    );
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        時間軸の入力は任意です。未入力でもプレビューの更新・登録ができます。
      </p>
      <p className="text-sm">
        評価時点・予測対象時点は、どちらも発症日を0日とした日数で登録します。照合範囲はそれぞれ個別に設定できます。
      </p>
      <div>
        <Label htmlFor="timeline-kind">時間軸の種類</Label>
        <select
          id="timeline-kind"
          className={selectStyle}
          value={value.kind}
          onChange={e =>
            onChange(
              e.target.value === "concurrent"
                ? {
                    version: 1,
                    anchor: "stroke_onset",
                    kind: "concurrent",
                    evaluation: value.evaluation,
                  }
                : { ...value, kind: "future", target: emptyPoint() }
            )
          }
        >
          <option value="future">将来の状態を予測</option>
          <option value="concurrent">同時点の状態を判別</option>
        </select>
      </div>
      {pointEditor("evaluation", "評価時点")}
      {value.kind === "future" ? (
        pointEditor("target", "予測対象時点")
      ) : (
        <p className="text-sm">
          判別対象は評価時点と同じです。将来予測とは区別して記録します。
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        原著が月単位なら1ヶ月＝30日の目安で日数に換算し、「概算」として元の表記・換算方法を残してください。平均・中央値はそれぞれの種類で登録します。入院時・退院時など発症からの日数を特定できない場合は「特定できない」を選択してください。
      </p>
      {timelineWarnings(value).map(w => (
        <p key={w} className="text-xs text-amber-800">
          {w}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        平均値・中央値や時期の違い・不明点がある場合は「評価時期の確認」を表示します。日数差や範囲の設定有無による集計の制限はありません。文献の集計除外設定・適用条件は引き続き反映します。
      </p>
    </div>
  );
}

export function TimelineSummary({
  definition,
  continuous = false,
}: {
  definition: unknown;
  continuous?: boolean;
}) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return null;
  const t = readTimeline(definition);
  if (!t)
    return (
      <p className="text-xs text-muted-foreground mt-2">
        時間軸：未登録（時点の一致は未確認）
      </p>
    );
  return (
    <div className="mt-2 text-xs space-y-1 rounded border p-2">
      <p className="font-medium">
        {t.kind === "future" ? "将来予測" : "同時点の判別"}
      </p>
      <p>評価時点：{formatTimepoint(t.evaluation)}{t.evaluation.originalText && ` / 原著：${t.evaluation.originalText}`}</p>
      <p>アウトカム測定時点：{t.target ? formatTimepoint(t.target) : "評価時点と同じ"}{t.target?.originalText && ` / 原著：${t.target.originalText}`}</p>
      <div className="space-y-1">
        {[
          ["評価", t.evaluation],
          ["予測対象", t.target],
        ].map(([label, point]) =>
          point && typeof point !== "string" && formatMatchRange(point) ? (
            <p key={String(label)}>
              {String(label)}の{formatMatchRange(point)}
            </p>
          ) : null
        )}
      </div>
      <details>
        <summary className="cursor-pointer">時間軸の根拠</summary>
        {[
          ["評価時点", t.evaluation],
          ["予測対象時点", t.target],
        ].map(([label, p]) =>
          p && typeof p !== "string" ? (
            <p key={String(label)} className="mt-1">
              {String(label)} / 原著: {p.originalText || "未入力"} / 根拠: {p.basis || "未入力"}
              {p.originalMonthValue !== undefined && (
                <>
                  {" "}
                  / 旧データの{p.originalMonthValue}
                  ヶ月を1ヶ月＝30日の目安で換算
                </>
              )}
              {p.matchRangeDays && (
                <> / 照合範囲の根拠: {p.matchRangeDays.basis}</>
              )}
            </p>
          ) : null
        )}
      </details>
      {timelineWarnings(t, continuous).map(w => (
        <p key={w} className="text-amber-800">
          {w}
        </p>
      ))}
    </div>
  );
}
