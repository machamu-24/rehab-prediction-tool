/**
 * Google Drive「予後予測関連＿文献」フォルダから抽出した文献ルールのシードデータ投入スクリプト
 *
 * 対象論文:
 *   1. BBS入院時スコアによる地域歩行・非補助歩行予測（Louie & Eng, J Rehabil Med 2018）
 *   2. 地域歩行レベル予測の臨床指標（Lee et al., J Phys Ther Sci 2016）
 *   3. 退棟時歩行自立可否の決定木（妹尾・井上, 理学療法科学 2022）
 *   4. 重度片麻痺患者の機能回復予測（Kurosaki et al., 2022）
 *   5. 半側空間無視が歩行自立回復に与える影響（Kimura et al., J Rehabil Med）
 *   6. 非歩行者の歩行自立予測メタ解析（Preston et al., Stroke 2021）
 *   ※ walking_period_regression.pdf はフォントエラーのため読み取り不可（スキップ）
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
console.log("🌱 Google Drive論文由来の文献ルールを投入中...");

// ---- アウトカムIDを取得 ----
const [walkRows] = await connection.execute(
  "SELECT id FROM outcomes WHERE name = '歩行自立' LIMIT 1"
);
if (!walkRows.length) {
  console.error("❌ アウトカム「歩行自立」が見つかりません。先に seed.mjs を実行してください。");
  await connection.end();
  process.exit(1);
}
const walkOutcomeId = walkRows[0].id;

// ---- 地域歩行アウトカムを登録（なければ） ----
await connection.execute(
  `INSERT INTO outcomes (name, description, unit, positiveLabel, negativeLabel, isDefault, sortOrder)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE name=name`,
  [
    "地域歩行",
    "退院後に地域内を安全に歩行できるか（5MWT ≥0.8 m/s を目安）",
    "m/s",
    "地域歩行可能",
    "地域歩行困難",
    0,
    3,
  ]
);
const [communityRows] = await connection.execute(
  "SELECT id FROM outcomes WHERE name = '地域歩行' LIMIT 1"
);
const communityOutcomeId = communityRows[0].id;
console.log(`✅ アウトカム「地域歩行」ID: ${communityOutcomeId}`);

// ---- 文献ルール登録 ----
const rules = [

  // ===== 論文1a: BBS入院時スコア → 地域歩行予測（Louie & Eng 2018） =====
  {
    outcomeId: communityOutcomeId,
    name: "BBS入院時スコアによる地域歩行予測（≥29点）",
    ruleType: "cutoff",
    source: "Louie DR, Eng JJ (2018) J Rehabil Med 50: 37-44",
    authors: "Louie DR, Eng JJ",
    journal: "Journal of Rehabilitation Medicine",
    year: 2018,
    sourceUrl: "https://doi.org/10.2340/16501977-2280",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([
      { field: "days_post_stroke", operator: "<=", value: 28, label: "発症4週以内（入院リハビリ開始時）" }
    ]),
    ruleDefinition: JSON.stringify({
      type: "cutoff",
      field: "bbs_score",
      fieldLabel: "Berg Balance Scale（BBS）入院時スコア",
      operator: ">=",
      threshold: 29,
      unit: "点",
      positiveMessage: "退院時に地域歩行速度（≥0.8 m/s）を達成できる可能性が高い（BBS≥29点）",
      negativeMessage: "退院時に地域歩行速度の達成は困難な可能性（BBS<29点）",
      notes: "対象: 入院リハビリ開始時（発症中央値19日）の脳卒中患者123名（カナダ）。4週間の入院リハビリ後の歩行能力を予測。多変量モデルでは脳卒中タイプ（脳出血 OR=0.19）と発症日数（OR=0.93）も有意な予測因子。",
    }),
    accuracy: null,
    sensitivity: 0.86,
    specificity: 0.84,
    auc: 0.88,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 20,
  },

  // ===== 論文1b: BBS入院時スコア → 非補助歩行予測（Louie & Eng 2018） =====
  {
    outcomeId: walkOutcomeId,
    name: "BBS入院時スコアによる非補助歩行予測（非歩行者サブグループ, ≥12点）",
    ruleType: "cutoff",
    source: "Louie DR, Eng JJ (2018) J Rehabil Med 50: 37-44",
    authors: "Louie DR, Eng JJ",
    journal: "Journal of Rehabilitation Medicine",
    year: 2018,
    sourceUrl: "https://doi.org/10.2340/16501977-2280",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([
      { field: "days_post_stroke", operator: "<=", value: 28, label: "発症4週以内（入院リハビリ開始時）" }
    ]),
    ruleDefinition: JSON.stringify({
      type: "cutoff",
      field: "bbs_score",
      fieldLabel: "Berg Balance Scale（BBS）入院時スコア",
      operator: ">=",
      threshold: 12,
      unit: "点",
      positiveMessage: "4週間の入院リハビリ後に補助なし歩行を達成できる可能性がある（BBS≥12点）",
      negativeMessage: "4週間後も補助なし歩行の達成は困難な可能性（BBS<12点）",
      notes: "対象: 入院時に非歩行者（5MWTを補助なしで完遂できない）のサブグループ n=84。BBS単独が有意な予測因子（OR=1.11, 95%CI: 1.05-1.17）。AUC=0.73（95%CI: 0.62-0.84）。",
    }),
    accuracy: null,
    sensitivity: 0.74,
    specificity: 0.68,
    auc: 0.73,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 21,
  },

  // ===== 論文2a: TUGによる地域歩行予測（Lee et al. 2016） =====
  {
    outcomeId: communityOutcomeId,
    name: "TUGによる地域歩行予測（<14.77秒）",
    ruleType: "cutoff",
    source: "Lee GC et al. (2016) J Phys Ther Sci 28: 2184-2189",
    authors: "Lee GC, An SH, Lee YB, Park DS",
    journal: "Journal of Physical Therapy Science",
    year: 2016,
    sourceUrl: "https://doi.org/10.1589/jpts.28.2184",
    evidenceLevel: "Other",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "cutoff",
      field: "tug_seconds",
      fieldLabel: "Timed Up and Go（TUG）テスト",
      operator: "<",
      threshold: 14.77,
      unit: "秒",
      positiveMessage: "地域歩行速度（>0.8 m/s）を達成できる可能性が高い（TUG<14.77秒）",
      negativeMessage: "地域歩行速度の達成は困難な可能性（TUG≥14.77秒）",
      notes: "対象: 脳卒中片麻痺患者75名（韓国）。地域歩行群（n=40）vs 限定的地域歩行群（n=35）の比較。ロジスティック回帰でOR=0.038（最も強い予測因子）。",
    }),
    accuracy: null,
    sensitivity: 0.93,
    specificity: 0.74,
    auc: 0.88,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 22,
  },

  // ===== 論文2b: BBSによる地域歩行予測（Lee et al. 2016） =====
  {
    outcomeId: communityOutcomeId,
    name: "BBSによる地域歩行予測（>46.5点）",
    ruleType: "cutoff",
    source: "Lee GC et al. (2016) J Phys Ther Sci 28: 2184-2189",
    authors: "Lee GC, An SH, Lee YB, Park DS",
    journal: "Journal of Physical Therapy Science",
    year: 2016,
    sourceUrl: "https://doi.org/10.1589/jpts.28.2184",
    evidenceLevel: "Other",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "cutoff",
      field: "bbs_score",
      fieldLabel: "Berg Balance Scale（BBS）",
      operator: ">",
      threshold: 46.5,
      unit: "点",
      positiveMessage: "地域歩行速度（>0.8 m/s）を達成できる可能性が高い（BBS>46.5点）",
      negativeMessage: "地域歩行速度の達成は困難な可能性（BBS≤46.5点）",
      notes: "AUC=0.80（中程度の精度）。ロジスティック回帰でOR=0.084。FMA>25.5点と組み合わせると精度向上の可能性。",
    }),
    accuracy: null,
    sensitivity: 0.70,
    specificity: 0.82,
    auc: 0.80,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 23,
  },

  // ===== 論文2c: FMA下肢による地域歩行予測（Lee et al. 2016） =====
  {
    outcomeId: communityOutcomeId,
    name: "FMA下肢スコアによる地域歩行予測（>25.5点）",
    ruleType: "cutoff",
    source: "Lee GC et al. (2016) J Phys Ther Sci 28: 2184-2189",
    authors: "Lee GC, An SH, Lee YB, Park DS",
    journal: "Journal of Physical Therapy Science",
    year: 2016,
    sourceUrl: "https://doi.org/10.1589/jpts.28.2184",
    evidenceLevel: "Other",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "cutoff",
      field: "fma_lower",
      fieldLabel: "Fugl-Meyer Assessment 下肢スコア（FMA-LE）",
      operator: ">",
      threshold: 25.5,
      unit: "点（最大34点）",
      positiveMessage: "地域歩行速度（>0.8 m/s）を達成できる可能性が高い（FMA-LE>25.5点）",
      negativeMessage: "地域歩行速度の達成は困難な可能性（FMA-LE≤25.5点）",
      notes: "AUC=0.80。PPV=80%（陽性的中率が高い）。ロジスティック回帰でOR=0.053。",
    }),
    accuracy: null,
    sensitivity: null,
    specificity: null,
    auc: 0.80,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 24,
  },

  // ===== 論文3: 退棟時歩行自立可否の決定木（妹尾・井上 2022） =====
  {
    outcomeId: walkOutcomeId,
    name: "脳卒中分類・FIM運動・FIM認知・要介護区分による決定木（退棟時歩行自立）",
    ruleType: "decision_tree",
    source: "妹尾祐太, 井上優（2022）理学療法科学",
    authors: "妹尾祐太, 井上優",
    journal: "理学療法科学",
    year: 2022,
    sourceUrl: "https://www.jstage.jst.go.jp/browse/rigaku",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "decision_tree",
      description: "CART（Classification and Regression Tree）分析による決定木。入棟時情報から退棟時の歩行自立（FIM歩行項目6点以上）を予測する。",
      nodes: [
        {
          id: "root",
          field: "stroke_type",
          fieldLabel: "脳卒中分類",
          operator: "equals",
          threshold: "脳出血",
          trueNodeId: "hemorrhage_fim",
          falseNodeId: "infarction_care",
        },
        {
          id: "hemorrhage_fim",
          field: "fim_motor_total",
          fieldLabel: "入棟時FIM運動項目合計",
          operator: ">",
          threshold: 47,
          unit: "点",
          trueNodeId: "leaf_hemorrhage_high",
          falseNodeId: "leaf_hemorrhage_low",
        },
        {
          id: "infarction_care",
          field: "care_level",
          fieldLabel: "要介護認定区分",
          operator: "<=",
          threshold: 2,
          unit: "（要介護2以下）",
          trueNodeId: "leaf_infarction_mild",
          falseNodeId: "infarction_cognitive",
        },
        {
          id: "infarction_cognitive",
          field: "fim_cognitive_total",
          fieldLabel: "入棟時FIM認知項目合計",
          operator: ">",
          threshold: 19,
          unit: "点",
          trueNodeId: "leaf_infarction_cognitive_high",
          falseNodeId: "leaf_infarction_cognitive_low",
        },
        {
          id: "leaf_hemorrhage_high",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: true,
          probability: 1.0,
          message: "脳出血 & FIM運動>47点 → 歩行自立率100%（n=13）",
        },
        {
          id: "leaf_hemorrhage_low",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: false,
          probability: 0.087,
          message: "脳出血 & FIM運動≤47点 → 歩行自立率8.7%（n=2/23）",
        },
        {
          id: "leaf_infarction_mild",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: true,
          probability: 0.827,
          message: "脳梗塞 & 要介護2以下 → 歩行自立率82.7%（n=43/52）",
        },
        {
          id: "leaf_infarction_cognitive_high",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: true,
          probability: 0.974,
          message: "脳梗塞 & 要介護3以上 & FIM認知>19点 → 歩行自立率97.4%（n=37/38）",
        },
        {
          id: "leaf_infarction_cognitive_low",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: false,
          probability: 0.429,
          message: "脳梗塞 & 要介護3以上 & FIM認知≤19点 → 歩行自立率42.9%（n=6/14）",
        },
      ],
      notes: "対象: 回復期リハビリテーション病棟入棟患者（n=127）。正診率89.5%（95%CI: 82.0-94.7）、感度83.3%、特異度97.8%、AUC=0.918（95%CI: 0.862-0.974）。",
    }),
    accuracy: 0.895,
    sensitivity: 0.833,
    specificity: 0.978,
    auc: 0.918,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 25,
  },

  // ===== 論文4: 重度片麻痺患者の機能回復予測（Kurosaki et al. 2022） =====
  {
    outcomeId: walkOutcomeId,
    name: "重度片麻痺患者の良好な機能回復予測（年齢・病型・皮質病変）",
    ruleType: "composite_rule",
    source: "Kurosaki M, Tosaka M et al. (2022) J Jpn Assoc Rehabil Med",
    authors: "Kurosaki M, Tosaka M, et al.",
    journal: "Journal of the Japanese Association of Rehabilitation Medicine",
    year: 2022,
    sourceUrl: "https://www.jstage.jst.go.jp/browse/jjrmc",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([
      { field: "brunnstrom_lower", operator: "<=", value: 2, label: "BRS下肢I〜II（重度片麻痺）" }
    ]),
    ruleDefinition: JSON.stringify({
      type: "composite_rule",
      description: "重度片麻痺（BRS下肢I-II）患者における良好な機能回復（FIM≥100または在宅復帰）の予後因子。単変量解析で有意な因子を複合条件として評価する。",
      logicOperator: "AND",
      conditions: [
        {
          field: "age",
          fieldLabel: "年齢",
          operator: "<",
          value: 70,
          unit: "歳",
          label: "年齢70歳未満",
          oddsRatio: null,
          notes: "単変量解析で有意な予後良好因子",
        },
        {
          field: "stroke_type",
          fieldLabel: "病型",
          operator: "equals",
          value: "脳出血",
          label: "病型が脳出血（ICH）",
          oddsRatio: null,
          notes: "脳出血は脳梗塞より機能回復が良好な傾向",
        },
        {
          field: "cortical_lesion",
          fieldLabel: "皮質病変の有無",
          operator: "equals",
          value: false,
          label: "皮質病変なし",
          oddsRatio: null,
          notes: "皮質病変なし（基底核病変のみ）が予後良好",
        },
      ],
      positiveMessage: "良好な機能回復（FIM≥100または在宅復帰）の可能性がある（年齢<70歳 & 脳出血 & 皮質病変なし）",
      negativeMessage: "機能回復は限定的な可能性（重度片麻痺患者の24%のみFIM≥100達成）",
      notes: "対象: Brunnstrom recovery stage I-II（重度片麻痺）の脳卒中患者50名。50名中12名（24%）がFIM≥100を達成。特に基底核病変+皮質病変なしの組み合わせが最も予後良好。",
    }),
    accuracy: null,
    sensitivity: null,
    specificity: null,
    auc: null,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 26,
  },

  // ===== 論文5: 半側空間無視と歩行自立回復（Kimura et al.） =====
  {
    outcomeId: walkOutcomeId,
    name: "半側空間無視と認知障害の複合が歩行自立回復に与える影響",
    ruleType: "composite_rule",
    source: "Kimura Y, Yamada M et al. J Rehabil Med",
    authors: "Kimura Y, Yamada M, et al.",
    journal: "Journal of Rehabilitation Medicine",
    year: 2023,
    sourceUrl: "https://www.medicaljournals.se/jrm",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "composite_rule",
      description: "半側空間無視（USN）の有無と他の認知障害の有無の組み合わせによる歩行自立予測。USN+他の認知障害を合併するグループは歩行自立率が著しく低い。",
      logicOperator: "OR",
      conditions: [
        {
          field: "sias_visuospatial",
          fieldLabel: "SIAS視空間認知スコア",
          operator: "<=",
          value: 2,
          unit: "点",
          label: "SIAS視空間認知≤2点（USNあり）",
          oddsRatio: null,
          notes: "SIAS視空間認知スコア≤2点をUSNありと定義",
        },
        {
          field: "mmse",
          fieldLabel: "MMSE得点",
          operator: "<",
          value: 24,
          unit: "点",
          label: "MMSE<24点（認知障害あり）",
          oddsRatio: null,
          notes: "MMSE<24点を認知障害ありと定義",
        },
      ],
      riskGroups: [
        {
          name: "Group 1: USN+他の認知障害あり",
          walkingIndependenceRate: 0.10,
          oddsRatio: 5.55,
          oddsRatioCI: [1.19, 23.04],
          pValue: 0.003,
          description: "歩行依存と有意に関連（OR=5.55）",
        },
        {
          name: "Group 2: USN単独（他の認知障害なし）",
          walkingIndependenceRate: 0.50,
          oddsRatio: null,
          pValue: 0.207,
          description: "歩行自立への有意な影響なし",
        },
        {
          name: "Group 3: USNなし",
          walkingIndependenceRate: 0.447,
          oddsRatio: null,
          description: "参照群",
        },
      ],
      positiveMessage: "USN単独または認知障害なし → 歩行自立の可能性あり（自立率44.7-50%）",
      negativeMessage: "USN+他の認知障害の合併 → 歩行自立は困難な可能性（自立率10%、OR=5.55）",
      notes: "USN単独では歩行自立への有意な影響はない（p=0.207）。USNと他の認知障害の合併が最も予後不良のリスク因子。",
    }),
    accuracy: null,
    sensitivity: null,
    specificity: null,
    auc: null,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 27,
  },

  // ===== 論文6: 非歩行者の歩行自立予測メタ解析（Preston et al. Stroke 2021） =====
  {
    outcomeId: walkOutcomeId,
    name: "非歩行者の歩行自立予測因子（メタ解析: 座位保持・ADL・下肢筋力等）",
    ruleType: "scoring_system",
    source: "Preston E et al. (2021) Stroke 52: 1818-1828",
    authors: "Preston E, Ada L, Stanton R, Mahendran N, Dean CM",
    journal: "Stroke",
    year: 2021,
    sourceUrl: "https://doi.org/10.1161/STROKEAHA.120.032823",
    evidenceLevel: "Systematic Review",
    applyConditions: JSON.stringify([
      { field: "walking_status", operator: "equals", value: "非歩行", label: "入院時非歩行者（5MWTを補助なしで完遂不可）" }
    ]),
    ruleDefinition: JSON.stringify({
      type: "scoring_system",
      description: "発症早期の非歩行者における3・6ヶ月後の歩行自立予測因子のメタ解析。各因子の存在（1点）/欠如（0点）でスコアリングし、リスク評価を行う。",
      items: [
        {
          field: "sitting_balance",
          fieldLabel: "座位保持（良好）",
          unit: "boolean",
          bands: [
            { operator: "equals", value: true, score: 1, label: "座位保持良好" },
            { operator: "equals", value: false, score: 0, label: "座位保持不良" },
          ],
          oddsRatio3m: 7.9,
          oddsRatio6m: 19.1,
          notes: "3ヶ月後OR=7.9, 6ヶ月後OR=19.1（最も強い予測因子の一つ）",
        },
        {
          field: "adl_independence",
          fieldLabel: "ADL自立（良好）",
          unit: "boolean",
          bands: [
            { operator: "equals", value: true, score: 1, label: "ADL自立" },
            { operator: "equals", value: false, score: 0, label: "ADL依存" },
          ],
          oddsRatio3m: 10.5,
          oddsRatio6m: null,
          notes: "3ヶ月後OR=10.5（最も強い予測因子）",
        },
        {
          field: "leg_strength_good",
          fieldLabel: "下肢筋力良好",
          unit: "boolean",
          bands: [
            { operator: "equals", value: true, score: 1, label: "下肢筋力良好" },
            { operator: "equals", value: false, score: 0, label: "下肢筋力低下" },
          ],
          oddsRatio3m: 5.0,
          notes: "3ヶ月後OR=5.0",
        },
        {
          field: "cognitive_impairment",
          fieldLabel: "認知障害なし",
          unit: "boolean",
          bands: [
            { operator: "equals", value: false, score: 1, label: "認知障害なし" },
            { operator: "equals", value: true, score: 0, label: "認知障害あり" },
          ],
          oddsRatio3m: 3.3,
          notes: "3ヶ月後OR=3.3",
        },
        {
          field: "age",
          fieldLabel: "若年齢（<70歳）",
          unit: "歳",
          bands: [
            { operator: "<", value: 70, score: 1, label: "<70歳" },
            { operator: ">=", value: 70, score: 0, label: "≥70歳" },
          ],
          oddsRatio3m: 3.4,
          oddsRatio6m: 2.1,
          notes: "3ヶ月後OR=3.4, 6ヶ月後OR=2.1",
        },
        {
          field: "continence",
          fieldLabel: "失禁なし",
          unit: "boolean",
          bands: [
            { operator: "equals", value: true, score: 1, label: "失禁なし" },
            { operator: "equals", value: false, score: 0, label: "失禁あり" },
          ],
          oddsRatio3m: 2.3,
          oddsRatio6m: 13.8,
          notes: "3ヶ月後OR=2.3, 6ヶ月後OR=13.8（6ヶ月後に特に重要）",
        },
        {
          field: "neglect",
          fieldLabel: "無視なし",
          unit: "boolean",
          bands: [
            { operator: "equals", value: false, score: 1, label: "無視なし" },
            { operator: "equals", value: true, score: 0, label: "無視あり" },
          ],
          oddsRatio3m: 2.4,
          notes: "3ヶ月後OR=2.4",
        },
      ],
      threshold: 5,
      maxScore: 7,
      positiveMessage: "歩行自立の予後良好因子が多い（スコア≥5点）",
      negativeMessage: "歩行自立の予後不良因子が多い（スコア<5点）",
      notes: "発症早期の非歩行者を対象とした系統的レビュー＆メタ解析（n=18研究）。座位保持とADL自立が最も強い予測因子。皮質脊髄路の保存（OR=8.3）も重要だが画像評価が必要。",
    }),
    accuracy: null,
    sensitivity: null,
    specificity: null,
    auc: null,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 28,
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
console.log("\n🎉 Google Drive論文由来の文献ルール投入が完了しました！");
