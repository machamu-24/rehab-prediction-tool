export const IKEUE_SOURCE_URL = "https://www.jstage.jst.go.jp/article/ptr/29/2/29_25-E10391/_article";
export const IKEUE_DOI = "10.1298/ptr.25-E10391";

const commonNotes = "対象：塚崎病院の回復期リハビリテーション病棟に2019年11月〜2024年10月に入棟した、初発脳卒中・片麻痺あり・入棟時FIM総得点55点以下の104名（脳梗塞65名、脳出血39名）。115名中、急性期転院3名、他の回復期病棟への転院4名、入棟3週以内の退院2名、欠測2名を除外。平均年齢76.2歳、発症から入棟21.3日、在院78.9日。予測対象は退院時の運動FIM（13〜91点）で、FIM総得点・歩行自立・自宅復帰確率ではない。発症から入棟までの日数を使い、評価時点の発症後日数で代用しない。単施設後ろ向き研究、外部検証なし。ステップワイズ選択は不安定になり得る。1000回bootstrapおよび正則化回帰の10分割交差検証を実施。Table 4のMAE・RMSEの95%CIはモデル性能の不確実性であり、個人の予測区間ではない。校正傾きとO/E比が全bootstrapで1.00一定である点は、検証の実装・楽観補正の詳細を確認する余地があり、完全な校正の証拠と解釈しない。線形計算値は13〜91点を外れる場合があり、原著にない丸め込みや上限・下限への補正は行わない。時間軸の日数は集団平均であり、個人の固定された退院日や適用可能な日数範囲ではない。";

