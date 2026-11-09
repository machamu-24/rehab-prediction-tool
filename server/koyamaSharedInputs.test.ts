import { describe, expect, it } from "vitest";
import { koyamaSharedInputs } from "../client/src/lib/koyamaSharedInputs";
import { createKoyamaRule } from "../scripts/lib/koyama-2005.mjs";
import type { LiteratureRule } from "../drizzle/schema";
import type { TimeQuery } from "../shared/literatureTimeline";
import { patientInputsSchema } from "../shared/patientValidation";
import { predictionTimeContext } from "../client/src/lib/predictionTimeContext";
import { runEngine } from "./ruleEngine";

const query: TimeQuery = { kind: "future", target: { value: 90, unit: "day", precision: "exact" } };

describe("Koyamaフォームの重複入力の自動反映", () => {
  it("入力済みの入院日数・入院時総得点・予測対象日を反映し、元の入力を変更しない", () => {
    const entered = { days_onset_to_admission: "30", admission_fim_total: "40" };
    expect(koyamaSharedInputs(entered, query)).toEqual({ ...entered, koyama_day_a: 30, koyama_fim_total_a: 40, koyama_target_day: 90 });
    expect(entered).toEqual({ days_onset_to_admission: "30", admission_fim_total: "40" });
  });

  it("自動反映中は元の欄の変更・削除と下書きの復元に追従する", () => {
    const entered = { days_onset_to_admission: "30", admission_fim_total: "40" };
    const restored = JSON.parse(JSON.stringify(entered));
    expect(koyamaSharedInputs(restored, query).koyama_fim_total_a).toBe(40);
    expect(koyamaSharedInputs({ ...entered, days_onset_to_admission: "35", admission_fim_total: "50" }, { ...query, target: { ...query.target!, value: 120 } })).toMatchObject({ koyama_day_a: 35, koyama_fim_total_a: 50, koyama_target_day: 120 });
    const cleared = koyamaSharedInputs({ days_onset_to_admission: "", admission_fim_total: "" }, { kind: "future" });
    for (const field of ["koyama_day_a", "koyama_fim_total_a", "koyama_target_day"])
      expect(cleared[field]).toBeUndefined();
  });

  it("専用欄の個別入力・明示的な空欄を優先し、個別入力を解除すると再び反映する", () => {
    const entered = { days_onset_to_admission: 30, admission_fim_total: 40, koyama_day_a: 35, koyama_fim_total_a: "", koyama_target_day: 120 };
    expect(koyamaSharedInputs(entered, query)).toEqual(entered);
    const { koyama_day_a, koyama_fim_total_a, koyama_target_day, ...linked } = entered;
    expect(koyamaSharedInputs(linked, query)).toMatchObject({ koyama_day_a: 30, koyama_fim_total_a: 40, koyama_target_day: 90 });
  });

  it("現在値や運動FIMを総得点・再評価値として流用しない", () => {
    const result = koyamaSharedInputs({ days_since_onset: 45, fim_total: 55, admission_fim_motor_total: 40 }, query);
    for (const field of ["koyama_day_a", "koyama_fim_total_a", "koyama_day_b", "koyama_fim_total_b"])
      expect(result[field]).toBeUndefined();
  });

  it("無効な値や月単位・同時点の時点指定は専用の日数へ反映しない", () => {
    for (const value of ["", false, 0, 30.5, -1, Infinity, "abc"])
      expect(koyamaSharedInputs({ days_onset_to_admission: value }, query).koyama_day_a).toBeUndefined();
    for (const value of [17, 127, 40.5, "4", true])
      expect(koyamaSharedInputs({ admission_fim_total: value }, query).koyama_fim_total_a).toBeUndefined();
    for (const time of [{ kind: "concurrent" as const }, { ...query, target: { ...query.target!, value: 3, unit: "month" as const } }, { ...query, target: { ...query.target!, value: 90.5 } }])
      expect(koyamaSharedInputs({}, time).koyama_target_day).toBeUndefined();
  });

  it("専用欄の重複3項目を手入力せずに検証・予測・履歴用入力を作成できる", () => {
    const rule = { ...createKoyamaRule(4), id: 1 } as unknown as LiteratureRule;
    const entered = {
      days_onset_to_admission: 30, admission_fim_motor_total: 25, admission_fim_cognitive_total: 15,
      koyama_day_b: 45, koyama_fim_total_b: 55,
      admission_ward_type: "回復期リハビリテーション病棟", first_stroke: true,
      prestroke_adl_independent: true, supratentorial_stroke: true,
      admission_wheelchair: true, hemiparesis_present: true, stroke_type: "脳出血",
    };
    const inputs = patientInputsSchema.parse(koyamaSharedInputs(entered, query));
    expect(inputs).toMatchObject({ admission_fim_total: 40, koyama_day_a: 30, koyama_fim_total_a: 40, koyama_target_day: 90 });
    expect(runEngine([rule], inputs, predictionTimeContext([rule], inputs, query)).results[0]).toMatchObject({ status: "evaluated", numericValue: expect.closeTo(80.64266937027182, 10) });
  });
});
