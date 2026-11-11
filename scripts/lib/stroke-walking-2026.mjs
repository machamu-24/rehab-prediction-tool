// Primary-source walking rules reviewed on 2026-11-11.
// Leaf frequencies are study observations, never individual probabilities.
export const WALKING_SOURCE_DOIS = [
  "10.3138/ptc-2019-0090", "10.2340/jrm.v58.45663",
  "10.31662/jmaj.2024-0212", "10.11336/jjcrs.17.24",
];

const condition = (field, operator, value, label) => ({ field, operator, value, label });
const strokeTypes = () => condition("stroke_type", "in", ["脳梗塞", "脳出血"], "研究対象：脳梗塞・脳内出血");
const rehabWard = () => condition("admission_ward_type", "equals", "回復期リハビリテーション病棟", "入院リハビリテーション開始時の評価");
const review = (sourceUrl, location, reason) => ({ status: "checked", sourceUrl, location, reason, reviewedAt: "2026-11-11", revision: "stroke-walking-primary-source-2026-11-11-v1" });
const unknownPoint = (originalText, basis) => ({ value: null, unit: "day", precision: "unknown", originalText, basis });
const timeline = (evaluation) => ({
  version: 1, anchor: "stroke_onset", kind: "future", evaluation,
  target: unknownPoint("At discharge from inpatient rehabilitation", "退院時。個人ごとに異なるため固定日・適用日数範囲を設定しない。"),
});
const common = { evidenceLevel: "Cohort Study", accuracy: null, sensitivity: null, specificity: null, auc: null, isActive: true };

