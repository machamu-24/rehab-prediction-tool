/**
 * 文献ルールの精度指標照合・修正スクリプト
 * 各論文PDFと照合した結果に基づき、DBの精度指標・決定木構造を更新する
 */
import mysql from 'mysql2/promise';

const db = await mysql.createConnection(process.env.DATABASE_URL);

async function updateRule(id, updates) {
  const fields = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
  const values = Object.values(updates);
  await db.execute(`UPDATE literature_rules SET ${fields} WHERE id = ?`, [...values, id]);
  console.log(`✓ ID ${id} 更新完了`);
}

// ─── ID 30001: 松下ら（2022）麻痺側膝伸展筋力 ≥0.631 Nm/kg ──────────────
// AUC=0.713（95%CI: 0.674-0.752）← 論文記載値
await updateRule(30001, { auc: 0.713 });

// ─── ID 30002: 松下ら（2022）両側合計膝伸展筋力 ≥1.621 Nm/kg ─────────────
// AUC=0.726（95%CI: 0.688-0.765）← 論文記載値
await updateRule(30002, { auc: 0.726 });

// ─── ID 30003: 吉松ら（2018）決定木（FBS・起居動作・認知機能） ─────────────
// 感度=63.1%, 特異度=89.8% ← 論文記載値と一致（変更なし）
console.log('○ ID 30003 感度63.1%・特異度89.8% は論文記載値と一致。変更なし。');

// ─── ID 30004: 池上ら（2025）スコアリングシステム ─────────────────────────
// AUC=0.890, 感度=80.3%, 特異度=85.7%（カットオフ3点以上）← 論文記載値
await updateRule(30004, { auc: 0.890, sensitivity: 80.3, specificity: 85.7 });

// ─── ID 30005: 池上ら（2025）ノモグラム（Cox比例ハザード） ───────────────
// C-index=0.858（ブートストラップ0.851）← 論文記載値
// 多変量HR: 年齢0.965, 発症後日数0.966, 起き上がり1.912, BBS1.031, FIM運動1.024, FIM認知1.079
const nomogramDef = {
  type: "nomogram",
  variables: [
    { field: "age", coefficient: -0.0356, label: "年齢（HR=0.965/歳）" },
    { field: "days_since_onset", coefficient: -0.0347, label: "発症後日数（HR=0.966/日）" },
    { field: "sit_up_ability", coefficient: 0.6487, label: "起き上がり能力（HR=1.912: 介助なし=1, 介助あり=0）" },
    { field: "bbs", coefficient: 0.0305, label: "BBS（HR=1.031/点）" },
    { field: "fim_motor", coefficient: 0.0237, label: "FIM運動項目合計（HR=1.024/点）" },
    { field: "fim_cognitive", coefficient: 0.0761, label: "FIM認知項目合計（HR=1.079/点）" }
  ],
  intercept: 0,
  threshold: 0,
  positiveLabel: "歩行自立（発症30〜120日以内）",
  negativeLabel: "歩行自立困難",
  note: "Cox比例ハザード分析に基づくノモグラム。スコアが高いほど歩行自立が早期に達成される確率が高い。C-index=0.858（ブートストラップ0.851）。MAE=0.022"
};
await updateRule(30005, { auc: 0.858, ruleDefinition: JSON.stringify(nomogramDef) });

// ─── ID 30006: 石野ら（2023）重度群決定木 ────────────────────────────────
// 感度=63.4%, 特異度=83.9%, 正分類率=82.3%
// 修正: 第2層分岐条件（ΔFIM運動23点・年齢67.5歳・入棟時FIM運動43点）を正確な値に更新
const heavyGroupTree = {
  type: "decision_tree",
  root: {
    field: "delta_bbs",
    operator: ">=",
    threshold: 20,
    positiveLabel: "ΔBBS≥20",
    positive: { prediction: "positive", confidence: 0.85 },
    negative: {
      field: "delta_fim_motor",
      operator: ">=",
      threshold: 23,
      positiveLabel: "ΔFIM運動≥23",
      positive: {
        field: "age",
        operator: "<",
        threshold: 67.5,
        positiveLabel: "年齢<67.5歳",
        positive: { prediction: "positive", confidence: 0.75 },
        negative: {
          field: "fim_motor",
          operator: ">=",
          threshold: 43,
          positiveLabel: "入棟時FIM運動≥43",
          positive: { prediction: "positive", confidence: 0.70 },
          negative: { prediction: "negative", confidence: 0.80 }
        }
      },
      negative: {
        field: "fim_motor",
        operator: ">=",
        threshold: 43,
        positiveLabel: "入棟時FIM運動≥43",
        positive: { prediction: "positive", confidence: 0.65 },
        negative: { prediction: "negative", confidence: 0.85 }
      }
    }
  },
  positiveLabel: "退棟時歩行自立",
  negativeLabel: "退棟時歩行非自立",
  note: "重度群（入棟時FIM運動≤18点相当）。変化量（Δ）は入棟から退棟までの変化量。正分類率82.3%"
};
await updateRule(30006, {
  sensitivity: 63.4,
  specificity: 83.9,
  ruleDefinition: JSON.stringify(heavyGroupTree)
});