export function createIkeueRules(outcomeId) {
  return [1, 2].map(model => {
    const admission = model === 1;
    const coefficients = admission ? [
      ["admission_age", "回復期入棟時年齢", "歳", -0.68],
      ["days_onset_to_admission", "発症から回復期入棟までの日数", "日", -0.28],
      ["admission_bbs_score", "回復期入棟時BBS", "点", 0.36],
      ["admission_fim_motor_total", "回復期入棟時FIM運動項目合計", "点", 0.82],
      ["admission_fim_cognitive_total", "回復期入棟時FIM認知項目合計", "点", 1.12],
    ] : [
      ["admission_age", "回復期入棟時年齢", "歳", -0.53],
      ["days_onset_to_admission", "発症から回復期入棟までの日数", "日", -0.22],
      ["admission_fim_cognitive_total", "回復期入棟時FIM認知項目合計", "点", 0.57],
      ["week3_fim_motor_total", "回復期入棟3週後FIM運動項目合計", "点", 0.92],
    ];
    return {
      outcomeId,
      name: `低FIM脳卒中の退院時運動FIM予測・${admission ? "入棟時" : "入棟3週後"}モデル（Ikeueら2026）`,
      ruleType: "regression",
      source: "Ikeue K, Funabiki K, Nakatani Y. (2026) Time-updated Prediction of Discharge Functional Independence in Patients with Stroke and Low Functional Independence Measure in a Convalescent Rehabilitation Ward: Comparison between Admission and 3-week Models. Physical Therapy Research 29(2):133–142. doi:10.1298/ptr.25-E10391",
      sourceUrl: IKEUE_SOURCE_URL, evidenceLevel: "Cohort Study",
      applyConditions: [
        { field: "admission_ward_type", operator: "equals", value: "回復期リハビリテーション病棟", label: "回復期リハビリテーション病棟" },
        { field: "first_stroke", operator: "boolean", value: true, label: "初発脳卒中" },
        { field: "hemiparesis_present", operator: "boolean", value: true, label: "片麻痺あり" },
        { field: "stroke_type", operator: "!=", value: "くも膜下出血", label: "脳梗塞・脳出血（くも膜下出血は対象外）" },
        { field: "stroke_type", operator: "!=", value: "その他", label: "脳梗塞・脳出血（その他は対象外）" },
        { field: "admission_fim_total", operator: "<=", value: 55, label: "回復期入棟時FIM総得点55点以下" },
      ],
      ruleDefinition: {
        type: "regression", inputTimepoint: admission ? "admission" : "week3",
        description: `入棟時FIM総得点55点以下の初発脳卒中患者の、退院時運動FIMを${admission ? "入棟時の5項目" : "入棟時情報と入棟3週後の運動FIM"}から推定する重回帰式。`,
        intercept: admission ? 64.36 : 52.56,
        coefficients: coefficients.map(([field, fieldLabel, unit, coefficient]) => ({ field, fieldLabel, unit, coefficient })),
        outputMode: "continuous", outputUnit: "点",
        notes: commonNotes + (admission
          ? "入棟時モデル：R²=0.60、調整R²=0.58（Table 2）。Table 4のbootstrapでは調整R²=0.59、MAE=10.67点（95%CI 9.13〜12.41）、RMSE=12.94点（11.34〜14.50）。BBS中央値3点、68.3%が0〜5点で床効果あり。3週以内の退院患者が解析から除外されているため、短期入棟患者への一般化にも注意。"
          : "入棟3週後モデル：認知FIMは入棟時、運動FIMは入棟3週後の実測値を使用。発症3週後・入棟1ヶ月後・現在値・変化量で代用しない。R²=0.72、調整R²=0.71（Table 3）。Table 4のMAE=8.67点（95%CI 7.32〜10.19）、RMSE=10.85点（9.42〜12.34）。入棟時よりMAEが2.00点減少したが、個人の誤差が±8.67点以内という意味ではない。3週後の運動FIMの標準偏回帰係数β=0.61で最大。改善の一部は退院に近い時点で測定することによる可能性があり、3週の再評価が最適であることや特定介入の効果を証明しない。"),
        timeline: {
          version: 1, anchor: "stroke_onset", kind: "future",
          evaluation: {
            value: admission ? 21.3 : 42.3, unit: "day", precision: "mean",
            originalText: admission ? "At admission; mean 21.3 days from onset" : "At 3 weeks after admission; approximately 42 days from onset on average",
            basis: admission ? "Table 1：発症から入棟まで平均21.3日。上下限は未報告のため照合範囲を設けない。" : "Table 1の平均21.3日＋入棟3週（21日）＝平均42.3日。発症後42.3日固定の評価ではない。",
          },
          target: { value: 100.2, unit: "day", precision: "mean", originalText: "FIM motor score at discharge", basis: "Table 1：発症から入棟21.3日＋在院78.9日＝発症後平均100.2日。個人の退院日は一定ではなく、照合範囲は設定しない。" },
        },
        verification: { sourceUrl: IKEUE_SOURCE_URL, location: `Methods pp.134–136、Table 1、Table ${admission ? 2 : 3}（p.136）、Results p.138、Table 4–5、Limitations pp.140–141。添付PDF本文と表の非標準化係数Bを照合。`, revision: "ikeue-low-fim-2026-v1", originalFullTextReviewed: true },
        study: {
          title: "Time-updated Prediction of Discharge Functional Independence in Patients with Stroke and Low Functional Independence Measure in a Convalescent Rehabilitation Ward: Comparison between Admission and 3-week Models",
          authors: ["Koichi Ikeue", "Keisuke Funabiki", "Yuya Nakatani"], year: 2026, doi: IKEUE_DOI,
          model, sampleSize: 104, hospitals: 1, validationDesign: "bootstrap_internal_only_no_external_validation",
          rSquared: admission ? 0.60 : 0.72, adjustedRSquared: admission ? 0.58 : 0.71,
          bootstrap: { resamples: 1000, mae: admission ? 10.67 : 8.67, maeCI: admission ? [9.13, 12.41] : [7.32, 10.19], rmse: admission ? 12.94 : 10.85, rmseCI: admission ? [11.34, 14.50] : [9.42, 12.34], adjustedRSquared: admission ? 0.59 : 0.71 },
        },
      },
      accuracy: null, sensitivity: null, specificity: null, auc: null,
      consensusEligible: false, isActive: true, sortOrder: 41 + model,
    };
  });
}
