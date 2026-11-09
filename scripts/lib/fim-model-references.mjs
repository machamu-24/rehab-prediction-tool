// These are deliberately incomplete, inactive source records. Missing parameters
// stay null; evidenceReview blocks evaluation before mathematical validation.
export const fimReferenceOutcomes = [
  { name: "発症90日後の運動FIM >61点", description: "発症90日時点の運動FIM合計が61点を超えること（整数では62点以上）。退院時や歩行自立とは別の二値アウトカム。", unit: "達成／非達成", positiveLabel: "運動FIM >61点", negativeLabel: "運動FIM ≤61点", isDefault: false, sortOrder: 5 },
  { name: "退院時の運動FIM >61点", description: "入院リハビリ退院時の運動FIM合計が61点を超えること（整数では62点以上）。発症90日後や歩行自立とは別の二値アウトカム。", unit: "達成／非達成", positiveLabel: "運動FIM >61点", negativeLabel: "運動FIM ≤61点", isDefault: false, sortOrder: 6 },
  { name: "退院時FIS身体自立度 ≥5", description: "Functional Independence Stagingの身体自立度grade 5以上。項目ごとの要件を持つ段階分類で、全FIM項目5点以上や完全自立ではない。", unit: "達成／非達成", positiveLabel: "FIS grade ≥5", negativeLabel: "FIS grade <5", isDefault: false, sortOrder: 7 },
];

const review = (reason, location, sourceUrl) => ({ status: "blocked", reason, location, sourceUrl, reviewedAt: "2026-10-30", revision: "fim-primary-source-reference-2026-10-30-v1" });
const base = { evidenceLevel: "Cohort Study", accuracy: null, sensitivity: null, specificity: null, auc: null, consensusEligible: false, isActive: false };

