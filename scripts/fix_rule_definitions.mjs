import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ============================================================
// ID 30006: 変化量を用いた決定木・重度群（ΔBBS・ΔFIM運動）
// root形式 → nodes配列形式に変換
// ============================================================
const rule30006 = {
  type: "decision_tree",
  nodes: [
    {
      id: "n1",
      field: "delta_bbs",
      fieldLabel: "ΔBBS（BBS変化量）",
      operator: ">=",
      threshold: 20,
      trueNodeId: "leaf_pos1",
      falseNodeId: "n2",
      isLeaf: false
    },
    {
      id: "leaf_pos1",
      field: "",
      fieldLabel: "",
      operator: ">=",
      isLeaf: true,
      isPositive: true,
      message: "退棟時歩行自立（ΔBBS≥20: 確信度85%）"
    },
    {
      id: "n2",
      field: "delta_fim_motor",
      fieldLabel: "ΔFIM運動（FIM運動変化量）",
      operator: ">=",
      threshold: 23,
      trueNodeId: "n3",
      falseNodeId: "n4",
      isLeaf: false
    },
    {
      id: "n3",
      field: "age",
      fieldLabel: "年齢",
      operator: "<",
      threshold: 67.5,
      trueNodeId: "leaf_pos2",
      falseNodeId: "n5",
      isLeaf: false
    },
    {
      id: "leaf_pos2",
      field: "",
      fieldLabel: "",
      operator: ">=",
      isLeaf: true,
      isPositive: true,
      message: "退棟時歩行自立（ΔFIM運動≥23 & 年齢<67.5歳: 確信度75%）"
    },
    {
      id: "n5",
      field: "fim_motor",
      fieldLabel: "入棟時FIM運動",
      operator: ">=",
      threshold: 43,
      trueNodeId: "leaf_pos3",
      falseNodeId: "leaf_neg1",
      isLeaf: false
    },
    {
      id: "leaf_pos3",
      field: "",
      fieldLabel: "",
      operator: ">=",
      isLeaf: true,
      isPositive: true,
      message: "退棟時歩行自立（ΔFIM運動≥23 & 年齢≥67.5 & FIM運動≥43: 確信度70%）"
    },
    {
      id: "leaf_neg1",
      field: "",
      fieldLabel: "",
      operator: ">=",
      isLeaf: true,
      isPositive: false,
      message: "退棟時歩行非自立（ΔFIM運動≥23 & 年齢≥67.5 & FIM運動<43: 確信度80%）"
    },
    {
      id: "n4",
      field: "fim_motor",
      fieldLabel: "入棟時FIM運動",
      operator: ">=",
      threshold: 43,
      trueNodeId: "leaf_pos4",
      falseNodeId: "leaf_neg2",
      isLeaf: false
    },
    {
      id: "leaf_pos4",
      field: "",
      fieldLabel: "",
      operator: ">=",
      isLeaf: true,
      isPositive: true,
      message: "退棟時歩行自立（ΔFIM運動<23 & FIM運動≥43: 確信度65%）"
    },
    {
      id: "leaf_neg2",
      field: "",
      fieldLabel: "",
      operator: ">=",
      isLeaf: true,
      isPositive: false,
      message: "退棟時歩行非自立（ΔFIM運動<23 & FIM運動<43: 確信度85%）"
    }
  ]
};

