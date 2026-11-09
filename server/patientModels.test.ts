import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PATIENT_MODELS,
  PATIENT_MODEL_PHASES,
  createPatientModelPreset,
} from "../shared/patientModels";
import {
  assessmentSchema,
  getInputsForAssessmentPhase,
} from "../shared/assessment";
import { timeQuerySchema } from "../shared/literatureTimeline";
import { patientInputsSchema } from "../shared/patientValidation";
import { PATIENT_FIELDS } from "../client/src/lib/patientFields";
import { koyamaSharedInputs } from "../client/src/lib/koyamaSharedInputs";
import { PatientModelPicker } from "../client/src/components/PatientModelPicker";
import { createIkeueRules } from "../scripts/lib/ikeue-2026.mjs";
import { createKoyamaRule } from "../scripts/lib/koyama-2005.mjs";
import { evaluateRule } from "./ruleEngine";
import type { LiteratureRule } from "../drizzle/schema";

const referenceDate = new Date(2026, 10, 9, 12);
const cases = PATIENT_MODELS.flatMap(model =>
  PATIENT_MODEL_PHASES.map(phase => ({ model, phase }))
);

describe("架空患者モデル", () => {
  it.each(cases)(
    "$model.id / $phase のFIMモデルは時点と対象条件に沿って照合できる",
    ({ model, phase }) => {
      const preset = createPatientModelPreset(model, phase, referenceDate);
      const inputs = koyamaSharedInputs(preset.inputs, preset.timeContext);
      const ikeueRules = createIkeueRules(2).map(
        (rule: object, index: number) => ({ ...rule, id: 70000 + index })
      ) as LiteratureRule[];
      const admissionResult = evaluateRule(ikeueRules[0], inputs);
      const week3Result = evaluateRule(ikeueRules[1], inputs);
      if (model.id === "SAMPLE-A") {
        expect(admissionResult.status).toBe("outside");
        expect(week3Result.status).toBe("outside");
      } else {
        expect(admissionResult.status).toBe("evaluated");
        expect(Number.isFinite(admissionResult.numericValue)).toBe(true);
        expect(week3Result.status).toBe(
          phase === "admission" ? "missing_input" : "evaluated"
        );
      }
      const koyamaRule = {
        ...createKoyamaRule(2),
        id: 71000,
      } as LiteratureRule;
      const koyamaResult = evaluateRule(koyamaRule, inputs);
      expect(koyamaResult.status).toBe(
        phase === "admission"
          ? "missing_input"
          : model.id === "SAMPLE-A"
            ? "outside"
            : "evaluated"
      );
      if (phase !== "admission" && model.id === "SAMPLE-A") {
        expect(koyamaResult.numericValue).toBeNull();
        expect(koyamaResult.unavailableReason).toContain("範囲（18〜126点）外");
      } else if (phase !== "admission")
        expect(Number.isFinite(koyamaResult.numericValue)).toBe(true);
    }
  );
  it.each(cases)(
    "$model.id / $phase はフォームとAPIで利用できる",
    ({ model, phase }) => {
      const preset = createPatientModelPreset(model, phase, referenceDate);
      expect(patientInputsSchema.safeParse(preset.inputs).success).toBe(true);
      expect(assessmentSchema.safeParse(preset).success).toBe(true);
      expect(timeQuerySchema.safeParse(preset.timeContext).success).toBe(true);
      expect(getInputsForAssessmentPhase(preset.inputs, phase)).toEqual(
        preset.inputs
      );
      const fields = new Map(
        PATIENT_FIELDS.flatMap(section =>
          section.fields.map(field => [field.key, field] as const)
        )
      );
      for (const [key, value] of Object.entries(preset.inputs)) {
        expect(fields.has(key), `画面で編集できる項目: ${key}`).toBe(true);
        const field = fields.get(key)!;
        if (field.type === "select") expect(field.options).toContain(value);
        if (field.type === "boolean") expect(typeof value).toBe("boolean");
        if (field.type === "number") expect(typeof value).toBe("number");
      }
      expect(preset.inputs.fim_total).toBe(
        Number(preset.inputs.fim_motor_total) +
          Number(preset.inputs.fim_cognitive_total)
      );
      expect(preset.inputs.admission_fim_total).toBe(
        model.observations.admission.motor +
          model.observations.admission.cognitive
      );
    }
  );

  it.each(PATIENT_MODELS)(
    "$id の入院時情報・評価日・変化量は3時点で整合する",
    model => {
      const visits = PATIENT_MODEL_PHASES.map(phase =>
        createPatientModelPreset(model, phase, referenceDate)
      );
      expect(visits.map(visit => visit.assessedOn)).toEqual([
        "2026-10-10",
        "2026-10-31",
        "2026-11-09",
      ]);
      expect(visits.map(visit => visit.inputs.days_since_onset)).toEqual([
        30, 51, 60,
      ]);
      for (const visit of visits) {
        expect(visit.caseId).toBe(model.id);
        for (const key of Object.keys(visits[0].inputs).filter(key =>
          key.startsWith("admission_")
        ))
          expect(visit.inputs[key]).toEqual(visits[0].inputs[key]);
      }
      expect(visits[0].inputs).not.toHaveProperty("week3_fim_motor_total");
      expect(visits[0].inputs).not.toHaveProperty("koyama_fim_total_b");
      expect(visits[1].inputs).not.toHaveProperty("delta_bbs");
      expect(visits[2].inputs.week3_fim_motor_total).toBe(
        model.observations.week3.motor
      );
      expect(visits[2].inputs.delta_bbs).toBe(
        model.observations.month1.bbs - model.observations.admission.bbs
      );
      expect(visits[2].inputs.delta_fim_motor).toBe(
        model.observations.month1.motor - model.observations.admission.motor
      );
      expect(visits[2].inputs.delta_fim_cognitive).toBe(
        model.observations.month1.cognitive -
          model.observations.admission.cognitive
      );
      for (const visit of visits.slice(1)) {
        const inputs = koyamaSharedInputs(visit.inputs, visit.timeContext);
        expect(inputs.koyama_day_a).toBe(30);
        expect(inputs.koyama_fim_total_a).toBe(
          visit.inputs.admission_fim_total
        );
        expect(inputs.koyama_day_b).toBe(visit.inputs.days_since_onset);
        expect(inputs.koyama_fim_total_b).toBe(visit.inputs.fim_total);
        expect(inputs.koyama_target_day).toBe(120);
      }
    }
  );

  it("未測定の歩行速度・TUGを0点として補完しない", () => {
    const model = PATIENT_MODELS.find(model => model.id === "SAMPLE-D")!;
    for (const phase of PATIENT_MODEL_PHASES) {
      const { inputs } = createPatientModelPreset(model, phase, referenceDate);
      expect(inputs).not.toHaveProperty("walk_speed_10m");
      expect(inputs).not.toHaveProperty("tug_seconds");
    }
  });

  it("読み込み後の編集でモデルの元データを変更しない", () => {
    const first = createPatientModelPreset(
      PATIENT_MODELS[0],
      "month1",
      referenceDate
    );
    first.inputs.bbs_score = 0;
    expect(
      createPatientModelPreset(PATIENT_MODELS[0], "month1", referenceDate)
        .inputs.bbs_score
    ).toBe(53);
    expect(new Set(PATIENT_MODELS.map(model => model.id)).size).toBe(4);
  });

  it("選択欄に4症例・3評価時点と上書きの説明を表示し、照合中は無効にする", () => {
    const html = renderToStaticMarkup(
      createElement(PatientModelPicker, { onLoad: () => {}, disabled: true })
    );
    expect(html.match(/<option /g)).toHaveLength(7);
    expect(html).toContain("12パターン");
    expect(html).toContain("置き換えます");
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});
