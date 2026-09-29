export type Stage = "employee" | "hr" | "finance" | "manager";

export type RiskLevel = "low" | "medium" | "high";

export type StageStatus = "pending" | "running" | "approved" | "flagged" | "rejected";

export interface LunchItem {
  name: string;
  /** Total price for this line item (in USD). */
  price: number;
  /** Declared allergens for this item, e.g. ["peanuts"]. */
  allergens: string[];
}

export interface PipelineRequest {
  employeeName: string;
  /** Total budget approved for the team lunch. */
  teamBudget: number;
  attendees: number;
  items: LunchItem[];
  note?: string;
}

export interface StageResult {
  stage: Stage;
  agentName: string;
  status: StageStatus;
  riskLevel: RiskLevel;
  summary: string;
  reasoning: string;
  findings: string[];
  metrics?: Record<string, string | number>;
}

export interface FinalDecision {
  decision: "approved" | "rejected";
  riskLevel: RiskLevel;
  reasoning: string;
  conditions: string[];
}

/** Context accumulated as the request flows down the pipeline. */
export interface PipelineContext {
  request: PipelineRequest;
  totals: {
    total: number;
    perPerson: number;
    budgetRemaining: number;
  };
  priorResults: StageResult[];
}

export type StageEvent =
  | { type: "pipeline:start"; mode: "azure" | "mock"; totals: PipelineContext["totals"] }
  | { type: "stage:start"; stage: Stage; agentName: string }
  | { type: "stage:complete"; result: StageResult }
  | { type: "pipeline:complete"; decision: FinalDecision }
  | { type: "error"; message: string; stage?: Stage };

/** Common interface implemented by both the Azure and mock engines. */
export interface AgentEngine {
  readonly mode: "azure" | "mock";
  runStage(stage: Exclude<Stage, "manager">, ctx: PipelineContext): Promise<StageResult>;
  runManager(ctx: PipelineContext): Promise<{ result: StageResult; decision: FinalDecision }>;
}
