export const KOYAMA_REVIEW_URL = "https://www.jstage.jst.go.jp/article/jjrmc/55/9/55_55.773/_article/-char/ja/";
export const koyamaOutcome = {
  name: "FIM総得点", description: "FIM総得点（運動13項目＋認知5項目、18〜126点）",
  unit: "点", positiveLabel: "高得点（自立度高）", negativeLabel: "低得点（要介助）", isDefault: false, sortOrder: 1,
};

export function createKoyamaRule(outcomeId) {
  return {
    outcomeId,
    name: "FIM総得点の対数曲線予測（Koyamaら2005／小山2018総説に基づく）",
    ruleType: "custom_formula",
    source: "Koyama T, Matsumoto K, Okuno T, Domen K. A new method for predicting functional recovery of stroke patients with hemiplegia: logarithmic modelling. Clin Rehabil. 2005;19:779–789. doi:10.1191/0269215505cr876oa. 実装根拠：小山哲男．脳卒中患者の帰結予測―FIM，拡散テンソル法MRI，自宅復帰―．Jpn J Rehabil Med. 2018;55:773–782. doi:10.2490/jjrmc.55.773（総説p.773–776・図2、原著本文未確認）",
    sourceUrl: KOYAMA_REVIEW_URL,
    evidenceLevel: "Other",
    applyConditions: [
      { field: "admission_ward_type", operator: "equals", value: "回復期リハビリテーション病棟", label: "回復期リハビリテーション病棟入院" },
      { field: "first_stroke", operator: "boolean", value: true, label: "初発脳卒中" },
      { field: "prestroke_adl_independent", operator: "boolean", value: true, label: "発症前ADL自立" },
      { field: "supratentorial_stroke", operator: "boolean", value: true, label: "テント上病変" },
      { field: "admission_wheelchair", operator: "boolean", value: true, label: "回復期入院時の移動手段が車いす" },
      { field: "hemiparesis_present", operator: "boolean", value: true, label: "片麻痺を伴う" },
      { field: "stroke_type", operator: "!=", value: "くも膜下出血", label: "くも膜下出血以外" },
      { field: "stroke_type", operator: "!=", value: "その他", label: "脳梗塞・脳出血" },
    ],
    ruleDefinition: {
      type: "custom_formula", modelType: "koyama_fim_total", outputMode: "continuous", outputUnit: "点",
      description: "回復期入院時Aと2〜6週後BのFIM総得点から、発症後の指定日XのFIM総得点を対数曲線で参考予測する。運動FIM単独・項目別難易度モデルとは区別する。原著本文未確認のため総説と公開抄録に基づく登録。",
      formula: "koyama_fim_total_a + (koyama_fim_total_b - koyama_fim_total_a) * ln(koyama_target_day / koyama_day_a) / ln(koyama_day_b / koyama_day_a)",
      formulaDescription: "F(X) = F(A) + [F(B) − F(A)] × ln(X/A) / ln(B/A)。β = [F(B) − F(A)] / ln(B/A)。lnは自然対数。A・B・Xは発症日＝0日からの日数。",
      variables: [
        { field: "koyama_day_a", fieldLabel: "A：回復期入院時の発症後日数", unit: "日" },
        { field: "koyama_fim_total_a", fieldLabel: "A：回復期入院時のFIM総得点", unit: "点" },
        { field: "koyama_day_b", fieldLabel: "B：再評価時の発症後日数", unit: "日" },
        { field: "koyama_fim_total_b", fieldLabel: "B：再評価時のFIM総得点", unit: "点" },
        { field: "koyama_target_day", fieldLabel: "X：予測したい発症後日数", unit: "日" },
      ],
      notes: "対象：発症前ADL自立、初発テント上脳卒中、車いすで回復期病棟に入院した片麻痺患者。総説p.773：入院時と2〜6週後から、退院頃（発症4〜6カ月後）までの経過を予測。原著公開抄録：発症30〜60日後に転院した18例、入院時FIM総得点25〜107点、被験者間R²=0.945。認知より運動機能の回復に適合。原著本文は未確認で、選定・除外条件、個人の誤差幅、予測区間などの詳細は未確認。2017年の他施設検証111例・ICC=0.89は運動FIMの成績であり、本登録の総得点の精度指標に転用しない。総説p.774の50人は項目別難易度研究で、本モデルの検証人数ではない。比較的重症で緩徐に回復する症例に適合しやすく、テント下病変・くも膜下出血・片麻痺に乏しい高次機能障害中心の症例には適用しない。2003年頃からのデータと現在の転院時期の差に注意。2点に必ず一致するため2点だけでは適合性を検証できず、測定誤差・合併症・天井効果を考慮できない。項目別ADL自立確率・自宅復帰を算出するモデルではない。アプリの制限：Aは発症30〜60日、BはAから14〜42日後、XはBより後かつ180日以内（約半年を180日とする運用上の上限で、厳密な検証境界ではない）。低下例は予測停止、横ばいは注意表示。計算値が総得点18〜126点を超えた場合は範囲外として表示停止し、上限・下限に丸めない。支持・困難の集計には含めず、参考予測として臨床的に再確認する。",
      usageExample: "架空例：A=30日・FIM総得点40点、B=45日・55点、X=90日 → 80.64点。総説図2の日数例に説明用の架空点数を組み合わせたもので、論文掲載症例ではない。",
      verification: {
        sourceUrl: KOYAMA_REVIEW_URL, originalAbstractUrl: "https://pubmed.ncbi.nlm.nih.gov/16250198/",
        location: "小山2018 p.773（適応・期間・検証）、p.775図2(A)〜(C)（数式）、p.776（時代差）。原著は公開抄録のみ。",
        revision: "koyama-fim-total-logarithmic-2005-review2018-v1", originalFullTextReviewed: false,
      },
      study: {
        title: "A new method for predicting functional recovery of stroke patients with hemiplegia: logarithmic modelling",
        authors: ["Tetsuo Koyama", "Kenji Matsumoto", "Taiji Okuno", "Kazuhisa Domen"],
        year: 2005, doi: "10.1191/0269215505cr876oa", sampleSize: 18, acrossSubjectRSquared: 0.945,
        outcomeScale: "FIM total (18–126)", evidenceBasis: "2018 author review plus original public abstract; original full text not reviewed",
      },
    },
    accuracy: null, sensitivity: null, specificity: null, auc: null,
    consensusEligible: false, isActive: true, sortOrder: 41,
  };
}