// ============================================================
// ID 30007: 変化量を用いた決定木・中等度群（ΔFIM運動・CBA）
// ============================================================
const rule30007 = {
  type: "decision_tree",
  nodes: [
    {
      id: "n1",
      field: "delta_fim_motor",
      fieldLabel: "ΔFIM運動（FIM運動変化量）",
      operator: ">=",
      threshold: 12,
      trueNodeId: "leaf_pos1",
      falseNodeId: "n2",
      isLeaf: false
    },
    {
      id: "leaf_pos1",
      field: "",
      fieldLabel: "",
      operator: ">=",
      isLeaf: true,
      isPositive: true,
      message: "退棟時歩行自立（ΔFIM運動≥12: 確信度90%）"
    },
    {
      id: "n2",
      field: "cba",
      fieldLabel: "CBA（認知行動評価）",
      operator: ">=",
      threshold: 18,
      trueNodeId: "n3",
      falseNodeId: "leaf_neg1",
      isLeaf: false
    },
    {
      id: "leaf_neg1",
      field: "",
      fieldLabel: "",
      operator: ">=",
      isLeaf: true,
      isPositive: false,
      message: "退棟時歩行非自立（ΔFIM運動<12 & CBA<18: 確信度80%）"
    },
    {
      id: "n3",
      field: "delta_fim_cognitive",
      fieldLabel: "ΔFIM認知（FIM認知変化量）",
      operator: ">=",
      threshold: 1,
      trueNodeId: "n4",
      falseNodeId: "leaf_neg2",
      isLeaf: false
    },
    {
      id: "leaf_neg2",
      field: "",
      fieldLabel: "",
      operator: ">=",
      isLeaf: true,
      isPositive: false,
      message: "退棟時歩行非自立（ΔFIM運動<12 & CBA≥18 & ΔFIM認知<1: 確信度70%）"
    },
    {
      id: "n4",
      field: "age",
      fieldLabel: "年齢",
      operator: "<",
      threshold: 67.5,
      trueNodeId: "leaf_pos2",
      falseNodeId: "leaf_neg3",
      isLeaf: false
    },
    {
      id: "leaf_pos2",
      field: "",
      fieldLabel: "",
      operator: ">=",
      isLeaf: true,
      isPositive: true,
      message: "退棟時歩行自立（ΔFIM運動<12 & CBA≥18 & ΔFIM認知≥1 & 年齢<67.5歳: 確信度75%）"
    },
    {
      id: "leaf_neg3",
      field: "",
      fieldLabel: "",
      operator: ">=",
      isLeaf: true,
      isPositive: false,
      message: "退棟時歩行非自立（ΔFIM運動<12 & CBA≥18 & ΔFIM認知≥1 & 年齢≥67.5歳: 確信度65%）"
    }
  ]
};

// ============================================================
// ID 60007: 重度片麻痺患者の良好な機能回復予測
// conditions+logicOperator形式 → root形式に変換
// ============================================================
const rule60007 = {
  type: "composite_rule",
  root: {
    logic: "AND",
    children: [
      {
        logic: "CONDITION",
        field: "age",
        fieldLabel: "年齢",
        operator: "<",
        value: 70,
        unit: "歳"
      },
      {
        logic: "CONDITION",
        field: "stroke_type",
        fieldLabel: "病型",
        operator: "==",
        value: "脳出血"
      },
      {
        logic: "CONDITION",
        field: "cortical_lesion",
        fieldLabel: "皮質病変の有無",
        operator: "==",
        value: false
      }
    ]
  },
  positiveMessage: "良好な機能回復（FIM≥100または在宅復帰）の可能性がある（年齢<70歳 & 脳出血 & 皮質病変なし）",
  negativeMessage: "機能回復は限定的な可能性（重度片麻痺患者の24%のみFIM≥100達成）"
};

// ============================================================
// ID 60008: 半側空間無視と認知障害の複合が歩行自立回復に与える影響
// conditions+logic形式 → root形式に変換（OR: どちらか一方でも該当→歩行困難リスク高）
// ============================================================
const rule60008 = {
  type: "composite_rule",
  root: {
    logic: "OR",
    children: [
      {
        logic: "CONDITION",
        field: "spatial_neglect",
        fieldLabel: "半側空間無視",
        operator: "==",
        value: true
      },
      {
        logic: "CONDITION",
        field: "mmse_score",
        fieldLabel: "MMSE（認知機能）",
        operator: "<",
        value: 24
      }
    ]
  },
  positiveMessage: "歩行自立困難リスク高（半側空間無視または認知障害あり）",
  negativeMessage: "歩行自立可能性あり（半側空間無視なし・認知機能正常）"
};

// DB更新
const updates = [
  { id: 30006, def: rule30006 },
  { id: 30007, def: rule30007 },
  { id: 60007, def: rule60007 },
  { id: 60008, def: rule60008 },
];

for (const { id, def } of updates) {
  await conn.execute(
    'UPDATE literature_rules SET ruleDefinition = ? WHERE id = ?',
    [JSON.stringify(def), id]
  );
  console.log(`Updated ID ${id}: ${def.type}`);
}

await conn.end();
console.log('Done!');