// ─── ID 30007: 石野ら（2023）中等度群決定木 ──────────────────────────────
// 感度=81.4%, 特異度=59.5%, 正分類率=86.3%
// 修正: CBA分岐点を20→18点に修正、ΔFIM認知分岐点1点を追加
const moderateGroupTree = {
  type: "decision_tree",
  root: {
    field: "delta_fim_motor",
    operator: ">=",
    threshold: 12,
    positiveLabel: "ΔFIM運動≥12",
    positive: { prediction: "positive", confidence: 0.90 },
    negative: {
      field: "cba",
      operator: ">=",
      threshold: 18,
      positiveLabel: "CBA≥18（論文照合修正: 20→18点）",
      positive: {
        field: "delta_fim_cognitive",
        operator: ">=",
        threshold: 1,
        positiveLabel: "ΔFIM認知≥1",
        positive: {
          field: "age",
          operator: "<",
          threshold: 67.5,
          positiveLabel: "年齢<67.5歳",
          positive: { prediction: "positive", confidence: 0.75 },
          negative: { prediction: "negative", confidence: 0.65 }
        },
        negative: { prediction: "negative", confidence: 0.70 }
      },
      negative: { prediction: "negative", confidence: 0.80 }
    }
  },
  positiveLabel: "退棟時歩行自立",
  negativeLabel: "退棟時歩行非自立",
  note: "中等度群（入棟時FIM運動19〜36点相当）。CBA=Cognitive-related Behavioral Assessment（分岐点18点）。正分類率86.3%"
};
await updateRule(30007, {
  sensitivity: 81.4,
  specificity: 59.5,
  ruleDefinition: JSON.stringify(moderateGroupTree)
});

// ─── ID 60001: Louie & Eng (2018) BBS≥29 地域歩行 ───────────────────────
// AUC=0.88, 感度=86%, 特異度=84% ← 論文記載値と一致（変更なし）
console.log('○ ID 60001 AUC=0.88・感度=86%・特異度=84% は論文記載値と一致。変更なし。');

// ─── ID 60002: Louie & Eng (2018) BBS≥12 歩行自立 ───────────────────────
// AUC=0.73, 感度=74%, 特異度=68% ← 論文記載値と一致（変更なし）
console.log('○ ID 60002 AUC=0.73・感度=74%・特異度=68% は論文記載値と一致。変更なし。');

// ─── ID 60003: trunk_control（FACT≥8）─────────────────────────────────
// AUC=0.82, 感度=93%, 特異度=59% ← 論文記載値と一致（変更なし）
console.log('○ ID 60003 FACT≥8, AUC=0.82, 感度=93%, 特異度=59% は論文記載値と一致。変更なし。');

// ─── ID 60008: 妹尾・井上（2022）決定木 ─────────────────────────────────
// AUC=0.918, 感度=83.3%, 特異度=97.8%, 正診率=89.5% ← 論文記載値
// 修正: 決定木構造を正確な値に更新（脳出血: FIM運動≥47, 脳梗塞: 要介護2以下 → FIM認知≥19）
const seinoTree = {
  type: "decision_tree",
  root: {
    field: "stroke_type",
    operator: "==",
    threshold: "cerebral_hemorrhage",
    positiveLabel: "脳出血",
    positive: {
      field: "fim_motor",
      operator: ">=",
      threshold: 47,
      positiveLabel: "FIM運動≥47",
      positive: { prediction: "positive", confidence: 0.95 },
      negative: { prediction: "negative", confidence: 0.90 }
    },
    negative: {
      field: "care_level",
      operator: "<=",
      threshold: 2,
      positiveLabel: "要介護2以下（未申請・要支援1-2・要介護1-2）",
      positive: {
        field: "fim_cognitive",
        operator: ">=",
        threshold: 19,
        positiveLabel: "FIM認知≥19",
        positive: { prediction: "positive", confidence: 0.90 },
        negative: { prediction: "negative", confidence: 0.75 }
      },
      negative: { prediction: "negative", confidence: 0.85 }
    }
  },
  positiveLabel: "退棟時歩行自立",
  negativeLabel: "退棟時歩行非自立",
  note: "care_levelは要介護認定区分（0=未申請/要支援, 1=要介護1, 2=要介護2, 3=要介護3, 4=要介護4, 5=要介護5）。AUC=0.918（95%CI: 0.862-0.974）"
};
await updateRule(60008, {
  auc: 0.918,
  sensitivity: 83.3,
  specificity: 97.8,
  ruleDefinition: JSON.stringify(seinoTree)
});

await db.end();
console.log('\n✅ 全ルールの精度指標・決定木構造の更新が完了しました');
