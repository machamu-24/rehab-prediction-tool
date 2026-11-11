import { readTimeline, type TimeQuery } from "@shared/literatureTimeline";
import { getRuleExclusionReason, readNomogramReference } from "@shared/ruleAvailability";

export type FieldDef = {
  key: string;
  label: string;
  type: string;
  unit?: string;
  placeholder?: string;
  description?: string;
  options?: string[];
  booleanLabels?: { true: string; false: string };
};

export type SectionDef = {
  section: string;
  description?: string;
  fields: FieldDef[];
};

export const ONSET_DAY_FIELD = "days_since_onset";
export const ONSET_DAY_ALIASES = ["days_post_stroke"] as const;

export const PATIENT_FIELDS: SectionDef[] = [
  { section: "基本情報", fields: [
    { key: "age",              label: "年齢",         type: "number", unit: "歳",  placeholder: "例: 72" },
    { key: "sex",              label: "性別",         type: "select", options: ["男性", "女性"] },
    { key: "days_since_onset", label: "評価時点の発症後日数",   type: "number", unit: "日",  placeholder: "例: 14" },
    { key: "days_onset_to_admission", label: "発症から入院までの日数", type: "number", unit: "日", placeholder: "例: 17" },
    { key: "first_stroke", label: "今回が初回の脳卒中", type: "boolean", booleanLabels: { true: "初回", false: "再発" } },
    { key: "hemiparesis_present", label: "今回の脳卒中に伴う片麻痺がある", type: "boolean", booleanLabels: { true: "あり", false: "なし" }, description: "片麻痺に乏しい高次機能障害中心の症例は通常の適応に含めません。" },
    { key: "unilateral_hemispheric_stroke", label: "病変が片側大脳半球に限局", type: "boolean", booleanLabels: { true: "該当", false: "非該当" }, description: "両側大脳半球・脳幹・小脳などの病変は非該当です。" },
    { key: "other_neuropsychiatric_condition", label: "脳卒中以外の神経・精神疾患の併存", type: "boolean", booleanLabels: { true: "あり", false: "なし" } },
    { key: "stroke_type",      label: "病型",         type: "select", options: ["脳梗塞", "脳出血", "くも膜下出血", "その他"] },
  ]},
  { section: "運動機能評価", fields: [
    { key: "brunnstrom_lower",       label: "Brunnstrom Stage 下肢",            type: "number", unit: "ステージ", placeholder: "1〜6" },
    { key: "fugl_meyer_lower",       label: "Fugl-Meyer 下肢（FMA-LE）",        type: "number", unit: "点",  placeholder: "0〜34" },
    { key: "bbs_score",              label: "BBS / FBS（Berg / Functional Balance Scale）", type: "number", unit: "点",  placeholder: "0〜56" },
    { key: "tct_score",              label: "TCT（体幹コントロールテスト）",      type: "number", unit: "点",  placeholder: "0〜100" },
    { key: "knee_ext_paretic_nm_kg", label: "麻痺側膝伸展筋力（Nm/kg）",       type: "number", unit: "Nm/kg", placeholder: "例: 0.45" },
    { key: "knee_ext_total_nm_kg",   label: "両側合計膝伸展筋力（Nm/kg）",     type: "number", unit: "Nm/kg", placeholder: "例: 1.20" },
    { key: "leg_strength_good",      label: "下肢筋力（良好）",                 type: "boolean" },
    { key: "sitting_balance_30s",    label: "座位保持30秒（30秒以上）",         type: "boolean" },
    { key: "sit_up_independent",     label: "起居動作の介助", type: "boolean", booleanLabels: { true: "介助不要", false: "介助必要" } },
  ]},
  { section: "神経学的評価", fields: [
    { key: "mmse_score",          label: "MMSE",                     type: "number", unit: "点",  placeholder: "0〜30" },
    { key: "moca_score",          label: "MoCA",                     type: "number", unit: "点",  placeholder: "0〜30" },
    { key: "cba_score",           label: "CBA（認知関連行動評価）",   type: "number", unit: "点",  placeholder: "6〜30" },
    { key: "spatial_neglect",     label: "半側空間無視（USN）あり",  type: "boolean" },
    { key: "cognitive_impairment",label: "認知障害", type: "boolean", booleanLabels: { true: "障害あり", false: "障害なし" } },
  ]},
  { section: "歩行評価", fields: [
    { key: "walk_speed_10m",   label: "10m歩行速度",              type: "number", unit: "m/s", placeholder: "例: 0.65" },
    { key: "tug_seconds",      label: "TUG（Timed Up and Go）",  type: "number", unit: "秒",  placeholder: "例: 20.5" },
    { key: "walking_status",   label: "歩行状態",                 type: "select", options: ["歩行自立", "補助歩行", "非歩行"] },
  ]},
  { section: "入棟3週後評価（Ikeueら2026）", description: "回復期入棟から3週間後の実測値を入力します（発症3週後や1ヶ月後の値ではありません）。認知FIMは入院時評価欄の値を使用します。3週後の照合は評価時点「入棟3週間後」を選びます。", fields: [
    { key: "week3_fim_motor_total", label: "入棟3週後 FIM運動項目合計", type: "number", unit: "点", placeholder: "13〜91" },
  ]},
  { section: "ADL評価（FIM）", fields: [
    { key: "fim_motor_total",    label: "FIM 運動項目合計",  type: "number", unit: "点",  placeholder: "13〜91" },
    { key: "fim_cognitive_total",label: "FIM 認知項目合計",  type: "number", unit: "点",  placeholder: "5〜35" },
    { key: "fim_total",          label: "FIM 合計",          type: "number", unit: "点",  placeholder: "18〜126", description: "同じ評価時点の運動項目と認知項目が両方入力されると自動計算します。総得点だけが分かる場合は手入力できます。" },
    { key: "adl_independence",   label: "ADL自立（良好）",   type: "boolean" },
  ]},
  { section: "Koyama対数モデル（FIM総得点・2時点）", description: "運動FIMではなく総得点（18〜126点）を使います。Aは回復期入院時、BはAから14〜42日後の再評価、XはBより後の予測対象です。A・B・Xにはすべて発症日＝0日からの累計日数を入力します。Koyama専用の時間軸にはB・Xが自動反映されます。上部の他文献用の時間軸へ同じ値を二重入力する必要はありません。", fields: [
    { key: "koyama_day_a", label: "A：回復期入院時の発症後日数", type: "number", unit: "日", placeholder: "30〜60", description: "原著抄録の転院時期に合わせて30〜60日に制限しています。基本情報の入院日数を利用する場合は、回復期入院までの日数を入力してください。" },
    { key: "koyama_fim_total_a", label: "A：回復期入院時のFIM総得点", type: "number", unit: "点", placeholder: "18〜126" },
    { key: "koyama_day_b", label: "B：再評価時の発症後日数", type: "number", unit: "日", placeholder: "例: 44（Aが30日で14日後に再評価）", description: "再評価した日の、発症日からの累計日数を入力します。14〜42日はAとBの評価間隔です。例：Aが発症後30日で、その14日後に再評価した場合、Bには44を入力します。" },
    { key: "koyama_fim_total_b", label: "B：再評価時のFIM総得点", type: "number", unit: "点", placeholder: "18〜126" },
    { key: "koyama_target_day", label: "X：予測したい発症後日数", type: "number", unit: "日", placeholder: "例: 120", description: "Bより後、180日以内。約半年を180日としたアプリの上限です。" },
    { key: "prestroke_adl_independent", label: "発症前ADLが自立", type: "boolean", booleanLabels: { true: "自立", false: "非自立" } },
    { key: "supratentorial_stroke", label: "今回の脳卒中病変がテント上", type: "boolean", booleanLabels: { true: "テント上", false: "テント下・その他" }, description: "脳幹・小脳病変は非該当です。未確認の場合は未評価のままにします。" },
    { key: "admission_wheelchair", label: "回復期入院時の移動手段が車いす", type: "boolean", booleanLabels: { true: "車いす", false: "その他" } },
  ]},
  { section: "変化量（入棟1ヶ月後評価）", description: "入棟1ヶ月後の値 − 入棟時の値を入力します。経過評価・退院時でも、変化量の対象期間は同じです。", fields: [
    { key: "delta_bbs",           label: "ΔBBS（入棟時→1ヶ月後）",      type: "number", unit: "点", placeholder: "例: 8" },
    { key: "delta_fim_motor",     label: "ΔFIM運動（入棟時→1ヶ月後）",  type: "number", unit: "点", placeholder: "例: 12" },
    { key: "delta_fim_cognitive", label: "ΔFIM認知（入棟時→1ヶ月後）",  type: "number", unit: "点", placeholder: "例: 3" },
  ]},
  { section: "入院時情報・社会的評価", fields: [
    { key: "care_level",              label: "要介護認定区分",          type: "number", unit: "区分", placeholder: "0〜5（0=未申請・要支援）" },
    { key: "caregiver_available",     label: "介護者あり",              type: "boolean" },
    { key: "continence",              label: "失禁なし",                type: "boolean" },
    { key: "cortical_lesion",         label: "皮質病変",            type: "boolean" },
    { key: "diabetes",                label: "糖尿病",                  type: "boolean" },
  ]},
];

