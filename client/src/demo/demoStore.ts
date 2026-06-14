import { extractRequiredFieldsFromDef, runEngine } from "@shared/ruleEngine";
import type { ActualOutcome, PatientInputs } from "../../../drizzle/schema";
import { DEMO_DATA_VERSION, DEMO_OUTCOMES, DEMO_RULES } from "./staticData.generated";

type DemoOutcome = {
  id: number;
  name: string;
  description: string | null;
  unit: string | null;
  positiveLabel: string;
  negativeLabel: string;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type DemoRule = {
  id: number;
  outcomeId: number;
  name: string;
  ruleType: string;
  source: string;
  sourceUrl: string | null;
  evidenceLevel: string;
  applyConditions: unknown[];
  ruleDefinition: Record<string, unknown>;
  accuracy: number | null;
  sensitivity: number | null;
  specificity: number | null;
  auc: number | null;
  consensusEligible: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type DemoPrediction = {
  id: number;
  patientInputs: PatientInputs;
  outcomeId: number;
  consensusScore: number | null;
  consensusLabel: string | null;
  actualOutcome: ActualOutcome | null;
  outcomeRecordedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type DemoPredictionResult = {
  id: number;
  predictionId: number;
  ruleId: number;
  ruleName: string;
  isApplicable: boolean;
  unavailableReason: string | null;
  isPositive: boolean | null;
  prediction: string | null;
  probability: number | null;
  details: string[];
  createdAt: string;
};

type DemoState = {
  version: string;
  outcomes: DemoOutcome[];
  rules: DemoRule[];
  predictions: DemoPrediction[];
  predictionResults: DemoPredictionResult[];
  nextOutcomeId: number;
  nextRuleId: number;
  nextPredictionId: number;
  nextPredictionResultId: number;
};

const STORAGE_KEY = "rehab-predict-demo-state";

function nowIso() {
  return new Date().toISOString();
}

function initialState(): DemoState {
  const outcomes = DEMO_OUTCOMES.map((outcome) => ({
    ...outcome,
    description: outcome.description ?? null,
    unit: outcome.unit ?? null,
  })) as DemoOutcome[];
  const rules = DEMO_RULES.map((rule) => ({
    ...rule,
    sourceUrl: rule.sourceUrl ?? null,
    applyConditions: [...rule.applyConditions],
    ruleDefinition: { ...rule.ruleDefinition },
  })) as DemoRule[];

  return {
    version: DEMO_DATA_VERSION,
    outcomes,
    rules,
    predictions: [],
    predictionResults: [],
    nextOutcomeId: Math.max(...outcomes.map((outcome) => outcome.id)) + 1,
    nextRuleId: Math.max(...rules.map((rule) => rule.id)) + 1,
    nextPredictionId: 1,
    nextPredictionResultId: 1,
  };
}

function readState(): DemoState {
  if (typeof localStorage === "undefined") return initialState();

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const state = initialState();
    writeState(state);
    return state;
  }

  try {
    const parsed = JSON.parse(raw) as DemoState;
    if (parsed.version !== DEMO_DATA_VERSION) {
      const state = initialState();
      writeState(state);
      return state;
    }
    return parsed;
  } catch {
    const state = initialState();
    writeState(state);
    return state;
  }
}

function writeState(state: DemoState) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function withState<T>(fn: (state: DemoState) => T): T {
  const state = readState();
  const result = fn(state);
  writeState(state);
  return result;
}

function activeRulesForOutcome(state: DemoState, outcomeId: number) {
  return state.rules
    .filter((rule) => rule.outcomeId === outcomeId && rule.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

function decorateRule(rule: DemoRule) {
  const applyConditions = Array.isArray(rule.applyConditions) ? rule.applyConditions : [];
  return {
    ...rule,
    requiredFields: Array.from(new Set(extractRequiredFieldsFromDef(rule.ruleDefinition as never))),
    applyConditionFields: applyConditions
      .filter((condition): condition is { field: string; label?: string } => {
        return Boolean(
          condition &&
            typeof condition === "object" &&
            "field" in condition &&
            typeof (condition as { field?: unknown }).field === "string",
        );
      })
      .filter((condition, index, conditions) =>
        conditions.findIndex((candidate) => candidate.field === condition.field) === index
      )
      .map((condition) => ({
        field: condition.field,
        label: condition.label ?? condition.field,
      })),
  };
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return text.includes(",") || text.includes('"') || text.includes("\n")
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function exportCsv(predictions: DemoPrediction[]) {
  const headers = [
    "ID", "評価日時", "アウトカムID", "年齢", "性別", "発症日数",
    "NIHSS", "TCT", "BBS", "10m速度", "MMSE",
    "座位30秒", "空間無視", "介護者", "糖尿病",
    "FIM運動", "FIM認知", "FIM合計",
    "コンセンサススコア", "コンセンサスラベル",
    "実績値", "実績記録日", "メモ",
  ];

  const rows = predictions.map((prediction) => {
    const input = prediction.patientInputs;
    const actual = prediction.actualOutcome;
    return [
      prediction.id,
      new Date(prediction.createdAt).toLocaleString("ja-JP"),
      prediction.outcomeId,
      input.age ?? "",
      input.sex ?? "",
      input.days_since_onset ?? "",
      input.nihss ?? "",
      input.tct_score ?? "",
      input.bbs_score ?? "",
      input.walk_speed_10m ?? "",
      input.mmse_score ?? "",
      input.sitting_balance_30s != null ? (input.sitting_balance_30s ? 1 : 0) : "",
      input.spatial_neglect != null ? (input.spatial_neglect ? 1 : 0) : "",
      input.caregiver_available != null ? (input.caregiver_available ? 1 : 0) : "",
      input.diabetes != null ? (input.diabetes ? 1 : 0) : "",
      input.fim_motor ?? "",
      input.fim_cognitive ?? "",
      input.fim_total ?? "",
      prediction.consensusScore != null ? prediction.consensusScore.toFixed(3) : "",
      prediction.consensusLabel ?? "",
      actual?.value ?? "",
      prediction.outcomeRecordedAt ? new Date(prediction.outcomeRecordedAt).toLocaleString("ja-JP") : "",
      prediction.notes ?? "",
    ];
  });

  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n")}`;
}

export async function callDemoProcedure(path: string, input: unknown) {
  switch (path) {
    case "auth.me":
      return {
        id: 0,
        openId: "demo-user",
        name: "Demo User",
        email: "demo@example.local",
        role: "admin",
      };
    case "auth.logout":
      return { success: true };
    case "outcomes.list":
      return readState().outcomes.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    case "outcomes.get":
      return readState().outcomes.find((outcome) => outcome.id === (input as { id: number }).id);
    case "outcomes.create":
      return withState((state) => {
        const data = input as Partial<DemoOutcome>;
        const timestamp = nowIso();
        state.outcomes.push({
          id: state.nextOutcomeId++,
          name: data.name ?? "",
          description: data.description ?? null,
          unit: data.unit ?? null,
          positiveLabel: data.positiveLabel ?? "陽性",
          negativeLabel: data.negativeLabel ?? "陰性",
          isDefault: data.isDefault ?? false,
          sortOrder: data.sortOrder ?? 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        return { success: true };
      });
    case "outcomes.update":
      return withState((state) => {
        const { id, data } = input as { id: number; data: Partial<DemoOutcome> };
        const target = state.outcomes.find((outcome) => outcome.id === id);
        if (!target) throw new Error("Outcome not found");
        Object.assign(target, data, { updatedAt: nowIso() });
        return { success: true };
      });
    case "outcomes.delete":
      return withState((state) => {
        const { id } = input as { id: number };
        const target = state.outcomes.find((outcome) => outcome.id === id);
        if (target?.isDefault) throw new Error("Default outcome cannot be deleted");
        state.outcomes = state.outcomes.filter((outcome) => outcome.id !== id);
        state.rules = state.rules.filter((rule) => rule.outcomeId !== id);
        return { success: true };
      });
    case "rules.list": {
      const state = readState();
      const outcomeId = (input as { outcomeId?: number } | undefined)?.outcomeId;
      return state.rules
        .filter((rule) => outcomeId === undefined || (rule.outcomeId === outcomeId && rule.isActive))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map(decorateRule);
    }
    case "rules.get":
      return readState().rules.find((rule) => rule.id === (input as { id: number }).id);
    case "rules.create":
      return withState((state) => {
        const data = input as Omit<DemoRule, "id" | "createdAt" | "updatedAt">;
        const timestamp = nowIso();
        state.rules.push({
          ...data,
          id: state.nextRuleId++,
          sourceUrl: data.sourceUrl || null,
          accuracy: data.accuracy ?? null,
          sensitivity: data.sensitivity ?? null,
          specificity: data.specificity ?? null,
          auc: data.auc ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        return { success: true };
      });
    case "rules.update":
      return withState((state) => {
        const { id, data } = input as { id: number; data: Partial<DemoRule> };
        const target = state.rules.find((rule) => rule.id === id);
        if (!target) throw new Error("Rule not found");
        Object.assign(target, data, {
          sourceUrl: data.sourceUrl || null,
          updatedAt: nowIso(),
        });
        return { success: true };
      });
    case "rules.delete":
      return withState((state) => {
        const { id } = input as { id: number };
        state.rules = state.rules.filter((rule) => rule.id !== id);
        return { success: true };
      });
    case "predict.preview": {
      const state = readState();
      const { outcomeId, patientInputs } = input as { outcomeId: number; patientInputs: PatientInputs };
      return runEngine(activeRulesForOutcome(state, outcomeId) as never, patientInputs);
    }
    case "predict.run":
      return withState((state) => {
        const { outcomeId, patientInputs } = input as { outcomeId: number; patientInputs: PatientInputs };
        const output = runEngine(activeRulesForOutcome(state, outcomeId) as never, patientInputs);
        const timestamp = nowIso();
        const predictionId = state.nextPredictionId++;
        state.predictions.unshift({
          id: predictionId,
          patientInputs,
          outcomeId,
          consensusScore: output.consensus.score,
          consensusLabel: output.consensus.label,
          actualOutcome: null,
          outcomeRecordedAt: null,
          notes: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        for (const result of output.results) {
          state.predictionResults.push({
            id: state.nextPredictionResultId++,
            predictionId,
            ruleId: result.ruleId,
            ruleName: result.ruleName,
            isApplicable: result.isApplicable,
            unavailableReason: result.unavailableReason,
            isPositive: result.isPositive,
            prediction: result.prediction,
            probability: result.probability,
            details: result.details,
            createdAt: timestamp,
          });
        }
        return { predictionId, ...output };
      });
    case "history.list": {
      const state = readState();
      const limit = (input as { limit?: number } | undefined)?.limit ?? 100;
      return state.predictions
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
    }
    case "history.get": {
      const state = readState();
      const { id } = input as { id: number };
      return {
        prediction: state.predictions.find((prediction) => prediction.id === id),
        results: state.predictionResults.filter((result) => result.predictionId === id),
      };
    }
    case "history.updateOutcome":
      return withState((state) => {
        const { id, actualOutcome, notes } = input as {
          id: number;
          actualOutcome: ActualOutcome;
          notes?: string;
        };
        const target = state.predictions.find((prediction) => prediction.id === id);
        if (!target) throw new Error("Prediction not found");
        target.actualOutcome = actualOutcome;
        target.outcomeRecordedAt = nowIso();
        target.notes = notes ?? null;
        target.updatedAt = nowIso();
        return { success: true };
      });
    case "history.exportCsv": {
      const state = readState();
      const limit = (input as { limit?: number } | undefined)?.limit ?? 1000;
      return { csv: exportCsv(state.predictions.slice(0, limit)) };
    }
    default:
      throw new Error(`Demo procedure is not implemented: ${path}`);
  }
}
