import { describe, expect, it } from "vitest";
import { getPredictionOutcomes, resolvePredictionOutcomeId } from "../shared/outcomeSelection";

const outcomes = [
  { id: 1, name: "歩行自立" }, { id: 2, name: "FIM運動項目" }, { id: 3, name: "地域歩行" }, { id: 4, name: "FIM総得点" },
  { id: 5, name: "発症90日後の運動FIM >61点" }, { id: 6, name: "退院時の運動FIM >61点" }, { id: 7, name: "退院時FIS身体自立度 ≥5" },
];
describe("照合画面のアウトカム選択", () => {
  it("FukudaをFIM運動項目にまとめ、保留のMaugeri専用項目を選択に表示しない", () => {
    expect(getPredictionOutcomes(outcomes).map(o => o.id)).toEqual([1, 2, 3, 4]);
    expect(outcomes).toHaveLength(7);
  });
  it("旧Fukudaの下書きはFIM運動へ移し、Maugeriと削除済みの選択は解除する", () => {
    expect(resolvePredictionOutcomeId(5, outcomes)).toBe(2);
    for (const id of [null, 6, 7, 99]) expect(resolvePredictionOutcomeId(id, outcomes)).toBeNull();
    expect(resolvePredictionOutcomeId(4, outcomes)).toBe(4);
    expect(resolvePredictionOutcomeId(5, outcomes.filter(o => o.id !== 2))).toBeNull();
  });
  it("新規の独自アウトカムは引き続き選べる", () => {
    expect(getPredictionOutcomes([...outcomes, { id: 9, name: "新しい評価" }]).at(-1)?.id).toBe(9);
  });
});