export function createFimModelReferences(outcomeIds) {
  const fukudaUrl = "https://doi.org/10.1016/j.jstrokecerebrovasdis.2024.108185";
  const maugeriUrl = "https://doi.org/10.1161/STROKEAHA.117.018058";
  const fukuda = {
    ...base, outcomeId: outcomeIds[0], name: "B-ADLスコア（Fukudaら2025・境界値確認待ち／参考登録）", ruleType: "scoring_system", sortOrder: 46,
    source: "Fukuda S, Yamamoto N, Tomita Y, et al. Development and validation of clinical prediction model for functional independence measure following stroke rehabilitation. J Stroke Cerebrovasc Dis. 2025;34(2):108185. doi:10.1016/j.jstrokecerebrovasdis.2024.108185", sourceUrl: fukudaUrl,
    applyConditions: [
      { field: "admission_ward_type", operator: "equals", value: "回復期リハビリテーション病棟", label: "回復期病棟の入棟時評価" },
      { field: "days_onset_to_admission", operator: "<", value: 90, label: "発症90日以内の入棟かつ予測時点が発症90日より前（90日当日は将来予測にならないため除く）" },
    ],
    ruleDefinition: {
      type: "scoring_system", inputTimepoint: "admission", threshold: 5.5, maxScore: 12,
      description: "入棟時の6因子から、発症90日後の運動FIM >61点を予測する12点満点のB-ADL。本文・表のアルブミン境界が不一致のため自動計算は停止。",
      // Albumin boundary and equality are unresolved. Do not silently choose 3.5 or 3.55.
      items: [
        { field: "admission_age", fieldLabel: "入棟時年齢", unit: "歳", bands: [{ operator: "<", value: 70.5, score: 1, label: "70.5歳未満（若年側）" }, { operator: ">", value: 70.5, score: 0, label: "高齢側" }] },
        { field: "days_onset_to_admission", fieldLabel: "発症から入棟までの日数", unit: "日", bands: [{ operator: "<", value: 37.5, score: 1, label: "37.5日未満（早期側）" }, { operator: ">", value: 37.5, score: 0, label: "遅期側" }] },
        { field: "admission_albumin_g_dl", fieldLabel: "入棟時血清アルブミン", unit: "g/dL", bands: [{ operator: ">", value: null, score: 1, label: "高値側：本文3.55／Table 2は3.5。境界・等号未確定" }, { operator: "<", value: null, score: 0, label: "低値側：境界未確定" }] },
        { field: "admission_brs_upper", fieldLabel: "入棟時Brunnstrom上肢", unit: "stage", bands: [{ operator: ">", value: 3.5, score: 1, label: "stage IV〜VI" }, { operator: "<", value: 3.5, score: 0, label: "stage I〜III" }] },
        { field: "admission_bbs_score", fieldLabel: "入棟時BBS", unit: "点", bands: [{ operator: ">", value: 14.5, score: 3, label: "15点以上" }, { operator: "<", value: 14.5, score: 0, label: "14点以下" }] },
        { field: "admission_fim_total", fieldLabel: "入棟時FIM総得点", unit: "点", bands: [{ operator: ">", value: 49.5, score: 5, label: "50点以上" }, { operator: "<", value: 49.5, score: 0, label: "49点以下" }] },
      ],
      positiveMessage: "B-ADL 6点以上：発症90日後の運動FIM >61点達成を示唆（境界未確定のため計算停止）",
      negativeMessage: "B-ADL 5点以下：発症90日後の運動FIM >61点非達成を示唆（境界未確定のため計算停止）",
      notes: "対象：日本の橋本病院、2016年4月〜2023年10月、発症90日以内の回復期入棟と発症3ヶ月後追跡。脳梗塞326名・脳内出血197名・くも膜下出血43名、再発例を含む。結果・表は566名（開発452・検証114）だがMethodsは556名、男女315+351名で総数と不一致。発症と同時期の他疾患（大腿骨近位部骨折等）・欠測を除外。死亡8名は非達成に分類。平均74歳、入棟時発症後中央値33日（IQR23〜44）。発症90日後運動FIM >61点が220名（38.8%）。6項目は全て入棟時。Table 4の配点を保持（年齢1、日数1、Alb1、BRS上肢1、BBS3、総FIM5）、5.5点境界は整数で6点以上。Albは本文3.55とTable 2の3.5 g/dLが不一致。Table 3係数の最小係数で割って丸めるというMethodsの記述からもTable 4の配点を単純に再現できないため、独自修正しない。Table 4スコア開発AUC0.95（0.93〜0.97）、感度91.5%・特異度89.2%、検証AUC0.89（0.82〜0.96）、感度94.5%・特異度83.1%。抄録・本文が検証スコアのAUC0.950とする箇所と不一致。連続変数モデルAUC0.917、二値化ロジスティックモデルAUC0.955／検証0.970はスコアの成績ではない。Table 3検証欄は別係数も報告しており、凍結した開発式の検証か再推定か要確認。単施設・内部検証のみ。運動FIM >61は全ADL完全自立・歩行自立・自宅退院を意味しない。達成者の90%が自宅退院した関連を自宅復帰確率に転用しない。自動計算再開にはAlb境界・等号および配点・検証方法の原著補足資料または著者確認が必要。",
      timeline: { version: 1, anchor: "stroke_onset", kind: "future", evaluation: { value: 33, unit: "day", precision: "median", originalText: "At rehabilitation admission, median 33 days (IQR 23–44)", basis: "Results p.3。入棟日数の中央値。IQRを適用範囲にはしない。" }, target: { value: 90, unit: "day", precision: "exact", originalText: "90 days / 3 months post-stroke onset", basis: "Primary outcomeと本文の90日表記。入棟90日後・退院時ではない。" } },
      evidenceReview: review("自動計算停止：Albカットオフが本文3.55、Table 2で3.5 g/dLと不一致（等号も未確定）。Table 4配点と係数からの換算法、性能・人数にも不一致があり、補足資料または著者確認待ち。", "Methods p.2、Results p.3、Tables 2–4 pp.4–5。本文全6頁を確認。", fukudaUrl),
      study: { year: 2025, doi: "10.1016/j.jstrokecerebrovasdis.2024.108185", reportedN: 566, methodsN: 556, developmentN: 452, validationN: 114, scoreDevelopmentAUC: 0.95, scoreValidationAUC: 0.89, albuminCutoffInText: 3.55, albuminCutoffInTable2: 3.5, validationDesign: "single_center_random_split_internal_validation; frozen_model_vs_refit_requires_clarification" },
    },
  };
  const maugeri = [1, 2].map(model => {
    const primary = model === 1;
    return {
      ...base, outcomeId: outcomeIds[model], name: `Maugeriモデル${model}（Scrutinioら2017・切片確認待ち／参考登録）`, ruleType: "logistic_regression", sortOrder: 46 + model,
      source: "Scrutinio D, Lanzillo B, Guida P, et al. Development and Validation of a Predictive Model for Functional Outcome After Stroke Rehabilitation: The Maugeri Model. Stroke. 2017;48(12):3308–3315. doi:10.1161/STROKEAHA.117.018058", sourceUrl: maugeriUrl,
      applyConditions: [
        { field: "days_onset_to_admission", operator: "<=", value: 90, label: "発症90日以内に入院リハビリ" },
        { field: "admission_fim_total", operator: "<", value: 80, label: "入院時FIM総得点80点未満" },
        { field: "admission_fim_motor_total", operator: "<", value: 61, label: "入院時運動FIM61点未満" },
        { field: "stroke_type", operator: "!=", value: "くも膜下出血", label: "脳梗塞・脳内出血（SAHは検証範囲未確認）" },
        { field: "stroke_type", operator: "!=", value: "その他", label: "脳梗塞・脳内出血" },
      ],
      ruleDefinition: {
        type: "logistic_regression", modelType: "logistic", inputTimepoint: "admission", outputMode: "probability",
        // Table 2 omits the intercept. Null is intentional and must never become zero.
        intercept: null,
        variables: [
          { field: "admission_age", fieldLabel: "入院リハビリ開始時年齢", unit: "歳", coefficient: primary ? -0.035 : -0.046 },
          { field: "days_onset_to_admission", fieldLabel: "発症から入院リハビリまでの日数", unit: "日", coefficient: primary ? -0.032 : -0.038 },
          primary ? { field: "admission_spatial_neglect", fieldLabel: "入院時半側空間無視（あり=1）", coefficient: -1.280 } : { field: "sex", fieldLabel: "男性=1、女性=0", coefficient: 0.654, categoryMap: { 男性: 1, 女性: 0 } },
          { field: "admission_fim_motor_total", fieldLabel: "入院時運動FIM", unit: "点", coefficient: primary ? 0.138 : 0.146 },
          { field: "admission_fim_cognitive_total", fieldLabel: "入院時認知FIM", unit: "点", coefficient: primary ? 0.050 : 0.044 },
        ],
        description: primary ? "入院時の年齢・入院までの日数・半側空間無視・運動FIM・認知FIMから、退院時運動FIM >61点の確率を予測。切片未確認のため参考登録。" : "入院時の年齢・性別・入院までの日数・運動FIM・認知FIMから、退院時FIS身体自立度grade 5以上の確率を予測。切片未確認のため参考登録。",
        notes: "対象：イタリアMaugeri施設群の脳卒中入院リハビリ、発症90日以内、入院時FIM総得点<80かつ運動FIM<61（Methodsの組み入れ条件を採用）。開発717名（Cassano Murge、2002〜2011年）、検証875名（3施設、2009〜2016年の別時期・追加施設）。急性期転院・自己都合退院・院内死亡を除外。初発限定の記載なし。平均年齢72／70歳、発症から入院中央値25／15日、在院平均52／55日。予測対象は退院時で、発症90日後ではない。モデル1は運動FIM >61（達成206/717、274/875）、モデル2はFIS身体自立度≥5（100/717、160/875）。FIS5は整容・上衣更衣・移乗など≥5、入浴・下衣更衣・歩行/車いす≥4、食事・排尿・排便管理≥6、階段は全介助も許容。全ADL5点以上・完全自立ではない。Table 2の係数を保持するが、切片は補足Table Iにあり添付本文にはない。補足資料は取得できず、掲載計算ツールのDriveリンクもアクセス不可のため切片はnull。0補完、症例の予測確率からの逆算、別研究の係数の混用はしない。確率の二値判定閾値は設定しない。モデル1 AUCは開発0.883・検証0.866、モデル2は0.913・0.850。モデル2は検証でHosmer–Lemeshow p=0.001、高い予測確率群で過大推定。モデル1は重度群（入院時運動FIM<37）でも検証AUC0.826。達成と4年生存の関連はリハの因果的効果や生存確率の計算式ではない。3施設は同じ施設群で診療体制が似ており、国・在院期間・患者構成の違いに注意。2021年の別研究はMaugeri外部検証と称するが、Methods・Table 3では係数の再推定を行っており、元の固定式の直接検証と区別する。",
        timeline: { version: 1, anchor: "stroke_onset", kind: "future", evaluation: { value: 25, unit: "day", precision: "median", originalText: "At admission; derivation cohort median 25 days, validation cohort median 15 days", basis: "Table 1 p.3310。発症90日以内という組み入れ条件以外の独自範囲は設定しない。" }, target: { value: null, unit: "day", precision: "unknown", originalText: "At discharge from inpatient stroke rehabilitation", basis: "患者ごとに退院時期が異なる。入院時中央値と在院日数平均を足して退院時の代表日数を作らない。" } },
        evidenceReview: review("自動計算停止：確率算出に必要な切片が補足Table Iにあり、添付本文に未掲載。補足PDF・掲載計算ツールにアクセスできず未確認。切片を0や推定値で補わず、取得・照合まで保留。", "Methods p.3309、Table 1 p.3310、Table 2 p.3312、Validation p.3311、Figures 2–3。添付本文全8頁を確認。", maugeriUrl),
        study: { year: 2017, doi: "10.1161/STROKEAHA.117.018058", model, developmentN: 717, validationN: 875, developmentAUC: primary ? 0.883 : 0.913, validationAUC: primary ? 0.866 : 0.850, validationHosmerLemeshowP: primary ? 0.115 : 0.001, originalInterceptVerified: false, calibrationConcern: !primary },
      },
    };
  });
  return [fukuda, ...maugeri];
}
