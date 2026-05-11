import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * アウトカム定義テーブル
 * 例: 歩行自立、FIM、入院日数 など
 */
export const outcomes = mysqlTable("outcomes", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  unit: varchar("unit", { length: 64 }),
  positiveLabel: varchar("positiveLabel", { length: 128 }).notNull().default("自立"),
  negativeLabel: varchar("negativeLabel", { length: 128 }).notNull().default("非自立"),
  isDefault: boolean("isDefault").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Outcome = typeof outcomes.$inferSelect;
export type InsertOutcome = typeof outcomes.$inferInsert;

/**
 * 文献ルールテーブル
 *
 * ruleType:
 *   cutoff          - カットオフ値（単一・複合条件）
 *   decision_tree   - 決定木（条件分岐ノード）
 *   regression      - 重回帰式（線形スコア → 閾値判定）
 *   scoring_system  - スコアリングシステム（各変数に点数を割り当て合計点で判定）
 *   nomogram        - ノモグラム（ロジスティック回帰ベースの確率算出）
 *   composite_rule  - 複合条件ルール（AND/OR/NOT の論理演算）
 *   custom_formula  - カスタム数式（任意の数式を記述）
 */
export const literatureRules = mysqlTable("literature_rules", {
  id: int("id").autoincrement().primaryKey(),
  outcomeId: int("outcomeId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  ruleType: mysqlEnum("ruleType", [
    "cutoff",
    "decision_tree",
    "regression",
    "scoring_system",
    "nomogram",
    "composite_rule",
    "custom_formula",
  ]).notNull(),
  // 文献情報
  source: varchar("source", { length: 512 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 1024 }),
  evidenceLevel: mysqlEnum("evidenceLevel", [
    "Systematic Review",
    "RCT",
    "Cohort Study",
    "Case-Control",
    "Expert Classification",
    "Other",
  ])
    .notNull()
    .default("Cohort Study"),
  // 適用条件（JSON: ApplyCondition[]）
  applyConditions: json("applyConditions").$type<ApplyCondition[]>(),
  // ルール定義（JSON: RuleDefinitionによって異なる構造）
  ruleDefinition: json("ruleDefinition").$type<RuleDefinition>().notNull(),
  // 精度指標
  accuracy: float("accuracy"),
  sensitivity: float("sensitivity"),
  specificity: float("specificity"),
  auc: float("auc"),
  // コンセンサス集計対象かどうか
  consensusEligible: boolean("consensusEligible").default(true).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LiteratureRule = typeof literatureRules.$inferSelect;
export type InsertLiteratureRule = typeof literatureRules.$inferInsert;

/**
 * 予測セッションテーブル（患者1回分の入力）
 */
export const predictions = mysqlTable("predictions", {
  id: int("id").autoincrement().primaryKey(),
  patientInputs: json("patientInputs").$type<PatientInputs>().notNull(),
  outcomeId: int("outcomeId").notNull(),
  consensusScore: float("consensusScore"),
  consensusLabel: varchar("consensusLabel", { length: 64 }),
  // 退院時実績
  actualOutcome: json("actualOutcome").$type<ActualOutcome>(),
  outcomeRecordedAt: timestamp("outcomeRecordedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Prediction = typeof predictions.$inferSelect;
export type InsertPrediction = typeof predictions.$inferInsert;

/**
 * 個別ルール評価結果テーブル
 */
export const predictionResults = mysqlTable("prediction_results", {
  id: int("id").autoincrement().primaryKey(),
  predictionId: int("predictionId").notNull(),
  ruleId: int("ruleId").notNull(),
  ruleName: varchar("ruleName", { length: 256 }).notNull(),
  isApplicable: boolean("isApplicable").notNull(),
  unavailableReason: text("unavailableReason"),
  isPositive: boolean("isPositive"),
  prediction: text("prediction"),
  probability: float("probability"),
  details: json("details").$type<string[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PredictionResult = typeof predictionResults.$inferSelect;
export type InsertPredictionResult = typeof predictionResults.$inferInsert;

// ============================================================
// 型定義
// ============================================================

/** 適用条件（時期・患者属性などの前提条件） */
export type ApplyCondition = {
  field: string;
  operator: "<=" | ">=" | "<" | ">" | "==" | "!=" | "equals" | "boolean" | "boolean_negative";
  value: number | string | boolean;
  /** UI表示用ラベル */
  label?: string;
};

/** ルール定義のユニオン型 */
export type RuleDefinition =
  | CutoffRuleDefinition
  | DecisionTreeRuleDefinition
  | RegressionRuleDefinition
  | ScoringSystemRuleDefinition
  | NomogramRuleDefinition
  | CompositeRuleDefinition
  | CustomFormulaRuleDefinition;

// ---- 1. カットオフ値 ----
export type CutoffRuleDefinition = {
  type: "cutoff";
  field: string;
  fieldLabel: string;
  operator: "<=" | ">=" | "<" | ">";
  threshold: number;
  unit?: string;
  /** 追加の補助条件（AND結合） */
  secondaryConditions?: {
    field: string;
    fieldLabel: string;
    operator: "<=" | ">=" | "<" | ">" | "==";
    value: number | string | boolean;
    unit?: string;
  }[];
  positiveMessage: string;
  negativeMessage: string;
};

// ---- 2. 決定木 ----
export type DecisionTreeRuleDefinition = {
  type: "decision_tree";
  nodes: DecisionTreeNode[];
};

export type DecisionTreeNode = {
  id: string;
  field: string;
  fieldLabel: string;
  operator: "<=" | ">=" | "<" | ">" | "==" | "equals" | "boolean" | "boolean_negative";
  threshold?: number | string;
  trueNodeId?: string;
  falseNodeId?: string;
  isLeaf?: boolean;
  isPositive?: boolean;
  message?: string;
};

// ---- 3. 重回帰式 ----
export type RegressionRuleDefinition = {
  type: "regression";
  /** 数式の説明（例: "score = 0.3×BBS + 0.2×TCT - 5"） */
  formula: string;
  intercept: number;
  coefficients: {
    field: string;
    fieldLabel: string;
    coefficient: number;
    unit?: string;
  }[];
  /** スコア ≥ threshold → positive */
  threshold: number;
  positiveMessage: string;
  negativeMessage: string;
};

// ---- 4. スコアリングシステム ----
/**
 * 各変数に点数を割り当て、合計点と閾値で判定する。
 * 例: NIHSS 0-4点→3点、5-15点→2点、16以上→0点 のような区間別スコア
 */
export type ScoringSystemRuleDefinition = {
  type: "scoring_system";
  items: ScoringItem[];
  /** 合計点 ≥ threshold → positive */
  threshold: number;
  maxScore: number;
  positiveMessage: string;
  negativeMessage: string;
};

export type ScoringItem = {
  field: string;
  fieldLabel: string;
  unit?: string;
  /** 区間別スコア定義 */
  bands: {
    /** 条件: operator + value で評価 */
    operator: "<=" | ">=" | "<" | ">" | "==" | "equals" | "boolean" | "boolean_negative";
    value?: number | string | boolean;
    /** この条件を満たした場合の加算点 */
    score: number;
    label: string;
  }[];
};

// ---- 5. ノモグラム ----
/**
 * ロジスティック回帰ベース。各変数の係数と切片から log-odds を計算し、
 * 確率 = 1 / (1 + exp(-logOdds)) で陽性確率を算出する。
 */
export type NomogramRuleDefinition = {
  type: "nomogram";
  intercept: number;
  variables: {
    field: string;
    fieldLabel: string;
    coefficient: number;
    unit?: string;
    /** カテゴリ変数の場合のマッピング（例: 男性→0, 女性→1） */
    categoryMap?: Record<string, number>;
  }[];
  /** 確率 ≥ threshold → positive（0.0〜1.0） */
  probabilityThreshold?: number;
  positiveMessage: string;
  negativeMessage: string;
};

// ---- 6. 複合条件ルール ----
/**
 * AND/OR/NOT の論理演算でカットオフ条件を組み合わせる。
 * 例: (BBS ≥ 14 AND TCT > 40) OR (NIHSS ≤ 7)
 */
export type CompositeRuleDefinition = {
  type: "composite_rule";
  /** ルートの論理ノード */
  root: LogicNode;
  positiveMessage: string;
  negativeMessage: string;
};

export type LogicNode =
  | { logic: "AND"; children: LogicNode[] }
  | { logic: "OR"; children: LogicNode[] }
  | { logic: "NOT"; child: LogicNode }
  | {
      logic: "CONDITION";
      field: string;
      fieldLabel: string;
      operator: "<=" | ">=" | "<" | ">" | "==" | "!=" | "equals" | "boolean" | "boolean_negative";
      value?: number | string | boolean;
      unit?: string;
    };

// ---- 7. カスタム数式 ----
/**
 * ユーザーが任意の数式を記述する。
 * 変数名はPatientInputsのフィールド名をそのまま使用。
 * 例: "0.3 * bbs_score + 0.2 * tct_score - 5"
 */
export type CustomFormulaRuleDefinition = {
  type: "custom_formula";
  /** 数式文字列（mathjs形式） */
  formula: string;
  /** 数式の説明 */
  formulaDescription: string;
  /** 使用する変数一覧（UI表示用） */
  variables: {
    field: string;
    fieldLabel: string;
    unit?: string;
  }[];
  /** スコア ≥ threshold → positive */
  threshold: number;
  positiveMessage: string;
  negativeMessage: string;
};

// ---- 患者入力データ ----
export type PatientInputs = {
  age?: number;
  sex?: "男性" | "女性";
  days_since_onset?: number;
  stroke_type?: string;
  nihss?: number;
  tct_score?: number;
  bbs_score?: number;
  motricity_index_lower?: number;
  walk_speed_10m?: number;
  sitting_balance_30s?: boolean;
  spatial_neglect?: boolean;
  mmse_score?: number;
  caregiver_available?: boolean;
  diabetes?: boolean;
  fim_motor?: number;
  fim_cognitive?: number;
  fim_total?: number;
  fugl_meyer_lower?: number;
  moca_score?: number;
  trunk_control?: number;
  // 追加評価項目（論文対応）
  knee_extension_paretic?: number;   // 麻痺側膝伸展筋力 (Nm/kg)
  knee_extension_nonparetic?: number; // 非麻痺側膝伸展筋力 (Nm/kg)
  knee_extension_total?: number;     // 両側合計膝伸展筋力 (Nm/kg)
  fbs_score?: number;                // Functional Balance Scale (0-56)
  cba_score?: number;                // Cognitive Behavioral Assessment (0-30)
  rising_from_bed?: 0 | 1 | 2;      // 起居動作 (0=自立, 1=監視, 2=介助)
  tug_time?: number;                 // Timed Up and Go (秒)
  fma_lower?: number;                // Fugl-Meyer Assessment 下肢 (0-34)
  brs_lower?: number;                // Brunnstrom Recovery Stage 下肢 (1-6)
  delta_bbs?: number;                // BBS変化量（入院→現在）
  delta_fim_motor?: number;          // FIM運動変化量（入院→現在）
  unilateral_spatial_neglect?: 0 | 1; // 半側空間無視 (0=なし, 1=あり)
  cognitive_impairment?: 0 | 1;      // 認知障害 (0=なし, 1=あり)
  care_level?: number;               // 要介護区分 (0-5)
  [key: string]: unknown;
};

// ---- 実績アウトカム ----
export type ActualOutcome = {
  value: string | number | boolean;
  label: string;
  fac_at_discharge?: number;
  fim_at_discharge?: number;
  hospital_days?: number;
  notes?: string;
};
