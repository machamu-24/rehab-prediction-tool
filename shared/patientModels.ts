import type { AssessmentPhase } from "./assessment";
import type { TimeQuery } from "./literatureTimeline";
import {
  withCalculatedFimTotals,
  type FimFormInputs,
} from "./patientFimTotals";

export const PATIENT_MODEL_PHASES = ["admission", "week3", "month1"] as const;
export type PatientModelPhase = (typeof PATIENT_MODEL_PHASES)[number];
const PHASE_DAYS: Record<PatientModelPhase, number> = {
  admission: 0,
  week3: 21,
  month1: 30,
};

type Observation = {
  bbs: number;
  motor: number;
  cognitive: number;
  mmse: number;
  cba: number;
  fma: number;
  brs: number;
  tct: number;
  knee: number;
  kneeTotal: number;
  walking: "歩行自立" | "補助歩行" | "非歩行";
  fac: number;
  fimWalk: number;
  sitUp: boolean;
  neglect: boolean;
  cognitiveImpairment: boolean;
  speed?: number;
  tug?: number;
};

export type PatientModel = {
  id: string;
  name: string;
  description: string;
  age: number;
  sex: "男性" | "女性";
  strokeType: "脳梗塞" | "脳出血";
  albumin: number;
  upperBrs: number;
  observations: Record<PatientModelPhase, Observation>;
};

