import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavedInputsTable } from "../client/src/components/SavedInputsTable";
import {
  formatSavedValue,
  groupSavedInputs,
  prepareSavedAssessment,
  readReuseContext,
  readReuseRequest,
  savedFieldDefinitions,
  type SavedAssessment,
} from "../client/src/lib/savedAssessment";
import { runEngine } from "./ruleEngine";
import type { LiteratureRule } from "../drizzle/schema";

const record: SavedAssessment = {
  id: 42,
  outcomeId: 1,
  caseId: "TEST-CASE-001",
  assessedOn: "2026-11-08",
  assessmentPhase: "week3",
  timeContext: {
    kind: "future",
    evaluation: { value: 51, unit: "day", precision: "exact" },
    target: { value: 120, unit: "day", precision: "exact" },
  },
  patientInputs: {
    sex: "女性",
    stroke_type: "脳出血",
    age: 70,
    days_onset_to_admission: 30,
    days_since_onset: 51,
    admission_age: 70,
    admission_bbs_score: 0,
    admission_fim_motor_total: 40,
    admission_fim_cognitive_total: 20,
    admission_fim_total: 60,
    admission_sit_up_independent: false,
    first_stroke: true,
    bbs_score: 25,
    fim_motor_total: 60,
    fim_cognitive_total: 25,
    fim_total: 85,
    spatial_neglect: false,
    delta_bbs: 10,
    delta_fim_motor: 20,
    diabetes: false,
    week3_fim_motor_total: 60,
    koyama_day_a: 30,
    koyama_fim_total_a: 60,
    koyama_day_b: 51,
    koyama_fim_total_b: 85,
    koyama_target_day: 120,
  },
};

