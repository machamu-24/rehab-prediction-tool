import { describe, expect, it } from "vitest";
import {
  classifyPatientScoreInput,
  getPatientScoreRange,
  omitInvalidPatientScores,
} from "../shared/patientScoreRanges";
import { patientInputsSchema } from "../shared/patientValidation";
import { PATIENT_FIELDS } from "../client/src/lib/patientFields";

const ranges = [
  ["bbs_score", 0, 56],
  ["fbs_score", 0, 56],
  ["admission_bbs_score", 0, 56],
  ["mmse_score", 0, 30],
  ["admission_mmse_score", 0, 30],
  ["cba_score", 6, 30],
  ["admission_cba_score", 6, 30],
  ["fim_motor_total", 13, 91],
  ["fim_motor", 13, 91],
  ["admission_fim_motor_total", 13, 91],
  ["fim_cognitive_total", 5, 35],
  ["fim_cognitive", 5, 35],
  ["admission_fim_cognitive_total", 5, 35],
  ["care_level", 0, 5],
  ["admission_care_level", 0, 5],
  ["admission_fim_walk", 1, 7],
  ["admission_gcs", 3, 15],
  ["prestroke_mrs", 0, 5],
  ["fugl_meyer_lower", 0, 34],
] as const;

describe("測定項目の入力範囲", () => {
  it.each(ranges)("%sは%d〜%dの整数を入力・計算できる", (field, min, max) => {
    const range = getPatientScoreRange(field)!;
    expect(range).toEqual({ min, max });
    for (const value of [min, max]) {
      expect(classifyPatientScoreInput(String(value), range)).toBe("valid");
      expect(patientInputsSchema.safeParse({ [field]: value }).success).toBe(
        true
      );
    }
    for (const value of [min - 1, max + 1, min + 0.5]) {
      expect(classifyPatientScoreInput(String(value), range)).not.toBe("valid");
      expect(patientInputsSchema.safeParse({ [field]: value }).success).toBe(
        false
      );
    }
    expect(classifyPatientScoreInput("", range)).toBe("empty");
    expect(patientInputsSchema.safeParse({}).success).toBe(true);
  });

  it("FIM運動13・91やCBA30を1桁ずつ入力でき、未完成の桁は点数扱いしない", () => {
    const motor = getPatientScoreRange("fim_motor_total")!;
    expect(
      ["1", "13"].map(value => classifyPatientScoreInput(value, motor))
    ).toEqual(["partial", "valid"]);
    expect(
      ["9", "91"].map(value => classifyPatientScoreInput(value, motor))
    ).toEqual(["partial", "valid"]);
    expect(classifyPatientScoreInput("12", motor)).toBe("invalid");
    expect(classifyPatientScoreInput("92", motor)).toBe("invalid");
    const cba = getPatientScoreRange("cba_score")!;
    expect(
      ["3", "30"].map(value => classifyPatientScoreInput(value, cba))
    ).toEqual(["partial", "valid"]);
    expect(classifyPatientScoreInput("5", cba)).toBe("invalid");
  });

  it.each([
    "57",
    "999",
    "-1",
    "1.5",
    "1e1",
    "+10",
    " 10 ",
    "01",
    "NaN",
    "Infinity",
    "１０",
    "abc",
  ])("BBSへの不正な入力・貼り付け%sを受け付けない", value =>
    expect(
      classifyPatientScoreInput(value, getPatientScoreRange("bbs_score")!)
    ).toBe("invalid")
  );

  it("古い下書きの範囲外値・未完成値を復元せず、0点・空欄・小数の歩行速度・負の変化量を保持する", () => {
    const draft = {
      bbs_score: "57",
      admission_bbs_score: 56,
      mmse_score: 0,
      cba_score: "3",
      fim_motor_total: 12,
      admission_fim_motor_total: "91",
      fim_cognitive_total: "35",
      care_level: "0",
      admission_care_level: true,
      admission_fim_walk: "",
      fugl_meyer_lower: 34,
      walk_speed_10m: "0.65",
      delta_fim_motor: "-12",
      diabetes: false,
    };
    const original = structuredClone(draft);
    expect(omitInvalidPatientScores(draft)).toEqual({
      admission_bbs_score: 56,
      mmse_score: 0,
      admission_fim_motor_total: "91",
      fim_cognitive_total: "35",
      care_level: "0",
      admission_fim_walk: "",
      fugl_meyer_lower: 34,
      walk_speed_10m: "0.65",
      delta_fim_motor: "-12",
      diabetes: false,
    });
    expect(draft).toEqual(original);
    expect(getPatientScoreRange("walk_speed_10m")).toBeUndefined();
    expect(getPatientScoreRange("delta_fim_motor")).toBeUndefined();
    expect(getPatientScoreRange("constructor")).toBeUndefined();
  });

  it("入院時FIM歩行はFIM運動・認知の次、要介護認定区分は最後に表示する", () => {
    const admission = PATIENT_FIELDS.find(section =>
      section.fields.some(field => field.key === "admission_fim_walk")
    )!;
    const keys = admission.fields.map(field => field.key);
    expect(keys.indexOf("admission_fim_walk")).toBe(
      keys.indexOf("admission_fim_cognitive_total") + 1
    );
    expect(keys.at(-1)).toBe("admission_care_level");
    const fields = PATIENT_FIELDS.flatMap(section => section.fields);
    for (const field of fields) {
      const range = getPatientScoreRange(field.key);
      if (range)
        expect(field.placeholder).toContain(`${range.min}〜${range.max}`);
    }
  });
});
