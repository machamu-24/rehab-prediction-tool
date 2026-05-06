/**
 * 論文から抽出した文献ルールのシードデータ投入スクリプト
 * 対象論文:
 *   1. 膝伸展筋力カットオフ値（松下ら, 理学療法科学 2022）
 *   2. 信号検出分析による決定木（吉松ら, 理学療法科学 2018）
 *   3. スコアリングシステム（池上ら, 理学療法科学 2025）
 *   4. ノモグラム（池上ら, Jpn J Rehabil Med 2025）
 *   5. 変化量を用いた決定木（石野ら, 愛知県理学療法学会誌 2023）
 *   6. FIM運動項目予測 重回帰式（阿部ら, J-STAGE 2026）
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);
console.log("🌱 論文由来の文献ルールを投入中...");

// ---- アウトカムIDを取得 ----
const [outcomeRows] = await connection.execute(
  "SELECT id FROM outcomes WHERE name = '歩行自立' LIMIT 1"
);
if (!outcomeRows.length) {
  console.error("❌ アウトカム「歩行自立」が見つかりません。先に seed.mjs を実行してください。");
  await connection.end();
  process.exit(1);
}
const walkOutcomeId = outcomeRows[0].id;

// ---- FIM運動項目アウトカムを登録（なければ） ----
await connection.execute(
  `INSERT INTO outcomes (name, description, unit, positiveLabel, negativeLabel, isDefault, sortOrder)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE name=name`,
  [
    "FIM運動項目",
    "退院時FIM運動項目合計スコア（13項目, 最大91点）",
    "点",
    "高得点（自立度高）",
    "低得点（要介助）",
    0,
    2,
  ]
);
const [fimOutcomeRows] = await connection.execute(
  "SELECT id FROM outcomes WHERE name = 'FIM運動項目' LIMIT 1"
);
const fimOutcomeId = fimOutcomeRows[0].id;
console.log(`✅ アウトカム「FIM運動項目」ID: ${fimOutcomeId}`);

// ---- 文献ルール登録 ----
const rules = [
  // ===== 論文1: 膝伸展筋力カットオフ値 =====
  {
    outcomeId: walkOutcomeId,
    name: "麻痺側膝伸展筋力カットオフ（病棟歩行自立）",
    ruleType: "cutoff",
    source: "松下達也ら（2022）理学療法科学 37(4): 275-280",
    authors: "松下達也, 葉山恵理, 中島龍征",
    journal: "理学療法科学",
    year: 2022,
    sourceUrl: "https://www.jstage.jst.go.jp/browse/rigaku",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "cutoff",
      field: "knee_ext_paretic_nm_kg",
      fieldLabel: "麻痺側膝伸展筋力（Nm/kg）",
      operator: ">=",
      threshold: 0.631,
      unit: "Nm/kg",
      positiveMessage: "病棟歩行自立の可能性が高い（麻痺側膝伸展筋力 ≥ 0.631 Nm/kg）",
      negativeMessage: "病棟歩行自立は困難な可能性（麻痺側膝伸展筋力 < 0.631 Nm/kg）",
      notes: "対象: 回復期脳卒中片麻痺患者658名（中央値74歳）。Youden index法によるROC曲線から算出。kgf/kg換算では ≥ 0.178 kgf/kg。",
    }),
    accuracy: null,
    sensitivity: 0.709,
    specificity: 0.628,
    auc: 0.713,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 10,
  },
  {
    outcomeId: walkOutcomeId,
    name: "両側合計膝伸展筋力カットオフ（病棟歩行自立）",
    ruleType: "cutoff",
    source: "松下達也ら（2022）理学療法科学 37(4): 275-280",
    authors: "松下達也, 葉山恵理, 中島龍征",
    journal: "理学療法科学",
    year: 2022,
    sourceUrl: "https://www.jstage.jst.go.jp/browse/rigaku",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "cutoff",
      field: "knee_ext_total_nm_kg",
      fieldLabel: "両側合計膝伸展筋力（Nm/kg）",
      operator: ">=",
      threshold: 1.621,
      unit: "Nm/kg",
      positiveMessage: "病棟歩行自立の可能性が高い（両側合計膝伸展筋力 ≥ 1.621 Nm/kg）",
      negativeMessage: "病棟歩行自立は困難な可能性（両側合計膝伸展筋力 < 1.621 Nm/kg）",
      notes: "AUCは3指標中最高（0.729）。kgf/kg換算では ≥ 0.455 kgf/kg。",
    }),
    accuracy: null,
    sensitivity: 0.687,
    specificity: 0.654,
    auc: 0.729,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 11,
  },

  // ===== 論文2: 信号検出分析による決定木（FBS・起居動作・認知機能） =====
  {
    outcomeId: walkOutcomeId,
    name: "FBS・起居動作・認知機能による決定木（入院3ヶ月後歩行自立）",
    ruleType: "decision_tree",
    source: "吉松竜貴ら（2018）理学療法科学 33(1): 145-150",
    authors: "吉松竜貴, 加辺憲人, 橋本祥行, 牧迫飛雄馬",
    journal: "理学療法科学",
    year: 2018,
    sourceUrl: "https://www.jstage.jst.go.jp/article/rigaku/33/1/33_145/_article/-char/ja",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "decision_tree",
      description: "信号検出分析法（Signal Detection Analysis）による決定木。入院時情報から3ヶ月後の歩行自立を予測する。",
      nodes: [
        {
          id: "root",
          field: "fbs_score",
          fieldLabel: "Functional Balance Scale（FBS）",
          operator: ">=",
          threshold: 13,
          unit: "点",
          trueNodeId: "leaf_group1",
          falseNodeId: "check_sit_up",
        },
        {
          id: "check_sit_up",
          field: "sit_up_independent",
          fieldLabel: "起居動作（介助不要）",
          operator: "boolean",
          trueNodeId: "leaf_group2",
          falseNodeId: "check_cognition",
        },
        {
          id: "check_cognition",
          field: "cognitive_impairment",
          fieldLabel: "認知機能低下あり",
          operator: "boolean_negative",
          trueNodeId: "leaf_group3",
          falseNodeId: "leaf_group4",
        },
        {
          id: "leaf_group1",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: true,
          probability: 0.683,
          message: "グループ1: 歩行自立率68.3%（FBS≥13点）",
        },
        {
          id: "leaf_group2",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: true,
          probability: 0.306,
          message: "グループ2: 歩行自立率30.6%（FBS<13 & 起居動作介助不要）",
        },
        {
          id: "leaf_group3",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: false,
          probability: 0.222,
          message: "グループ3: 歩行自立率22.2%（FBS<13 & 起居動作介助必要 & 認知機能低下なし）",
        },
        {
          id: "leaf_group4",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: false,
          probability: 0.055,
          message: "グループ4: 歩行自立率5.5%（FBS<13 & 起居動作介助必要 & 認知機能低下あり）",
        },
      ],
      notes: "対象: 初発脳卒中患者251名（年齢68.4±11.1歳）。全体歩行自立率25.9%（65/251名）。グループ4を参照群とした場合のOR: グループ3=4.9, グループ2=7.6, グループ1=37.3。",
    }),
    accuracy: null,
    sensitivity: 0.631,
    specificity: 0.898,
    auc: null,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 12,
  },

  // ===== 論文3: スコアリングシステム（池上ら 2025） =====
  {
    outcomeId: walkOutcomeId,
    name: "歩行自立スコア（年齢・BBS・FIM運動・FIM認知）",
    ruleType: "scoring_system",
    source: "池上滉一ら（2025）理学療法科学 40(4): 181-187",
    authors: "池上滉一, 船引啓祐, 中谷友哉, 田中裕規, 虎津裕, 餅脩佑",
    journal: "理学療法科学",
    year: 2025,
    sourceUrl: "https://www.jstage.jst.go.jp/article/rigaku/40/4/40_181/_article/-char/ja",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "scoring_system",
      description: "入棟時情報から退院時の平地歩行自立を予測するスコアリングシステム。各因子のROC曲線から最適カットオフ値を算出し、各1点を割り振る（合計0-4点）。",
      items: [
        {
          field: "age",
          fieldLabel: "年齢（歳）",
          unit: "歳",
          bands: [
            { operator: "<=", value: 77.5, score: 1, label: "≤77.5歳" },
            { operator: ">",  value: 77.5, score: 0, label: ">77.5歳" },
          ],
          auc: 0.713,
        },
        {
          field: "bbs_score",
          fieldLabel: "Berg Balance Scale（BBS）",
          unit: "点",
          bands: [
            { operator: ">=", value: 16, score: 1, label: "≥16点" },
            { operator: "<",  value: 16, score: 0, label: "<16点" },
          ],
          auc: 0.825,
        },
        {
          field: "fim_motor_total",
          fieldLabel: "FIM運動項目合計",
          unit: "点",
          bands: [
            { operator: ">=", value: 37.5, score: 1, label: "≥37.5点" },
            { operator: "<",  value: 37.5, score: 0, label: "<37.5点" },
          ],
          auc: 0.838,
        },
        {
          field: "fim_cognitive_total",
          fieldLabel: "FIM認知項目合計",
          unit: "点",
          bands: [
            { operator: ">=", value: 20.5, score: 1, label: "≥20.5点" },
            { operator: "<",  value: 20.5, score: 0, label: "<20.5点" },
          ],
          auc: 0.838,
        },
      ],
      threshold: 3,
      maxScore: 4,
      scoreProbabilityTable: [
        { score: 4, probability: 0.925, n: 53, positiveN: 49 },
        { score: 3, probability: 0.789, n: 57, positiveN: 45 },
        { score: 2, probability: 0.406, n: 32, positiveN: 13 },
        { score: 1, probability: 0.189, n: 53, positiveN: 10 },
        { score: 0, probability: 0.000, n: 34, positiveN: 0 },
      ],
      positiveMessage: "退院時平地歩行自立の可能性が高い（スコア≥3点: 自立率78.9-92.5%）",
      negativeMessage: "退院時平地歩行自立は困難な可能性（スコア≤2点: 自立率0-40.6%）",
      notes: "対象: 229名（自立群117名, 非自立群112名）。最適カットオフ3点: 感度80.3%, 特異度85.7%, AUC=0.890。",
    }),
    accuracy: null,
    sensitivity: 0.803,
    specificity: 0.857,
    auc: 0.890,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 13,
  },

  // ===== 論文4: ノモグラム（池上ら Jpn J Rehabil Med 2025） =====
  {
    outcomeId: walkOutcomeId,
    name: "平地歩行自立時期予測ノモグラム（Cox比例ハザードモデル）",
    ruleType: "nomogram",
    source: "池上滉一ら（2025）Jpn J Rehabil Med 62(11): 1139-1150",
    authors: "池上滉一, 船引啓祐, 中谷友哉, 田中裕規, 虎津裕, 餅脩佑",
    journal: "Japanese Journal of Rehabilitation Medicine",
    year: 2025,
    sourceUrl: "https://doi.org/10.2490/jjrmc.25020",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "nomogram",
      description: "Cox比例ハザード分析に基づくノモグラム。入棟時情報から発症30・60・90・120日後の平地歩行自立確率を時系列で予測する。",
      modelType: "cox_proportional_hazards",
      variables: [
        {
          field: "age",
          fieldLabel: "年齢",
          unit: "歳",
          coefficient: -0.026,
          hazardRatio: 0.974,
          ci95: [0.958, 0.991],
          pValue: 0.01,
          direction: "negative",
          notes: "年齢が高いほど歩行自立が遅れる",
        },
        {
          field: "days_post_stroke",
          fieldLabel: "発症後日数（発症から入棟まで）",
          unit: "日",
          coefficient: -0.034,
          hazardRatio: 0.966,
          ci95: [0.937, 0.997],
          pValue: 0.05,
          direction: "negative",
          notes: "発症後日数が多いほど歩行自立が遅れる",
        },
        {
          field: "sit_up_independent",
          fieldLabel: "起き上がり能力（介助なし=1, 介助あり=0）",
          unit: "binary",
          coefficient: 0.649,
          hazardRatio: 1.912,
          ci95: [1.117, 3.274],
          pValue: 0.05,
          direction: "positive",
          notes: "起き上がり介助不要で歩行自立が早まる",
        },
        {
          field: "bbs_score",
          fieldLabel: "Berg Balance Scale（BBS）",
          unit: "点",
          coefficient: 0.031,
          hazardRatio: 1.031,
          ci95: [1.015, 1.048],
          pValue: 0.001,
          direction: "positive",
          notes: "BBS高いほど歩行自立が早まる",
        },
        {
          field: "fim_motor_total",
          fieldLabel: "FIM運動項目合計",
          unit: "点",
          coefficient: 0.024,
          hazardRatio: 1.024,
          ci95: [1.008, 1.040],
          pValue: 0.01,
          direction: "positive",
          notes: "FIM運動高いほど歩行自立が早まる",
        },
        {
          field: "fim_cognitive_total",
          fieldLabel: "FIM認知項目合計",
          unit: "点",
          coefficient: 0.076,
          hazardRatio: 1.079,
          ci95: [1.047, 1.113],
          pValue: 0.001,
          direction: "positive",
          notes: "FIM認知高いほど歩行自立が早まる",
        },
      ],
      outcomeTimepoints: [30, 60, 90, 120],
      outcomeLabelTemplate: "発症{days}日後の平地歩行自立確率",
      usageExample: "年齢70歳, 発症後17日, 起き上がり介助なし, BBS 23点, FIM運動41点, FIM認知24点 → 合計約203ポイント → 発症120日後の歩行自立確率 約70%",
      positiveMessage: "発症120日後の平地歩行自立確率が高い（合計ポイントが高い）",
      negativeMessage: "発症120日後の平地歩行自立確率が低い（合計ポイントが低い）",
      notes: "対象: 228名。C-index=0.858（ブートストラップ0.851）。MAE=0.022, O/E比=1.040。発症120日以降の予測は対象外。",
    }),
    accuracy: null,
    sensitivity: null,
    specificity: null,
    auc: 0.858,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 14,
  },

  // ===== 論文5: 変化量を用いた決定木（石野ら 2023）- 重度群 =====
  {
    outcomeId: walkOutcomeId,
    name: "変化量を用いた決定木・重度群（ΔBBS・ΔFIM運動）",
    ruleType: "decision_tree",
    source: "石野晶大ら（2023）愛知県理学療法学会誌 第35巻",
    authors: "石野晶大, 山田一正, 藤井弘明, 三田拓馬, 細井勇一郎",
    journal: "愛知県理学療法学会誌",
    year: 2023,
    sourceUrl: "",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([
      { field: "fim_motor_total", operator: "<", value: 50, label: "入棟時FIM運動項目<50点（重度群）" },
    ]),
    ruleDefinition: JSON.stringify({
      type: "decision_tree",
      description: "入棟時FIM運動項目<50点（重度群）を対象とした決定木。入棟1ヶ月時の変化量を用いて退棟時歩行自立を予測する。",
      nodes: [
        {
          id: "root",
          field: "delta_bbs_1month",
          fieldLabel: "入棟1ヶ月時BBS変化量（ΔBBS）",
          operator: ">=",
          threshold: 9,
          unit: "点",
          trueNodeId: "leaf_high",
          falseNodeId: "check_delta_fim",
        },
        {
          id: "check_delta_fim",
          field: "delta_fim_motor_1month",
          fieldLabel: "入棟1ヶ月時FIM運動変化量（ΔFIM運動）",
          operator: ">=",
          threshold: 10,
          unit: "点",
          trueNodeId: "leaf_mid",
          falseNodeId: "leaf_low",
        },
        {
          id: "leaf_high",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: true,
          message: "退棟時歩行自立の可能性が高い（ΔBBS≥9点）",
        },
        {
          id: "leaf_mid",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: false,
          message: "退棟時歩行自立の可能性が中程度（ΔBBS<9 & ΔFIM運動≥10点）",
        },
        {
          id: "leaf_low",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: false,
          message: "退棟時歩行自立は困難な可能性（ΔBBS<9 & ΔFIM運動<10点）",
        },
      ],
      notes: "対象: 重度群（入棟時FIM運動<50点）n=201。感度71.4%, 特異度72.5%, AUC=0.76。入棟1ヶ月後の評価が必要。",
    }),
    accuracy: null,
    sensitivity: 0.714,
    specificity: 0.725,
    auc: 0.76,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 15,
  },

  // ===== 論文5: 変化量を用いた決定木 - 中等度群 =====
  {
    outcomeId: walkOutcomeId,
    name: "変化量を用いた決定木・中等度群（ΔFIM運動・CBA）",
    ruleType: "decision_tree",
    source: "石野晶大ら（2023）愛知県理学療法学会誌 第35巻",
    authors: "石野晶大, 山田一正, 藤井弘明, 三田拓馬, 細井勇一郎",
    journal: "愛知県理学療法学会誌",
    year: 2023,
    sourceUrl: "",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([
      { field: "fim_motor_total", operator: ">=", value: 50, label: "入棟時FIM運動項目≥50点" },
      { field: "fim_motor_total", operator: "<", value: 70, label: "入棟時FIM運動項目<70点（中等度群）" },
    ]),
    ruleDefinition: JSON.stringify({
      type: "decision_tree",
      description: "入棟時FIM運動項目50-69点（中等度群）を対象とした決定木。入棟1ヶ月時の変化量を用いて退棟時歩行自立を予測する。",
      nodes: [
        {
          id: "root",
          field: "delta_fim_motor_1month",
          fieldLabel: "入棟1ヶ月時FIM運動変化量（ΔFIM運動）",
          operator: ">=",
          threshold: 7,
          unit: "点",
          trueNodeId: "leaf_high",
          falseNodeId: "check_cba",
        },
        {
          id: "check_cba",
          field: "cba_score",
          fieldLabel: "CBA（Cognitive-related Behavioral Assessment）",
          operator: ">=",
          threshold: 20,
          unit: "点",
          trueNodeId: "leaf_mid",
          falseNodeId: "leaf_low",
        },
        {
          id: "leaf_high",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: true,
          message: "退棟時歩行自立の可能性が高い（ΔFIM運動≥7点）",
        },
        {
          id: "leaf_mid",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: false,
          message: "退棟時歩行自立の可能性が中程度（ΔFIM運動<7 & CBA≥20点）",
        },
        {
          id: "leaf_low",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: false,
          message: "退棟時歩行自立は困難な可能性（ΔFIM運動<7 & CBA<20点）",
        },
      ],
      notes: "対象: 中等度群（入棟時FIM運動50-69点）n=211。感度78.3%, 特異度69.2%, AUC=0.79。入棟1ヶ月後の評価が必要。CBAは認知関連行動評価（0-30点）。",
    }),
    accuracy: null,
    sensitivity: 0.783,
    specificity: 0.692,
    auc: 0.79,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 16,
  },

  // ===== 論文6: FIM運動項目予測 重回帰式（阿部ら 2026） =====
  {
    outcomeId: fimOutcomeId,
    name: "退院時FIM運動項目予測 重回帰式",
    ruleType: "regression",
    source: "阿部専之ら（2026）J-STAGE早期公開",
    authors: "阿部専之, 大野啓介, 高橋良祐, 荒芳幸, 阿部正幸, 白坂友英",
    journal: "理学療法学（J-STAGE早期公開）",
    year: 2026,
    sourceUrl: "https://www.jstage.jst.go.jp/",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "regression",
      description: "重回帰分析による退院時FIM運動項目合計スコアの予測式。入院時FIM運動・認知項目、年齢、発症から入院までの日数を用いる。",
      formula: "fim_motor_discharge = fim_motor_admission * 0.97 + fim_cognitive_admission * 0.56 - age * 0.26 - days_onset_to_admission * 0.16 + 47.2",
      coefficients: [
        {
          field: "fim_motor_total",
          fieldLabel: "入院時FIM運動項目合計",
          unit: "点",
          coefficient: 0.97,
          pValue: 0.001,
        },
        {
          field: "fim_cognitive_total",
          fieldLabel: "入院時FIM認知項目合計",
          unit: "点",
          coefficient: 0.56,
          pValue: 0.001,
        },
        {
          field: "age",
          fieldLabel: "年齢",
          unit: "歳",
          coefficient: -0.26,
          pValue: 0.001,
        },
        {
          field: "days_onset_to_admission",
          fieldLabel: "発症から入院までの日数",
          unit: "日",
          coefficient: -0.16,
          pValue: 0.001,
        },
      ],
      intercept: 47.2,
      outputField: "fim_motor_discharge",
      outputFieldLabel: "退院時FIM運動項目合計（予測値）",
      outputUnit: "点",
      outputRange: [13, 91],
      positiveMessage: "退院時FIM運動項目の予測値が高い（自立度が高い）",
      negativeMessage: "退院時FIM運動項目の予測値が低い（要介助の可能性）",
      notes: "対象: 498名（2021年4月〜2023年3月）。5-fold交差検証: R²=0.699, RMSE=13.94。AIモデルとの比較でR²差0.016と小さく、臨床現場での実用性が高い。",
    }),
    accuracy: null,
    sensitivity: null,
    specificity: null,
    auc: null,
    consensusEligible: 0,
    isActive: 1,
    sortOrder: 17,
  },
];

// ---- DB挿入 ----
for (const rule of rules) {
  const {
    outcomeId, name, ruleType, source, authors, journal, year,
    sourceUrl, evidenceLevel, applyConditions, ruleDefinition,
    accuracy, sensitivity, specificity, auc, consensusEligible, isActive, sortOrder,
  } = rule;

  // 既存チェック（同名ルールがあればスキップ）
  const [existing] = await connection.execute(
    "SELECT id FROM literature_rules WHERE name = ? LIMIT 1",
    [name]
  );
  if (existing.length > 0) {
    console.log(`⏭️  スキップ（既存）: 「${name}」`);
    continue;
  }

  await connection.execute(
    `INSERT INTO literature_rules
      (outcomeId, name, ruleType, source, sourceUrl, evidenceLevel,
       applyConditions, ruleDefinition, accuracy, sensitivity, specificity, auc,
       consensusEligible, isActive, sortOrder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      outcomeId, name, ruleType, source, sourceUrl, evidenceLevel,
      applyConditions, ruleDefinition,
      accuracy, sensitivity, specificity, auc,
      consensusEligible, isActive, sortOrder,
    ]
  );
  console.log(`✅ 登録: 「${name}」`);
}

await connection.end();
console.log("\n🎉 論文由来の文献ルール投入が完了しました！");
