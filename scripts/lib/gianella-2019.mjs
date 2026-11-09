export const GIANELLA_SOURCE_URL = "https://doi.org/10.1016/j.jstrokecerebrovasdis.2019.104367";

// Table 3 reports logistic beta coefficients, not odds ratios to substitute into the equation.
export function createGianellaRule(outcomeId) {
  return {
    outcomeId,
    name: "退院時の身体介助なし歩行確率（FAC≥3・見守り含む、Gianellaら2019）",
    ruleType: "logistic_regression",
    source: "Gianella MG, Gath CF, Bonamico L, Olmos LE, Russo MJ. (2019) Prediction of Gait without Physical Assistance after Inpatient Rehabilitation in Severe Subacute Stroke Subjects. J Stroke Cerebrovasc Dis 28(11):104367. doi:10.1016/j.jstrokecerebrovasdis.2019.104367",
    sourceUrl: GIANELLA_SOURCE_URL,
    evidenceLevel: "Cohort Study",
    applyConditions: [
      { field: "admission_age", operator: ">=", value: 18, label: "リハビリ入院時18歳以上" },
      { field: "days_onset_to_admission", operator: "<=", value: 90, label: "発症90日以内にリハビリ入院" },
      { field: "admission_fac", operator: "<", value: 3, label: "入院時FAC 0〜2（歩行不能または身体介助が必要）" },
      { field: "first_stroke", operator: "==", value: true, label: "初回の脳卒中" },
      { field: "unilateral_hemispheric_stroke", operator: "==", value: true, label: "片側大脳半球の脳卒中（両側・脳幹・小脳病変を除外）" },
      { field: "other_neuropsychiatric_condition", operator: "==", value: false, label: "脳卒中以外の神経・精神疾患の併存なし" },
      { field: "admission_clinically_stable", operator: "==", value: true, label: "入院時に医学的に不安定な疾患なし" },
    ],
    ruleDefinition: {
      type: "logistic_regression",
      modelType: "logistic",
      outputMode: "probability",
      inputTimepoint: "admission",
      description: "入院時の年齢・性別・発症から入院までの日数・BBS・下肢FMAから、リハビリ退院時の身体介助なし歩行（FAC≥3）の確率を推定する。歩行自立アウトカム内の参考結果。",
      intercept: 7.191,
      variables: [
        { field: "admission_age", fieldLabel: "リハビリ入院時年齢", unit: "歳", coefficient: -0.13 },
        { field: "sex", fieldLabel: "性別（男性=0、女性=1）", categoryMap: { "男性": 0, "女性": 1 }, coefficient: -0.985 },
        { field: "days_onset_to_admission", fieldLabel: "発症からリハビリ入院までの日数", unit: "日", coefficient: -0.032 },
        { field: "admission_bbs_score", fieldLabel: "リハビリ入院時BBS", unit: "点", coefficient: 0.424 },
        { field: "admission_fugl_meyer_lower", fieldLabel: "リハビリ入院時Fugl-Meyer下肢（FMA-LE）", unit: "点", coefficient: 0.16 },
      ],
      formula: "z = 7.191 - 0.13 * admission_age - 0.985 * female - 0.032 * days_onset_to_admission + 0.424 * admission_bbs_score + 0.16 * admission_fugl_meyer_lower; p = 1 / (1 + exp(-z)); female: male=0, female=1",
      positiveMessage: "身体介助なし歩行（FAC≥3、見守りを含む）の推定確率。原著に判定閾値の記載なし。",
      negativeMessage: "身体介助なし歩行（FAC≥3、見守りを含む）の推定確率。原著に判定閾値の記載なし。",
      notes: "対象：アルゼンチンFLENIの2010〜2017年の入院リハビリ患者185名で、18歳以上、初回・片側大脳半球の脳卒中、発症90日以内、入院時FAC 0〜2。脳卒中以外の神経・精神疾患、医学的に不安定な疾患、両側大脳半球・テント下病変を除外。単施設の後ろ向きコホートで、集中的な多職種入院リハビリを実施。退院時FAC≥3は93/185名（50.27%）、内訳FAC3=73名、FAC4=13名、FAC5=7名。FAC3は身体介助不要でも見守り・声かけが必要で、既存アウトカムのFAC≥4・FIM歩行≥6と同一ではない。利用者の指定により「歩行自立」内に登録するが参考結果とし、支持・困難の集計に含めない。Table 3のβと切片を使用し、ORを係数に代用しない。公表係数は丸められている。原著に確率の判定閾値・その感度・特異度の記載がなく、0.5で自立・非自立に分類しない。AUC0.93（95%CI 0.90〜0.97）はモデル作成集団内の識別能で正答率ではない。Hosmer-Lemeshow検定は非有意、内部再標本化検証・外部検証の記載なし。年齢中央値65歳、入院時BBS中央値3点・下肢FM中央値4点、在院日数中央値87日。認知・言語・行動、ADL、社会・経済要因はモデルに含まれず、性別や入院までの日数の関連から因果関係を断定しない。本文の女性のオッズ低下73%という説明はTable 3のOR0.373（約62.7%低下）と不一致。Table 2のFinal FAC行は群別の掲載列が見出しと逆で、本文・総数・図の定義に基づきFAC≥3を扱う。入院時の評価値を使用し、現在値で補完しない。退院日は患者ごとに異なり、発症後119日は集団の中央値で固定の予測日ではない。",
      timeline: {
        version: 1, anchor: "stroke_onset", kind: "future",
        evaluation: {
          value: 29, unit: "day", precision: "median",
          matchRangeDays: { min: 0, max: 90, basis: "Methodsの組み入れ条件：発症からリハビリ入院まで90日以内。入院時24時間以内に評価。" },
          originalText: "At admission; time since stroke median 29 days (IQR 19–44.5)",
          basis: "原著Table 1（p.4）の全185名の入院時発症後日数中央値29日。入院時に評価し、Methodsの組み入れ上限90日を適用する。",
        },
        target: {
          value: 119, unit: "day", precision: "median",
          originalText: "At discharge; time since stroke median 119 days (IQR 84–174)",
          basis: "原著Table 2（p.4）の全185名の退院時発症後日数中央値119日。患者ごとに退院時期が異なるため、IQRを適用範囲にせず照合範囲を設定しない。",
        },
      },
      evidenceReview: {
        status: "checked", reviewedAt: "2026-10-29", revision: "gianella-2019-fac3-probability-v1", sourceUrl: GIANELLA_SOURCE_URL,
        location: "Methods pp.2–3、Tables 1–2 p.4、Table 3とモデル性能 p.6、限界 p.7。提供PDF全8頁。",
        reason: "提供原著の対象条件・FAC≥3の定義・Table 3のβと切片を照合。閾値未報告のため確率のみ。FAC≥4の歩行自立とは区別し、同アウトカム内の参考結果として登録。",
      },
      study: {
        title: "Prediction of Gait without Physical Assistance after Inpatient Rehabilitation in Severe Subacute Stroke Subjects",
        authors: ["M.G. Gianella", "C.F. Gath", "L. Bonamico", "L.E. Olmos", "M.J. Russo"],
        year: 2019, doi: "10.1016/j.jstrokecerebrovasdis.2019.104367", pmid: "31519458",
        sampleSize: 185, hospitals: 1, outcomeFACMinimum: 3, events: 93,
        developmentAUC: 0.93, developmentAUC95CI: [0.90, 0.97], validationDesign: "apparent_performance_only",
      },
    },
    accuracy: null, sensitivity: null, specificity: null, auc: 0.93,
    consensusEligible: false, isActive: true, sortOrder: 45,
  };
}