export function createStrokeWalkingRules(outcomeId) {
  const jenkinUrl = "https://doi.org/10.3138/ptc-2019-0090";
  const jenkin = {
    ...common, outcomeId, sortOrder: 49, consensusEligible: true,
    name: "入院時BBSによる退院時10m歩行自立（≥14点、Jenkinら2021）", ruleType: "cutoff",
    source: "Jenkin J, Parkinson S, Jacques A, Kho L, Hill K. (2021) Berg Balance Scale Score as a Predictor of Independent Walking at Discharge among Adult Stroke Survivors. Physiother Can 73(3):252–256. doi:10.3138/ptc-2019-0090", sourceUrl: jenkinUrl,
    applyConditions: [rehabWard(), strokeTypes(),
      condition("admission_age", ">=", 18, "成人"),
      condition("admission_unilateral_impairment", "boolean", true, "入院時に片側性の機能障害あり"),
      condition("admission_independent_10m", "boolean_negative", false, "入院時は見守り・身体介助なしの10m歩行が非自立"),
    ],
    ruleDefinition: {
      type: "cutoff", inputTimepoint: "admission", field: "admission_bbs_score", fieldLabel: "入院時BBS", unit: "点", operator: ">=", threshold: 14,
      description: "入院時に歩行非自立だった成人脳卒中患者で、入院時BBSから退院時の見守り・身体介助なし10m歩行を検討。補助具・装具の使用は可。",
      positiveMessage: "入院時BBS≥14点：退院時の見守り・身体介助なし10m歩行自立を支持します（補助具・装具は使用可）。",
      negativeMessage: "入院時BBS<14点：退院時10m歩行自立を支持するカットオフ未満です。歩行自立の獲得不能を意味しません。",
      notes: "対象：豪州Royal Perth Rehabilitation Hospitalの成人脳卒中患者68名（片側性障害、入院時歩行非自立）。2012年6月〜2014年1月、入院2日以内に評価。年齢中央値57歳、発症から入院中央値14日（IQR16）、在院中央値8週（IQR10）。退院時アウトカムは見守り・身体介助なしで10m以上歩行（補助具・装具可）であり、FIM歩行≥6やFAC≥4と同じ評価尺度ではない。BBS≥14点、AUC0.81（95%CI0.71–0.92）、感度0.73、特異度0.89。カットオフの95%CIは9–21点。単施設・少数例、独立した外部検証なし。BBSのOR1.23だけから個人確率を作らず、切片未掲載の回帰モデルは登録しない。",
      timeline: timeline({ value: 14, unit: "day", precision: "median", originalText: "Within 2 days of rehabilitation admission; median 14 days from stroke onset", basis: "Methods p.253、Table 1 p.254。集団の中央値を個人の評価日・適用範囲へ変換しない。" }),
      evidenceReview: review(jenkinUrl, "Methods p.253、Table 1・Results p.254、Figure 1 p.255", "BBS≥14、対象の入院時非自立、10m歩行の定義およびROC指標を確認。"),
      study: { year: 2021, doi: WALKING_SOURCE_DOIS[0], sampleSize: 68, outcome: "independent_10m_without_supervision_or_physical_assistance", validation: "single_center_derivation_only" },
    }, sensitivity: 0.73, specificity: 0.89, auc: 0.81,
  };

  const kimUrl = "https://doi.org/10.2340/jrm.v58.45663";
  const kimNotes = "対象：韓国3施設の入院脳卒中リハビリ患者565名（脳梗塞316名、脳出血249名）。急性期大学病院317名と亜急性期リハ病院248名の混合集団。発症から入院中央値42日（IQR23–73）、在院中央値74日（IQR44–186）。入院時BBSから退院時FAC≥4（補助具使用可の平地歩行自立）を検討。入院時FAC0–5を含み、非歩行者だけの新規自立獲得モデルではない。全体：BBS≥24、AUC0.899、感度90.7%、特異度74.4%。脳梗塞：BBS≥33、AUC0.890、感度84.1%、特異度77.0%。脳出血：BBS≥12、AUC0.912、感度96.3%、特異度75.6%。Table IIIの33点行の感度79.0%・特異度83.2%は全体集団の指標で、脳梗塞サブグループには転用しない。病型との交互作用は非有意（p=0.756）。急性期10点・亜急性期38点という探索的閾値は施設と病期が交絡し未検証のため登録しない。内部bootstrapのみ、外部検証なし。多い欠測による選択バイアスと日本の回復期との患者背景・在院期間の違いに注意。同一研究の全体ルールと病型別ルールを重複集計しない。";
  const kimRules = [
    { label: "全体・参考", type: null, threshold: 24, n: 565, sensitivity: 0.907, specificity: 0.744, auc: 0.899 },
    { label: "脳梗塞", type: "脳梗塞", threshold: 33, n: 316, sensitivity: 0.841, specificity: 0.770, auc: 0.890 },
    { label: "脳出血", type: "脳出血", threshold: 12, n: 249, sensitivity: 0.963, specificity: 0.756, auc: 0.912 },
  ].map((model, i) => ({
    ...common, outcomeId, sortOrder: 50 + i, consensusEligible: model.type !== null,
    name: `入院時BBSによる退院時歩行自立・${model.label}（≥${model.threshold}点、Kimら2026）`, ruleType: "cutoff",
    source: "Kim JS, Hwang IG, Ko EJ. (2026) Subtype-specific optimal cut-off values of the Berg Balance Scale for predicting independent walking in inpatient stroke rehabilitation: a multicentre cohort study. J Rehabil Med 58:45663. doi:10.2340/jrm.v58.45663", sourceUrl: kimUrl,
    applyConditions: [condition("admission_ward_type", "in", ["急性期病棟", "回復期リハビリテーション病棟"], "急性期・亜急性期の入院リハビリ集団"),
      model.type ? condition("stroke_type", "equals", model.type, `病型別モデル：${model.type}`) : strokeTypes()],
    ruleDefinition: {
      type: "cutoff", inputTimepoint: "admission", field: "admission_bbs_score", fieldLabel: "入院時BBS", unit: "点", operator: ">=", threshold: model.threshold,
      description: `入院時BBSで退院時FAC≥4を検討する${model.type ? model.type + "の病型別" : "全体集団の参考"}カットオフ。急性期・亜急性期の混合集団。`,
      positiveMessage: `入院時BBS≥${model.threshold}点（${model.label}）：退院時FAC≥4の平地歩行自立を支持します。${model.type ? "" : "全体集団の参考結果で、病型別ルールとの重複集計はしません。"}`,
      negativeMessage: `入院時BBS<${model.threshold}点（${model.label}）：退院時FAC≥4を支持するカットオフ未満です。獲得不能を意味しません。`,
      notes: kimNotes,
      timeline: timeline({ value: 42, unit: "day", precision: "median", originalText: "BBS on rehabilitation admission; median 42 days (IQR 23–73) from onset", basis: "Table I。全体の代表値であり、病型別の中央値や適用日数範囲ではない。" }),
      evidenceReview: review(kimUrl, "Methods pp.2–4、Results・Table II p.5、Table III・Subgroup analyses p.6、Limitations p.9", "病型別ROC値を全体Table IIIの値と区別。全体ルールは参考集計、病型別2ルールは相互排他的に適用。"),
      study: { year: 2026, doi: WALKING_SOURCE_DOIS[1], cohortGroup: "kim-2026-565", sampleSize: model.n, totalSampleSize: 565, subtype: model.type, outcome: "discharge_FAC_ge_4", validation: "bootstrap_internal_only", consensusReason: model.type ? "同一患者には対応する病型別ルール1件のみ集計。全体ルールは集計外。" : "病型別モデルとの重複を避けるため全体モデルは参考結果。" },
    }, sensitivity: model.sensitivity, specificity: model.specificity, auc: model.auc,
  }));

  const satoUrl = "https://doi.org/10.31662/jmaj.2024-0212";
  const sato = {
    ...common, outcomeId, sortOrder: 53, consensusEligible: true,
    name: "入院時FACTによる退院時歩行自立（≥8点、Sato・Ogawaら2025）", ruleType: "cutoff",
    source: "Sato K, Ogawa T. (2025) Functional Assessment for Control of the Trunk Predicts Independent Walking in Patients with Stroke. JMA J 8(1):226–233. doi:10.31662/jmaj.2024-0212", sourceUrl: satoUrl,
    applyConditions: [rehabWard(), condition("stroke_type", "equals", "脳梗塞", "原著の対象は脳梗塞のみ")],
    ruleDefinition: {
      type: "cutoff", inputTimepoint: "admission", field: "admission_fact_score", fieldLabel: "入院時FACT（体幹機能）", unit: "点", operator: ">=", threshold: 8,
      description: "脳梗塞患者の入院時FACT（0〜20点）から退院時FIM歩行≥6を検討。脳出血への適用はしない。",
      positiveMessage: "入院時FACT≥8点：退院時FIM歩行≥6の歩行自立を支持します。",
      negativeMessage: "入院時FACT<8点：退院時歩行自立を支持するカットオフ未満です。自立獲得不能を意味しません。",
      notes: "対象：日本の中山病院に2018年6月〜2021年10月に入院した脳梗塞患者213名（歩行自立102名、非自立111名）。欠測138名・在院14日未満12名を除外。脳出血を含めず、在院14日未満への一般化には注意。FACTは10課題、0〜20点でTCTとは別尺度。入院時FACT≥8（考察・結論に等号明記）、AUC0.82（95%CI0.77–0.88）、感度93%、特異度59%。アウトカムは抄録・Table 4のFIM歩行≥6／≤5を採用。Methodsの>6、Resultsの非自立<5は抄録・表と不一致で、その表記差を保持する。ROC閾値は213名で得た値であり、PSM後84名の45.2%対11.9%は個人の予測確率ではない。単施設後ろ向き研究、外部検証なし。回帰分析のORを組み合わせた確率計算は切片が未掲載のため行わない。",
      timeline: timeline(unknownPoint("On admission to rehabilitation hospital", "Table 1には自立群16日・非自立群20日の中央値があるが全体の中央値は未掲載。群別中央値から全体値を作らない。")),
      evidenceReview: review(satoUrl, "Abstract p.226、Methods p.227、Results p.229、Figure 2 p.231、Table 4・Discussion p.232、Conclusion p.233", "FACT≥8とROC性能を確認。FIM歩行の不等号の本文内不一致を注記し、抄録・表の≥6を採用。"),
      study: { year: 2025, doi: WALKING_SOURCE_DOIS[2], sampleSize: 213, outcome: "discharge_FIM_walking_ge_6", validation: "single_center_retrospective_no_external_validation", outcomeNotationDiscrepancy: true },
    }, sensitivity: 0.93, specificity: 0.59, auc: 0.82,
  };

  const murakamiUrl = "https://doi.org/10.11336/jjcrs.17.24";
  const branch = (id, field, fieldLabel, threshold, yes, no) => ({ id, field, fieldLabel, operator: "<=", threshold, trueNodeId: yes, falseNodeId: no });
  const leaf = (id, independent, total, isPositive, label, tie = false) => ({
    id, field: "", fieldLabel: "", operator: "boolean", isLeaf: true, isPositive,
    // Store frequencies as metadata; binary mode still returns probability:null.
    probability: independent / total,
    message: `${label}：研究内の歩行自立者${independent}/${total}名（${(100 * independent / total).toFixed(1)}%）。${tie ? "自立・非自立が同数のため、原著の規則では非自立に分類。" : isPositive ? "原著の分類は歩行自立。" : "原著の分類は歩行非自立。"}患者個人の予測確率や獲得不能の判定ではありません。`,
  });
  const murakami = ["FACT", "TCT"].map((model, i) => {
    const fact = model === "FACT";
    return {
      ...common, outcomeId, sortOrder: 54 + i,
      // Alternative models on the same 196 patients: display both, don't add votes.
      consensusEligible: false,
      name: `入院時運動FIM・非麻痺側SIAS・${model}の決定木（Murakamiら2026）`, ruleType: "decision_tree",
      source: "Murakami M, Sato R, Ogasawara K, Kimura Y. (2026) Prediction Models for Gait Independence in Patients with Post-Stroke Hemiplegia in a Convalescent Rehabilitation Ward: Comparison of Predictive Performance Between Different Trunk Function Assessments. Jpn J Compr Rehabil Sci 17:24–32. doi:10.11336/jjcrs.17.24", sourceUrl: murakamiUrl,
      applyConditions: [rehabWard(), strokeTypes(), condition("hemiparesis_present", "boolean", true, "脳卒中による片麻痺あり")],
      ruleDefinition: {
        type: "decision_tree", outputMode: "binary", inputTimepoint: "admission",
        description: `入院時の運動FIM・非麻痺側SIAS機能・${model}から退院時FIM歩行≥6を検討する決定木。同一研究の代替モデルのため参考結果として表示。`,
        nodes: [
          branch("root", "admission_fim_motor_total", "入院時運動FIM", 19, "low", "motor30"),
          branch("motor30", "admission_fim_motor_total", "入院時運動FIM", 30, "sias", "motor50"),
          branch("motor50", "admission_fim_motor_total", "入院時運動FIM", 50, "trunk", "high"),
          branch("sias", "admission_sias_nonparetic", "入院時SIAS非麻痺側（大腿四頭筋＋握力）", 3, "siasLow", "siasHigh"),
          branch("trunk", fact ? "admission_fact_score" : "admission_tct_score", `入院時${model}`, fact ? 11 : 87, "trunkLow", "trunkHigh"),
          leaf("low", 0, 99, false, "運動FIM≤19"),
          leaf("high", 18, 19, true, "運動FIM≥51"),
          leaf("siasLow", 0, 25, false, "運動FIM20〜30・非麻痺側SIAS≤3"),
          leaf("siasHigh", 7, 14, false, "運動FIM20〜30・非麻痺側SIAS≥4", true),
          leaf("trunkLow", fact ? 4 : 3, fact ? 15 : 13, false, `運動FIM31〜50・${model}≤${fact ? 11 : 87}`),
          leaf("trunkHigh", fact ? 18 : 19, fact ? 24 : 26, true, `運動FIM31〜50・${model}≥${fact ? 12 : 88}`),
        ],
        notes: "対象：西堀病院の回復期リハビリテーション病棟に2020年10月〜2024年3月に入棟した脳卒中片麻痺患者196名（男性102、女性94、平均77.7歳）。脳梗塞・脳内出血、必要な評価が可能で退院までリハを継続した患者。意識障害・重い高次脳機能障害で評価困難、急変・死亡・転院、欠測を除外。入棟1週以内の評価から退院時FIM歩行≥6を検討。発症から入棟平均36.7日、在院平均120.9日。運動FIMを≤19／20〜30／31〜50／≥51の4群に分け、20〜30では非麻痺側SIAS≥4、31〜50ではFACT≥12またはTCT≥88で分岐する。非麻痺側SIASは大腿四頭筋筋力と握力の合計（0〜6）で、麻痺側下肢SIAS（0〜15）や膝伸展筋力Nm/kgで代用しない。終端は多数決、同数は非自立とする原著の規則を保持。0/99や0/25という研究内頻度を将来の歩行自立確率0%に変換しない。FACT版・TCT版は同一196名の代替モデルであり、いずれも有効な参考結果として照合するが、支持／困難の集計には加えない。単施設後ろ向き・10分割内部交差検証のみ、外部検証なし。" +
          (fact ? "FACT版：学習データ正解率90.8%、10分割交差検証正解率84.7%。群別正解率（自立76.6%・非自立95.3%）は学習データであり、交差検証の感度・特異度として登録しない。" : "TCT版：学習データ正解率90.8%、10分割交差検証正解率83.2%。群別正解率（自立78.7%・非自立94.6%）は学習データであり、交差検証の感度・特異度として登録しない。") +
          "抄録のAUC0.968（FACT）・0.971（TCT）は補助解析のロジスティック回帰の値で、決定木のAUCではない。回帰の切片未掲載につき確率計算モデルは作らない。",
        timeline: timeline({ value: 36.7, unit: "day", precision: "mean", originalText: "Within one week of admission; mean 36.7 days from onset to admission", basis: "Methods p.25、Results p.26。入棟時平均であり、1週の評価窓を発症起点の固定範囲には変換しない。" }),
        evidenceReview: review(murakamiUrl, `Methods pp.25–26、Figure ${fact ? 1 : 2} p.${fact ? 27 : 28}、Results pp.26–28、Limitations p.31`, "図の全6終端と境界・人数を目視照合。同数の非自立分類を保持し、回帰AUCを決定木へ転用しない。"),
        study: { year: 2026, doi: WALKING_SOURCE_DOIS[3], cohortGroup: "murakami-2026-196", sampleSize: 196, model, outcome: "discharge_FIM_walking_ge_6", validation: "ten_fold_internal_cross_validation", resubstitutionAccuracy: 0.908, crossValidatedAccuracy: fact ? 0.847 : 0.832, supplementaryLogisticAUC: fact ? 0.968 : 0.971, consensusReason: "同一集団の代替モデル2件を独立した文献2票として加算しないため参考結果。" },
      }, accuracy: fact ? 0.847 : 0.832,
    };
  });
  return [jenkin, ...kimRules, sato, ...murakami];
}
