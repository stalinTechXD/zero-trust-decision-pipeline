export type Stage = "employee" | "hr" | "finance" | "manager";
export type RiskLevel = "low" | "medium" | "high";
export type StageStatus = "pending" | "running" | "approved" | "flagged" | "rejected";

export interface LunchItem {
  name: string;
  price: number;
  allergens: string[];
}

export interface PipelineRequest {
  employeeName: string;
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

export interface Totals {
  total: number;
  perPerson: number;
  budgetRemaining: number;
}

export type StageEvent =
  | { type: "pipeline:start"; mode: "azure" | "mock"; totals: Totals }
  | { type: "stage:start"; stage: Stage; agentName: string }
  | { type: "stage:complete"; result: StageResult }
  | { type: "pipeline:complete"; decision: FinalDecision }
  | { type: "error"; message: string; stage?: Stage };

export interface Scenario {
  id: string;
  label: string;
  description: string;
  tag: "safe" | "risky";
  request: PipelineRequest;
}

export const STAGE_META: Record<Stage, { title: string; role: string; icon: string }> = {
  employee: { title: "Employee", role: "Intake Agent", icon: "🧑‍💼" },
  hr: { title: "HR", role: "Compliance Agent", icon: "🛡️" },
  finance: { title: "Finance", role: "Control Agent", icon: "💰" },
  manager: { title: "Manager", role: "Decision Agent", icon: "⚖️" },
};

export const STAGE_ORDER: Stage[] = ["employee", "hr", "finance", "manager"];
