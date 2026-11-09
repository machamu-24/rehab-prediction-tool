export const JEONG_SOURCE_URL = "https://www.jstage.jst.go.jp/article/jjcrs/5/0/5_19/_article";

export const jeongOutcome = {
  name: "FIM総得点",
  description: "退院時FIM総得点（運動13項目＋認知5項目、18〜126点）",
  unit: "点",
  positiveLabel: "高得点（自立度高）",
  negativeLabel: "低得点（要介助）",
  isDefault: false,
  sortOrder: 1,
};

// Use the unstandardized coefficients in the Results formula (p.22),
// not the standardized beta coefficients in Table 4.
export function createJeongRule(outcomeId) {
  return {
    outcomeId,
    name: "回復期退院時FIM総得点予測 重回帰式（Jeongら 2014）",
    ruleType: "regression",
    source: "Jeong S, Inoue Y, Kondo K, Matsumoto D, Shiraishi N. (2014) Formula for predicting FIM for stroke patients at discharge from an acute ward or convalescent rehabilitation ward. Jpn J Compr Rehabil Sci 5:19–25. doi:10.11336/jjcrs.5.19",
    sourceUrl: JEONG_SOURCE_URL,
    evidenceLevel: "Cohort Study",
    applyConditions: [
      { field: "admission_ward_type", operator: "equals", value: "回復期リハビリテーション病棟", label: "回復期リハビリテーション病棟の入院時情報を使用" },
    ],
    ruleDefinition: {
      type: "regression",
      description: "回復期リハビリテーション病棟の入院時情報7項目から、退院時FIM総得点を推定する多施設データの重回帰式。",
      inputTimepoint: "admission",
      intercept: 33.04,
      coefficients: [
        { field: "admission_age", fieldLabel: "回復期入院時年齢", unit: "歳", coefficient: -0.34 },
        { field: "admission_complication", fieldLabel: "回復期入院時の合併症（あり=1、なし=0）", coefficient: -3.88 },
        { field: "days_onset_to_admission", fieldLabel: "発症から回復期入院までの日数", unit: "日", coefficient: -0.11 },
        { field: "admission_gcs", fieldLabel: "回復期入院時GCS合計", unit: "点", coefficient: 2.44 },
        { field: "prestroke_mrs", fieldLabel: "今回の脳卒中発症前mRS", unit: "点", coefficient: -1.68 },
        { field: "admission_fim_motor_total", fieldLabel: "回復期入院時FIM運動項目合計", unit: "点", coefficient: 0.53 },
        { field: "admission_fim_cognitive_total", fieldLabel: "回復期入院時FIM認知項目合計", unit: "点", coefficient: 1.25 },
      ],
      formula: "fim_total_discharge = 33.04 - 0.34 * admission_age - 3.88 * admission_complication - 0.11 * days_onset_to_admission + 2.44 * admission_gcs - 1.68 * prestroke_mrs + 0.53 * admission_fim_motor_total + 1.25 * admission_fim_cognitive_total",
      outputMode: "continuous",
      outputUnit: "点",
      notes: "対象：2009〜2012年のRehab Patient DBに登録された回復期脳卒中患者1,941名・24病院。本文の式作成群941名、検証群999名（合計1,940名で対象総数と1名の不一致があるため原著記載を保持）。作成群R²=0.66、検証群の予測値と実測値のSpearman相関係数0.84、R²=0.71。無作為に分割した同一データベース内の検証であり、独立施設・独立時期の外部検証とは区別する。予測対象はFIM総得点で、運動項目のみの得点ではない。すべて回復期入院時の情報を使用し、mRSは今回の発症前の値を用いる。合併症はあり=1・なし=0、未確認は未入力とし、糖尿病などの単一疾患で代用しない（原著に対象疾患・重症度の詳細な定義なし）。病院間のベンチマークを目的に作成され、訓練量・内容等を含まないため個人の予測には限界がある。線形推定値は18〜126点の範囲外になることがあり、原著にない補正・切り詰めは行わない。入院・退院の発症後日数は集団平均で、固定された評価日・予測対象日ではない。",
      timeline: {
        version: 1,
        anchor: "stroke_onset",
        kind: "future",
        evaluation: {
          value: 33.9, unit: "day", precision: "mean",
          originalText: "At admission to a convalescent rehabilitation ward; mean 33.9 days from onset",
          basis: "原著Table 2（p.21）の回復期入院までの平均日数33.9日。適用可能な日数の上下限は報告されていないため照合範囲は設定しない。",
        },
        target: {
          value: 130.7, unit: "day", precision: "mean",
          originalText: "At discharge from a convalescent rehabilitation ward",
          basis: "原著Discussion（p.23）：平均入院日33.9日＋平均在院日数96.8日＝発症後平均130.7日。退院日は患者ごとに異なり、原著にない照合範囲は設定しない。",
        },
      },
      verification: {
        sourceUrl: JEONG_SOURCE_URL,
        location: "p.22 Results (2) の回復期予測式、Table 4、p.20 Table 1、pp.23–24の限界。Table 4の標準偏回帰係数は式に使用しない。",
        revision: "jeong-convalescent-fim-total-2014-v1",
      },
      study: {
        title: "Formula for predicting FIM for stroke patients at discharge from an acute ward or convalescent rehabilitation ward",
        authors: ["Seungwon Jeong", "Yusuke Inoue", "Katsunori Kondo", "Daisuke Matsumoto", "Nariaki Shiraishi"],
        year: 2014, doi: "10.11336/jjcrs.5.19", model: "convalescent",
        sampleSize: 1941, hospitals: 24, developmentN: 941, validationN: 999,
        developmentRSquared: 0.66, validationSpearmanRho: 0.84, validationRSquared: 0.71,
        validationDesign: "random_split_same_multicenter_database",
      },
    },
    accuracy: null, sensitivity: null, specificity: null, auc: null,
    consensusEligible: false,
    isActive: true,
    sortOrder: 40,
  };
}