const admissionKeys = new Set(["age", "bbs_score", "fim_motor_total", "fim_cognitive_total", "sit_up_independent", "cognitive_impairment", "walking_status", "cba_score", "spatial_neglect", "mmse_score", "fugl_meyer_lower"]);
PATIENT_FIELDS.splice(1, 0, {
  section: "入院時評価（現在の値と区別して入力）",
  fields: [
    ...PATIENT_FIELDS.flatMap(section => section.fields).filter(field => admissionKeys.has(field.key)).map(field => ({ ...field, key: `admission_${field.key}`, label: `入院時 ${field.label}` })),
    { key: "admission_fim_walk", label: "入院時 FIM歩行項目", type: "number", unit: "点", placeholder: "1〜7" },
    { key: "admission_fim_total", label: "入院時 FIM総得点", type: "number", unit: "点", placeholder: "18〜126", description: "入院時の運動項目と認知項目が両方入力されると自動計算します。総得点だけが分かる場合は手入力できます。運動13項目＋認知5項目の合計。Ikeueら2026の対象条件は55点以下です。" },
    { key: "admission_albumin_g_dl", label: "入院時 血清アルブミン", type: "number", unit: "g/dL", placeholder: "例: 3.5", description: "B-ADLでは利用者指定により3.5 g/dL以上を1点として計算します。g/Lではなくg/dLで入力します。未測定は空欄にしてください。" },
    { key: "admission_brs_upper", label: "入院時 Brunnstrom Stage 上肢", type: "number", unit: "ステージ", placeholder: "1〜6", description: "上肢のstageを入力します。手指・下肢のstageで代用しません。" },
    { key: "stroke_onset_concurrent_disease", label: "脳卒中発症と同時期に発生した別疾患", type: "boolean", booleanLabels: { true: "あり", false: "なし" }, description: "例：大腿骨近位部骨折。B-ADLの原著ではこうした併発疾患のある患者を除外しています。" },
    { key: "admission_fac", label: "入院時 FAC（歩行の介助度）", type: "number", unit: "点", placeholder: "0〜5", description: "0＝歩行不能、1〜2＝身体介助、3＝見守り・声かけ、4＝平地自立、5＝不整地・階段も自立。杖や歩行器の使用だけで判定しません。" },
    { key: "admission_clinically_stable", label: "入院時 医学的に安定した状態", type: "boolean", booleanLabels: { true: "安定", false: "不安定" } },
    { key: "admission_ward_type", label: "入院先の病棟種別", type: "select", options: ["急性期病棟", "回復期リハビリテーション病棟", "その他"], description: "GCS・FIMなどに入力する入院時情報の病棟を選択します。" },
    { key: "admission_gcs", label: "入院時 GCS合計", type: "number", unit: "点", placeholder: "3〜15", description: "Glasgow Coma Scaleの合計点（3〜15点）。対象病棟の入院時の値を入力します。" },
    { key: "prestroke_mrs", label: "今回の脳卒中発症前 mRS", type: "number", unit: "点", placeholder: "0〜5", description: "今回の脳卒中を発症する前の生活機能を、modified Rankin Scale（0〜5点）で入力します。" },
    { key: "admission_complication", label: "入院時 合併症の有無", type: "boolean", booleanLabels: { true: "あり（1）", false: "なし（0）" }, description: "Jeongらの式では入院時の合併症をあり＝1、なし＝0で扱います。原著では対象疾患・重症度の詳細な定義がなく、未確認の場合は「未評価」のままにします。" },
    { key: "admission_unassisted_5m", label: "入院時 人的介助なしでの5m歩行", type: "boolean", booleanLabels: { true: "可能", false: "不可能" } },
    { key: "admission_fact_score", label: "入院時 FACT（体幹機能）", type: "number", unit: "点", placeholder: "0〜20", description: "Functional Assessment for Control of Trunkの10課題の合計です。TCTで代用しません。" },
    { key: "admission_tct_score", label: "入院時 TCT（体幹コントロールテスト）", type: "number", unit: "点", placeholder: "0〜100", description: "回復期入院時のTCT合計です。現在の値・FACTで代用しません。" },
    { key: "admission_sias_nonparetic", label: "入院時 SIAS非麻痺側機能（大腿四頭筋＋握力）", type: "number", unit: "点", placeholder: "0〜6", description: "非麻痺側大腿四頭筋筋力と握力の2項目合計です。麻痺側下肢SIAS（0〜15点）や膝伸展筋力Nm/kgとは別です。" },
    { key: "admission_unilateral_impairment", label: "入院時に片側性の機能障害がある", type: "boolean", booleanLabels: { true: "片側性", false: "両側性・その他" }, description: "Jenkinらの対象条件です。画像上の病変側ではなく、入院時の機能障害が片側性かを確認します。" },
    { key: "admission_independent_10m", label: "入院時 見守り・身体介助なしの10m歩行", type: "boolean", booleanLabels: { true: "自立", false: "非自立" }, description: "補助具・装具は使用可です。見守りや身体介助が必要なら非自立。Jenkinらは入院時非自立者を対象とします。" },
    { key: "admission_care_level", label: "入院時 要介護認定区分", type: "number", unit: "区分", placeholder: "0〜5（0=未申請・要支援）" },
  ],
});
PATIENT_FIELDS[0].fields.push({ key: "months_since_onset", label: "評価時点の発症後月数", type: "number", unit: "ヶ月", placeholder: "例: 8" });

