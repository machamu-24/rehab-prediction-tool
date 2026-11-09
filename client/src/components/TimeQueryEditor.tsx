import type { TimeQuery } from "@shared/literatureTimeline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TimeQueryEditor({
  value,
  onChange,
}: {
  value: TimeQuery;
  onChange: (q: TimeQuery) => void;
}) {
  return (
    <div className="space-y-3 border-t pt-3">
      <Label htmlFor="query-kind">照合する時間軸（発症日＝0日）</Label>
      <select
        id="query-kind"
        className="w-full border rounded-md p-2"
        value={value.kind}
        onChange={e =>
          onChange({
            kind: e.target.value as TimeQuery["kind"],
            evaluation: value.evaluation,
          })
        }
      >
        <option value="future">将来予測</option>
        <option value="concurrent">同時点の判別</option>
      </select>
      {(
        ["evaluation", ...(value.kind === "future" ? ["target"] : [])] as const
      ).map(key => {
        const field = key as "evaluation" | "target";
        const point = value[field];
        return (
          <div key={key} className="space-y-1">
            <Label htmlFor={`query-${key}`}>
              {key === "evaluation" ? "評価値を測定した時点" : "予測したい時点"}
              （発症から）
            </Label>
            <div className="flex gap-2">
              <Input
                id={`query-${key}`}
                type="number"
                min={0}
                step="any"
                placeholder="未指定"
                value={point?.value ?? ""}
                onChange={e =>
                  onChange({
                    ...value,
                    [field]:
                      e.target.value === ""
                        ? undefined
                        : {
                            ...(point ?? { unit: "day", precision: "exact" }),
                            value: e.target.valueAsNumber,
                          },
                  })
                }
              />
              <span className="self-center text-sm shrink-0">日</span>
              <select
                aria-label={`${key === "evaluation" ? "評価" : "予測対象"}時点の精度`}
                className="border rounded-md"
                value={point?.precision ?? "exact"}
                disabled={!point}
                onChange={e =>
                  onChange({
                    ...value,
                    [field]: { ...point!, precision: e.target.value },
                  })
                }
              >
                <option value="exact">明確</option>
                <option value="approximate">概算</option>
              </select>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        どちらも発症日を0日とした日数です。「今から何日後」ではありません。日数差による集計の制限は設けません。平均値・中央値や時期の違い・不明点がある場合は「評価時期の確認」を表示します。
      </p>
    </div>
  );
}