// All observations are invented for comparing application behavior. They are
// neither measured patient records nor expected treatment/recovery trajectories.
export const PATIENT_MODELS: readonly PatientModel[] = [
  {
    id: "SAMPLE-A",
    name: "A：軽度の運動障害・認知機能保持",
    age: 58,
    sex: "男性",
    strokeType: "脳梗塞",
    albumin: 4.0,
    upperBrs: 5,
    description:
      "入院時は見守り歩行。経過例では歩行速度・バランス・ADLが向上する設定です。",
    observations: {
      admission: {
        bbs: 42,
        motor: 65,
        cognitive: 33,
        mmse: 29,
        cba: 29,
        fma: 29,
        brs: 5,
        tct: 100,
        knee: 0.65,
        kneeTotal: 1.65,
        walking: "補助歩行",
        fac: 3,
        fimWalk: 5,
        sitUp: true,
        neglect: false,
        cognitiveImpairment: false,
        speed: 0.55,
        tug: 19,
      },
      week3: {
        bbs: 49,
        motor: 78,
        cognitive: 34,
        mmse: 29,
        cba: 29,
        fma: 32,
        brs: 6,
        tct: 100,
        knee: 0.8,
        kneeTotal: 1.9,
        walking: "歩行自立",
        fac: 4,
        fimWalk: 6,
        sitUp: true,
        neglect: false,
        cognitiveImpairment: false,
        speed: 0.85,
        tug: 13,
      },
      month1: {
        bbs: 53,
        motor: 85,
        cognitive: 35,
        mmse: 30,
        cba: 30,
        fma: 33,
        brs: 6,
        tct: 100,
        knee: 0.9,
        kneeTotal: 2.05,
        walking: "歩行自立",
        fac: 5,
        fimWalk: 7,
        sitUp: true,
        neglect: false,
        cognitiveImpairment: false,
        speed: 1.05,
        tug: 10,
      },
    },
  },
  {
    id: "SAMPLE-B",
    name: "B：中等度の運動障害・改善が大きい経過",
    age: 68,
    sex: "女性",
    strokeType: "脳出血",
    albumin: 3.7,
    upperBrs: 3,
    description:
      "入院時は身体介助で歩行。1ヶ月後のBBS・FIMの変化量を比較する設定です。",
    observations: {
      admission: {
        bbs: 18,
        motor: 32,
        cognitive: 23,
        mmse: 24,
        cba: 24,
        fma: 15,
        brs: 3,
        tct: 49,
        knee: 0.25,
        kneeTotal: 1.0,
        walking: "補助歩行",
        fac: 1,
        fimWalk: 2,
        sitUp: false,
        neglect: false,
        cognitiveImpairment: false,
      },
      week3: {
        bbs: 33,
        motor: 49,
        cognitive: 26,
        mmse: 26,
        cba: 26,
        fma: 23,
        brs: 4,
        tct: 74,
        knee: 0.45,
        kneeTotal: 1.3,
        walking: "補助歩行",
        fac: 3,
        fimWalk: 5,
        sitUp: true,
        neglect: false,
        cognitiveImpairment: false,
        speed: 0.35,
        tug: 32,
      },
      month1: {
        bbs: 41,
        motor: 60,
        cognitive: 28,
        mmse: 27,
        cba: 27,
        fma: 27,
        brs: 5,
        tct: 100,
        knee: 0.58,
        kneeTotal: 1.5,
        walking: "歩行自立",
        fac: 4,
        fimWalk: 6,
        sitUp: true,
        neglect: false,
        cognitiveImpairment: false,
        speed: 0.6,
        tug: 22,
      },
    },
  },
  {
    id: "SAMPLE-C",
    name: "C：認知障害・半側空間無視を伴う",
    age: 74,
    sex: "男性",
    strokeType: "脳梗塞",
    albumin: 3.5,
    upperBrs: 4,
    description:
      "運動機能の変化とともに、認知障害・半側空間無視が残る経過を照合する設定です。",
    observations: {
      admission: {
        bbs: 25,
        motor: 38,
        cognitive: 15,
        mmse: 16,
        cba: 15,
        fma: 21,
        brs: 4,
        tct: 74,
        knee: 0.42,
        kneeTotal: 1.2,
        walking: "補助歩行",
        fac: 2,
        fimWalk: 3,
        sitUp: true,
        neglect: true,
        cognitiveImpairment: true,
      },
      week3: {
        bbs: 33,
        motor: 47,
        cognitive: 17,
        mmse: 18,
        cba: 17,
        fma: 24,
        brs: 4,
        tct: 100,
        knee: 0.5,
        kneeTotal: 1.35,
        walking: "補助歩行",
        fac: 2,
        fimWalk: 4,
        sitUp: true,
        neglect: true,
        cognitiveImpairment: true,
      },
      month1: {
        bbs: 38,
        motor: 54,
        cognitive: 18,
        mmse: 19,
        cba: 18,
        fma: 26,
        brs: 5,
        tct: 100,
        knee: 0.56,
        kneeTotal: 1.48,
        walking: "補助歩行",
        fac: 3,
        fimWalk: 5,
        sitUp: true,
        neglect: true,
        cognitiveImpairment: true,
        speed: 0.42,
        tug: 30,
      },
    },
  },
  {
    id: "SAMPLE-D",
    name: "D：重度の運動障害・変化が小さい経過",
    age: 83,
    sex: "女性",
    strokeType: "脳出血",
    albumin: 3.1,
    upperBrs: 2,
    description:
      "入院時は非歩行。歩行速度・TUGは未測定のまま、低いADLと小さい変化量を照合する設定です。",
    observations: {
      admission: {
        bbs: 3,
        motor: 18,
        cognitive: 12,
        mmse: 12,
        cba: 12,
        fma: 5,
        brs: 2,
        tct: 0,
        knee: 0.08,
        kneeTotal: 0.55,
        walking: "非歩行",
        fac: 0,
        fimWalk: 1,
        sitUp: false,
        neglect: true,
        cognitiveImpairment: true,
      },
      week3: {
        bbs: 5,
        motor: 21,
        cognitive: 13,
        mmse: 13,
        cba: 13,
        fma: 7,
        brs: 2,
        tct: 12,
        knee: 0.12,
        kneeTotal: 0.62,
        walking: "非歩行",
        fac: 0,
        fimWalk: 1,
        sitUp: false,
        neglect: true,
        cognitiveImpairment: true,
      },
      month1: {
        bbs: 7,
        motor: 24,
        cognitive: 13,
        mmse: 13,
        cba: 13,
        fma: 8,
        brs: 2,
        tct: 24,
        knee: 0.15,
        kneeTotal: 0.68,
        walking: "補助歩行",
        fac: 1,
        fimWalk: 2,
        sitUp: false,
        neglect: true,
        cognitiveImpairment: true,
      },
    },
  },
];

