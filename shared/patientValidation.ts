import { z } from "zod";
import { getPatientScoreRange } from "./patientScoreRanges";

const score = (min: number, max: number) => z.number().finite().int().min(min).max(max).optional();
const measuredScore = (field: string) => {
  const range = getPatientScoreRange(field);
  if (!range) throw new Error(`点数範囲が未設定です: ${field}`);
  return score(range.min, range.max);
};
const nonnegative = z.number().finite().min(0).optional();
const flag = z.boolean().optional();

export const patientInputsSchema = z.object({
  age: score(0, 130), sex: z.enum(["男性", "女性"]).optional(),
  days_since_onset: score(0, 100000), days_post_stroke: score(0, 100000), days_onset_to_admission: score(0, 100000),
  months_since_onset: nonnegative,
  admission_albumin_g_dl: nonnegative, admission_brs_upper: measuredScore("admission_brs_upper"), stroke_onset_concurrent_disease: flag,
  admission_fim_total: measuredScore("admission_fim_total"), week3_fim_motor_total: measuredScore("week3_fim_motor_total"),
  admission_age: score(0, 130), admission_bbs_score: measuredScore("admission_bbs_score"), admission_mmse_score: measuredScore("admission_mmse_score"),
  admission_fim_motor_total: measuredScore("admission_fim_motor_total"), admission_fim_cognitive_total: measuredScore("admission_fim_cognitive_total"), admission_fim_walk: measuredScore("admission_fim_walk"),
  admission_cba_score: measuredScore("admission_cba_score"), admission_care_level: measuredScore("admission_care_level"),
  admission_sit_up_independent: flag, admission_cognitive_impairment: flag, admission_spatial_neglect: flag,
  admission_fugl_meyer_lower: measuredScore("admission_fugl_meyer_lower"), admission_fac: measuredScore("admission_fac"),
  first_stroke: flag, unilateral_hemispheric_stroke: flag,
  prestroke_adl_independent: flag, supratentorial_stroke: flag, admission_wheelchair: flag, hemiparesis_present: flag,
  koyama_day_a: score(1, 100000), koyama_day_b: score(1, 100000), koyama_target_day: score(1, 100000),
  koyama_fim_total_a: measuredScore("koyama_fim_total_a"), koyama_fim_total_b: measuredScore("koyama_fim_total_b"),
  other_neuropsychiatric_condition: flag, admission_clinically_stable: flag,
  admission_unassisted_5m: flag, admission_walking_status: z.enum(["歩行自立", "補助歩行", "非歩行"]).optional(),
  admission_ward_type: z.enum(["急性期病棟", "回復期リハビリテーション病棟", "その他"]).optional(),
  admission_gcs: measuredScore("admission_gcs"), prestroke_mrs: measuredScore("prestroke_mrs"), admission_complication: flag,
  stroke_type: z.enum(["脳梗塞", "脳出血", "くも膜下出血", "その他"]).optional(),
  nihss: score(0, 42), bbs_score: measuredScore("bbs_score"), fbs_score: measuredScore("fbs_score"), tct_score: score(0, 100),
  fugl_meyer_lower: measuredScore("fugl_meyer_lower"), brunnstrom_lower: score(1, 6), motricity_index_lower: score(0, 100),
  mmse_score: measuredScore("mmse_score"), moca_score: score(0, 30), cba_score: measuredScore("cba_score"),
  fim_motor_total: measuredScore("fim_motor_total"), fim_cognitive_total: measuredScore("fim_cognitive_total"), fim_total: score(18, 126),
  fim_motor: measuredScore("fim_motor"), fim_cognitive: measuredScore("fim_cognitive"),
  walk_speed_10m: nonnegative, tug_seconds: nonnegative,
  knee_ext_paretic_nm_kg: nonnegative, knee_ext_total_nm_kg: nonnegative,
  delta_bbs: score(-56, 56), delta_fim_motor: score(-78, 78), delta_fim_cognitive: score(-30, 30),
  care_level: measuredScore("care_level"), walking_status: z.enum(["歩行自立", "補助歩行", "非歩行"]).optional(),
  sitting_balance_30s: flag, sit_up_independent: flag, spatial_neglect: flag, cognitive_impairment: flag,
  leg_strength_good: flag, adl_independence: flag, continence: flag, cortical_lesion: flag,
  caregiver_available: flag, diabetes: flag,
}).catchall(z.union([z.number().finite(), z.string(), z.boolean()]).optional()).superRefine((input, ctx) => {
  if (input.admission_fim_total !== undefined && input.admission_fim_motor_total !== undefined && input.admission_fim_cognitive_total !== undefined && input.admission_fim_total !== input.admission_fim_motor_total + input.admission_fim_cognitive_total) {
    ctx.addIssue({ code: "custom", path: ["admission_fim_total"], message: "入院時FIM総得点は入院時の運動・認知項目合計の和にしてください" });
  }
  if (input.days_since_onset !== undefined && input.days_onset_to_admission !== undefined && input.days_onset_to_admission > input.days_since_onset) {
    ctx.addIssue({ code: "custom", path: ["days_onset_to_admission"], message: "入院までの日数は評価時点の発症後日数以下にしてください" });
  }
});