type PatientFieldRule = {
  isActive: boolean;
  ruleDefinition: unknown;
  requiredFields: readonly string[];
  applyConditionFields: readonly { field: string }[];
};

export function getRequiredPatientFields(
  rules: readonly PatientFieldRule[] | undefined,
  kind?: TimeQuery["kind"]
): Set<string> {
  const fields = new Set(
    rules
      ?.filter(rule => {
        if (!rule.isActive || (getRuleExclusionReason(rule.ruleDefinition) && !readNomogramReference(rule.ruleDefinition))) return false;
        const timeline = readTimeline(rule.ruleDefinition);
        // Unknown dates must not hide fields needed to complete the assessment.
        return !kind || !timeline || timeline.kind === kind;
      })
      .flatMap(rule => [
        ...rule.requiredFields,
        ...rule.applyConditionFields.map(condition => condition.field),
      ]) ?? []
  );
  if (fields.has("koyama_day_a")) fields.add("days_onset_to_admission");
  if (fields.has("koyama_fim_total_a")) fields.add("admission_fim_total");
  if (fields.has("admission_fim_total")) {
    fields.add("admission_fim_motor_total");
    fields.add("admission_fim_cognitive_total");
  }
  if (fields.has("fim_total")) {
    fields.add("fim_motor_total");
    fields.add("fim_cognitive_total");
  }
  return fields;
}

export function getVisiblePatientSections(
  requiredFields: ReadonlySet<string>,
  showAllFields: boolean
): SectionDef[] {
  return PATIENT_FIELDS.map(section => ({
    ...section,
    fields: section.fields.filter(field =>
      (showAllFields || requiredFields.has(field.key))
    ),
  })).filter(section => section.fields.length);
}
