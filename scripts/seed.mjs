/**
 * シードデータ投入スクリプト
 * 既存デモの5ルール + 歩行自立アウトカムを登録する
 */
import { drizzle } from "drizzle-orm/mysql2";
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
const db = drizzle(connection);

console.log("🌱 シードデータを投入中...");

// ---- 1. アウトカム登録 ----
await connection.execute(
  `INSERT INTO outcomes (name, description, unit, positiveLabel, negativeLabel, isDefault, sortOrder)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE name=name`,
  ["歩行自立", "回復期リハビリテーション退院時または6ヶ月後の歩行自立（FAC≥4）", "FAC", "歩行自立", "歩行非自立", 1, 0]
);

const [outcomeRows] = await connection.execute("SELECT id FROM outcomes WHERE name = '歩行自立' LIMIT 1");
const outcomeId = outcomeRows[0].id;
console.log(`✅ アウトカム「歩行自立」ID: ${outcomeId}`);

// ---- 2. 文献ルール登録 ----

const rules = [
  // EPOS モデル（決定木）
  {
    outcomeId,
    name: "EPOSモデル",
    ruleType: "decision_tree",
    source: "Veerbeek et al. (2011) Neurorehabilitation and Neural Repair",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/21186329/",
    evidenceLevel: "Systematic Review",
    applyConditions: JSON.stringify([
      { field: "days_post_stroke", operator: "<=", value: 3, label: "発症からの日数" }
    ]),
    ruleDefinition: JSON.stringify({
      type: "decision_tree",
      nodes: [
        {
          id: "root",
          field: "sitting_balance_30s",
          fieldLabel: "座位保持30秒",
          operator: "boolean",
          trueNodeId: "check_mi",
          falseNodeId: "leaf_negative",
        },
        {
          id: "check_mi",
          field: "motricity_index_lower",
          fieldLabel: "Motricity Index 下肢",
          operator: ">=",
          threshold: 25,
          trueNodeId: "leaf_positive",
          falseNodeId: "leaf_negative",
        },
        {
          id: "leaf_positive",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: true,
          message: "6ヶ月後：歩行自立の可能性が非常に高い（確率98%）",
        },
        {
          id: "leaf_negative",
          field: "",
          fieldLabel: "",
          operator: "boolean",
          isLeaf: true,
          isPositive: false,
          message: "6ヶ月後：歩行自立は不確実（確率23%）",
        },
      ],
    }),
    accuracy: 0.92,
    sensitivity: 0.96,
    specificity: 0.75,
    auc: null,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 1,
  },

  // TWIST アルゴリズム（カットオフ）
  {
    outcomeId,
    name: "TWISTアルゴリズム",
    ruleType: "cutoff",
    source: "Smith et al. (2017) Neurorehabilitation and Neural Repair",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/29090654/",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([
      { field: "days_post_stroke", operator: "<=", value: 7, label: "発症からの日数" }
    ]),
    ruleDefinition: JSON.stringify({
      type: "cutoff",
      field: "tct_score",
      fieldLabel: "Trunk Control Test (TCT)",
      operator: ">",
      threshold: 40,
      unit: "点",
      positiveMessage: "6週間以内：歩行自立の可能性が高い（TCT > 40）",
      negativeMessage: "6週間以内：歩行自立は難しい可能性（TCT ≤ 40）",
    }),
    accuracy: 0.91,
    sensitivity: null,
    specificity: null,
    auc: null,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 2,
  },

  // BBS カットオフ
  {
    outcomeId,
    name: "BBSカットオフ（退院時歩行自立）",
    ruleType: "cutoff",
    source: "Jenkin et al. (2021) Physiotherapy Canada",
    sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8370698/",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "cutoff",
      field: "bbs_score",
      fieldLabel: "Berg Balance Scale (BBS)",
      operator: ">=",
      threshold: 14,
      unit: "点",
      positiveMessage: "退院時：歩行自立の可能性が高い（BBS ≥ 14）",
      negativeMessage: "退院時：歩行介助が必要な可能性（BBS < 14）",
    }),
    accuracy: null,
    sensitivity: 0.73,
    specificity: 0.89,
    auc: 0.81,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 3,
  },

  // NIHSS カットオフ（複合条件）
  {
    outcomeId,
    name: "NIHSSカットオフ（性別補正）",
    ruleType: "composite_rule",
    source: "Ikeda & Minamimura (2025) Physical Therapy Research",
    sourceUrl: "https://www.jstage.jst.go.jp/article/ptr/advpub/0/advpub_25-E10354/_article/-char/en",
    evidenceLevel: "Cohort Study",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "composite_rule",
      root: {
        logic: "OR",
        children: [
          {
            logic: "AND",
            children: [
              { logic: "CONDITION", field: "sex", fieldLabel: "性別", operator: "==", value: "男性" },
              { logic: "CONDITION", field: "nihss", fieldLabel: "NIHSS", operator: "<=", value: 7.5, unit: "点" },
            ],
          },
          {
            logic: "AND",
            children: [
              { logic: "CONDITION", field: "sex", fieldLabel: "性別", operator: "==", value: "女性" },
              { logic: "CONDITION", field: "nihss", fieldLabel: "NIHSS", operator: "<=", value: 5.5, unit: "点" },
            ],
          },
        ],
      },
      positiveMessage: "歩行自立の可能性が高い（NIHSS性別補正カットオフ以下）",
      negativeMessage: "歩行自立は難しい可能性（NIHSS性別補正カットオフ超過）",
    }),
    accuracy: null,
    sensitivity: null,
    specificity: null,
    auc: 0.83,
    consensusEligible: 1,
    isActive: 1,
    sortOrder: 4,
  },

  // Perry 歩行速度分類（スコアリングシステム）
  {
    outcomeId,
    name: "Perry歩行速度分類",
    ruleType: "scoring_system",
    source: "Perry et al. (1995) - 速度分類の臨床的妥当性",
    sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2587153/",
    evidenceLevel: "Expert Classification",
    applyConditions: JSON.stringify([]),
    ruleDefinition: JSON.stringify({
      type: "scoring_system",
      items: [
        {
          field: "walk_speed_10m",
          fieldLabel: "10m歩行速度",
          unit: "m/s",
          bands: [
            { operator: ">=", value: 0.8, score: 3, label: "Community（地域歩行自立）≥0.8m/s" },
            { operator: ">=", value: 0.4, score: 2, label: "Limited Community（限定的地域歩行）0.4〜0.8m/s" },
            { operator: "<",  value: 0.4, score: 1, label: "Household（屋内中心）<0.4m/s" },
          ],
        },
      ],
      threshold: 2,
      maxScore: 3,
      positiveMessage: "Limited Community以上（地域歩行が可能なレベル）",
      negativeMessage: "Household（屋内中心の歩行レベル）",
    }),
    accuracy: null,
    sensitivity: null,
    specificity: null,
    auc: null,
    consensusEligible: 0,
    isActive: 1,
    sortOrder: 5,
  },
];

for (const rule of rules) {
  await connection.execute(
    `INSERT INTO literature_rules
      (outcomeId, name, ruleType, source, sourceUrl, evidenceLevel,
       applyConditions, ruleDefinition, accuracy, sensitivity, specificity, auc,
       consensusEligible, isActive, sortOrder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rule.outcomeId, rule.name, rule.ruleType, rule.source, rule.sourceUrl,
      rule.evidenceLevel, rule.applyConditions, rule.ruleDefinition,
      rule.accuracy, rule.sensitivity, rule.specificity, rule.auc,
      rule.consensusEligible, rule.isActive, rule.sortOrder,
    ]
  );
  console.log(`✅ ルール「${rule.name}」を登録しました`);
}

await connection.end();
console.log("🎉 シードデータの投入が完了しました！");