function observationInputs(o: Observation): FimFormInputs {
  return {
    bbs_score: o.bbs,
    fim_motor_total: o.motor,
    fim_cognitive_total: o.cognitive,
    mmse_score: o.mmse,
    cba_score: o.cba,
    fugl_meyer_lower: o.fma,
    brunnstrom_lower: o.brs,
    tct_score: o.tct,
    knee_ext_paretic_nm_kg: o.knee,
    knee_ext_total_nm_kg: o.kneeTotal,
    walking_status: o.walking,
    sit_up_independent: o.sitUp,
    spatial_neglect: o.neglect,
    cognitive_impairment: o.cognitiveImpairment,
    ...(o.speed === undefined ? {} : { walk_speed_10m: o.speed }),
    ...(o.tug === undefined ? {} : { tug_seconds: o.tug }),
  };
}

/** Use the same case ID and fixed admission observations across all three visits. */
export function createPatientModelPreset(
  model: PatientModel,
  phase: PatientModelPhase,
  referenceDate = new Date()
): {
  inputs: FimFormInputs;
  caseId: string;
  assessedOn: string;
  assessmentPhase: AssessmentPhase;
  timeContext: TimeQuery;
} {
  const admission = model.observations.admission;
  const current = model.observations[phase];
  const elapsed = PHASE_DAYS[phase];
  const inputs: FimFormInputs = {
    ...observationInputs(current),
    age: model.age,
    admission_age: model.age,
    sex: model.sex,
    stroke_type: model.strokeType,
    days_since_onset: 30 + elapsed,
    days_onset_to_admission: 30,
    first_stroke: true,
    hemiparesis_present: true,
    unilateral_hemispheric_stroke: true,
    prestroke_adl_independent: true,
    prestroke_mrs: 0,
    supratentorial_stroke: true,
    other_neuropsychiatric_condition: false,
    stroke_onset_concurrent_disease: false,
    admission_ward_type: "回復期リハビリテーション病棟",
    admission_clinically_stable: true,
    admission_gcs: 15,
    admission_complication: false,
    admission_albumin_g_dl: model.albumin,
    admission_brs_upper: model.upperBrs,
    admission_bbs_score: admission.bbs,
    admission_fim_motor_total: admission.motor,
    admission_fim_cognitive_total: admission.cognitive,
    admission_fim_walk: admission.fimWalk,
    admission_mmse_score: admission.mmse,
    admission_cba_score: admission.cba,
    admission_fugl_meyer_lower: admission.fma,
    admission_fac: admission.fac,
    admission_walking_status: admission.walking,
    admission_sit_up_independent: admission.sitUp,
    admission_spatial_neglect: admission.neglect,
    admission_cognitive_impairment: admission.cognitiveImpairment,
    admission_wheelchair: true,
    admission_unassisted_5m: false,
  };
  if (phase !== "admission") {
    inputs.week3_fim_motor_total = model.observations.week3.motor;
    inputs.koyama_day_b = 30 + elapsed;
    inputs.koyama_fim_total_b = current.motor + current.cognitive;
    inputs.koyama_target_day = 120;
  }
  if (phase === "month1") {
    inputs.delta_bbs = current.bbs - admission.bbs;
    inputs.delta_fim_motor = current.motor - admission.motor;
    inputs.delta_fim_cognitive = current.cognitive - admission.cognitive;
  }
  // Anchor the one-month visit to today, keeping all visits chronologically
  // ordered even when users load the presets in a different order.
  const date = new Date(referenceDate);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - 30 + elapsed);
  const assessedOn = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return {
    inputs: withCalculatedFimTotals(inputs),
    caseId: model.id,
    assessedOn,
    assessmentPhase: phase,
    // A discharge day is not assumed. The Koyama model has its own explicit X.
    timeContext: {
      kind: "future",
      evaluation: { value: 30 + elapsed, unit: "day", precision: "exact" },
    },
  };
}