describe("履歴の保存入力を読む", () => {
  it("日本語の項目名・単位・入院時と現在の区別を表で表示する", () => {
    const html = renderToStaticMarkup(
      createElement(SavedInputsTable, { inputs: record.patientInputs })
    );
    for (const text of [
      "入院時評価",
      "入院時 FIM 運動項目合計",
      "40 点",
      "60 点",
      "0 点",
      "介助必要",
      "女性",
      "脳出血",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("<pre");
    expect(html).not.toContain('"admission_fim_motor_total"');
  });
  it("保存時の合計・範囲外値も表示時には再計算せずそのまま示す", () => {
    const inputs = {
      ...record.patientInputs,
      admission_fim_total: 70,
      bbs_score: 999,
    };
    const groups = groupSavedInputs(inputs);
    expect(
      groups
        .flatMap(group => group.rows)
        .find(row => row.key === "admission_fim_total")?.value
    ).toBe("70 点");
    expect(
      groups.flatMap(group => group.rows).find(row => row.key === "bbs_score")
        ?.value
    ).toBe("999 点");
    expect(inputs.admission_fim_total).toBe(70);
  });
  it("追加項目の名前を保存時の文献から補い、未知の値・未記録・0・falseを失わない", () => {
    const groups = groupSavedInputs(
      {
        new_measure: 0,
        unknown_flag: false,
        absent: null,
        blank: "",
        notes_field: "記録あり",
      },
      [
        {
          variables: [
            { field: "new_measure", fieldLabel: "追加評価", unit: "mm" },
          ],
        },
      ]
    );
    expect(groups[0].rows).toEqual(
      expect.arrayContaining([
        { key: "new_measure", label: "追加評価", value: "0 mm" },
        { key: "unknown_flag", label: "unknown_flag", value: "非該当" },
        { key: "absent", label: "absent", value: "未記録" },
        { key: "blank", label: "blank", value: "未入力" },
      ])
    );
    expect(
      formatSavedValue(
        false,
        savedFieldDefinitions.get("admission_sit_up_independent")
      )
    ).toBe("介助必要");
    expect(
      formatSavedValue(true, savedFieldDefinitions.get("continence"))
    ).toBe("該当");
    expect(formatSavedValue({ bbs_score: 0 })).toContain("0 点");
  });
  it("保存入力がない場合は空であることを表示する", () => {
    expect(
      renderToStaticMarkup(createElement(SavedInputsTable, { inputs: {} }))
    ).toContain("保存された評価項目はありません");
  });
});

describe("保存入力の再照合と次回評価への引継ぎ", () => {
  it("再照合は日付・時点・時間軸と0・falseを保持し、元の記録を変更しない", () => {
    const before = structuredClone(record);
    const prepared = prepareSavedAssessment(record, "repeat", "2026-11-09");
    expect(prepared).toMatchObject({
      inputs: record.patientInputs,
      caseId: record.caseId,
      assessedOn: "2026-11-08",
      assessmentPhase: "week3",
      timeContext: record.timeContext,
      warnings: [],
    });
    expect(record).toEqual(before);
  });
  it("次回評価は今回の測定値と予測日数を空欄にし、固定情報と既往評価を引き継ぐ", () => {
    const prepared = prepareSavedAssessment(record, "followup", "2026-11-09");
    expect(prepared).toMatchObject({
      caseId: record.caseId,
      assessedOn: "2026-11-09",
      assessmentPhase: "followup",
      timeContext: { kind: "future" },
    });
    for (const field of [
      "admission_age",
      "admission_bbs_score",
      "admission_sit_up_independent",
      "admission_fim_motor_total",
      "sex",
      "stroke_type",
      "days_onset_to_admission",
      "first_stroke",
      "week3_fim_motor_total",
      "koyama_day_a",
      "koyama_fim_total_a",
    ])
      expect(prepared.inputs[field], field).toEqual(
        record.patientInputs[field]
      );
    for (const field of [
      "age",
      "bbs_score",
      "fim_motor_total",
      "fim_cognitive_total",
      "fim_total",
      "days_since_onset",
      "spatial_neglect",
      "delta_bbs",
      "delta_fim_motor",
      "diabetes",
      "koyama_day_b",
      "koyama_fim_total_b",
      "koyama_target_day",
    ])
      expect(Object.hasOwn(prepared.inputs, field), field).toBe(false);
    expect(prepared.timeContext.evaluation).toBeUndefined();
    expect(prepared.timeContext.target).toBeUndefined();
  });
  it("日数が未記録の旧履歴に今日の日付を測定日として補わない", () => {
    const prepared = prepareSavedAssessment(
      {
        ...record,
        caseId: null,
        assessedOn: null,
        assessmentPhase: null,
        timeContext: null,
      },
      "repeat",
      "2026-11-09"
    );
    expect(prepared.assessedOn).toBe("");
    expect(prepared.caseId).toBe("");
    expect(prepared.timeContext).toEqual({ kind: "future" });
    expect(prepared.warnings.join(" ")).toContain("評価日が未記録");
    expect(prepared.warnings.join(" ")).toContain("評価時点が未記録");
    expect(prepared.warnings.join(" ")).toContain("時間軸が未記録");
  });
  it("不正な旧入力は読み込み時に案内し、履歴の表示値は変更しない", () => {
    const original = {
      ...record,
      patientInputs: {
        ...record.patientInputs,
        bbs_score: 999,
        admission_fim_total: 70,
        admission_fim_motor_total: "40",
        spatial_neglect: "false",
        unknown_object: { test: 1 },
      },
    };
    const prepared = prepareSavedAssessment(original, "repeat", "2026-11-09");
    expect(prepared.inputs.bbs_score).toBeUndefined();
    expect(prepared.inputs.spatial_neglect).toBeUndefined();
    expect(prepared.inputs.unknown_object).toBeUndefined();
    expect(prepared.inputs.admission_fim_motor_total).toBe(40);
    expect(prepared.inputs.admission_fim_total).toBe(60);
    expect(prepared.warnings.join(" ")).toContain("再計算");
    expect(prepared.warnings.join(" ")).toContain("空欄");
    expect(original.patientInputs.admission_fim_total).toBe(70);
    expect(original.patientInputs.bbs_score).toBe(999);
  });
  it("同時点判別の次回評価では種別だけ保持し、前回の日数をコピーしない", () => {
    const prepared = prepareSavedAssessment(
      {
        ...record,
        timeContext: {
          kind: "concurrent",
          evaluation: { value: 51, unit: "day", precision: "exact" },
        },
      },
      "followup",
      "2026-11-09"
    );
    expect(prepared.timeContext).toEqual({ kind: "concurrent" });
  });
  it("再照合は元の入力と同じ判定、次回評価は未測定項目を欠測として扱う", () => {
    const rule = {
      id: 1,
      name: "合成テスト",
      isActive: true,
      ruleType: "cutoff",
      applyConditions: [],
      consensusEligible: true,
      ruleDefinition: {
        type: "cutoff",
        field: "bbs_score",
        fieldLabel: "BBS",
        operator: ">=",
        threshold: 20,
        positiveMessage: "支持",
        negativeMessage: "困難",
      },
    } as unknown as LiteratureRule;
    const repeated = prepareSavedAssessment(record, "repeat", "2026-11-09");
    const following = prepareSavedAssessment(record, "followup", "2026-11-09");
    expect(runEngine([rule], repeated.inputs, repeated.timeContext)).toEqual(
      runEngine([rule], record.patientInputs, record.timeContext!)
    );
    expect(
      runEngine([rule], following.inputs, following.timeContext).results[0]
    ).toMatchObject({
      status: "missing_input",
      isPositive: null,
      probability: null,
    });
  });
  it("履歴へのリンクと下書きの参照元は明示された記録だけに限定する", () => {
    expect(readReuseRequest("?history=42&reuse=repeat")).toEqual({
      id: 42,
      mode: "repeat",
    });
    expect(readReuseRequest("history=42&reuse=followup")).toEqual({
      id: 42,
      mode: "followup",
    });
    for (const id of ["-1", "0", "1.5", "NaN", "9007199254740992", "abc"])
      expect(readReuseRequest(`history=${id}&reuse=repeat`)).toBeNull();
    expect(readReuseRequest("history=42&reuse=unknown")).toBeNull();
    expect(
      readReuseContext(JSON.parse(JSON.stringify({ record, mode: "followup" })))
    ).toEqual({ record, mode: "followup" });
    expect(
      readReuseContext({
        record: { id: 42, patientInputs: [] },
        mode: "repeat",
      })
    ).toBeNull();
    expect(readReuseContext(undefined)).toBeNull();
  });
});
