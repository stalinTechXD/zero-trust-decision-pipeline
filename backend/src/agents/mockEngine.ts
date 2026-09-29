import type { AgentEngine, FinalDecision, PipelineContext, RiskLevel, Stage, StageResult } from "../types.js";
import { AGENT_DEFINITIONS, ALLERGEN_WATCHLIST, PER_PERSON_GUIDELINE } from "./definitions.js";

const money = (n: number) => `$${n.toFixed(2)}`;

function findAllergens(ctx: PipelineContext): { item: string; allergens: string[] }[] {
  const watch = new Set(ALLERGEN_WATCHLIST.map((a) => a.toLowerCase()));
  const hits: { item: string; allergens: string[] }[] = [];
  for (const item of ctx.request.items) {
    const matched = item.allergens.filter((a) => watch.has(a.toLowerCase()));
    if (matched.length > 0) hits.push({ item: item.name, allergens: matched });
  }
  return hits;
}

const riskOrder: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
const maxRisk = (levels: RiskLevel[]): RiskLevel =>
  levels.reduce<RiskLevel>((acc, l) => (riskOrder[l] > riskOrder[acc] ? l : acc), "low");

/**
 * Deterministic engine that mirrors the agent prompts. Runs instantly with no
 * cloud dependency so the demo works offline, and doubles as the reference
 * behaviour the Azure agents are instructed to follow.
 */
export class MockEngine implements AgentEngine {
  readonly mode = "mock" as const;

  async runStage(stage: Exclude<Stage, "manager">, ctx: PipelineContext): Promise<StageResult> {
    // Small latency so the streaming pipeline animation is visible.
    await new Promise((r) => setTimeout(r, 550));
    switch (stage) {
      case "employee":
        return this.employee(ctx);
      case "hr":
        return this.hr(ctx);
      case "finance":
        return this.finance(ctx);
    }
  }

  private employee(ctx: PipelineContext): StageResult {
    const { request, totals } = ctx;
    const itemList = request.items.map((i) => `${i.name} (${money(i.price)})`).join(", ");
    return {
      stage: "employee",
      agentName: AGENT_DEFINITIONS.employee.name,
      status: "approved",
      riskLevel: "low",
      summary: `Packaged lunch order for ${request.attendees} attendees, total ${money(totals.total)}.`,
      reasoning: `Request from ${request.employeeName} is complete and well-formed. Order contains ${request.items.length} item(s): ${itemList}. Forwarding to HR for compliance review.`,
      findings: request.note ? [`Note from requester: "${request.note}"`] : [],
      metrics: {
        total: money(totals.total),
        attendees: request.attendees,
        perPerson: money(totals.perPerson),
      },
    };
  }

  private hr(ctx: PipelineContext): StageResult {
    const hits = findAllergens(ctx);
    if (hits.length === 0) {
      return {
        stage: "hr",
        agentName: AGENT_DEFINITIONS.hr.name,
        status: "approved",
        riskLevel: "low",
        summary: "No watchlist allergens detected in the order.",
        reasoning: `Screened all ${ctx.request.items.length} item(s) against the company allergen watchlist. Nothing flagged. Order is compliant with dietary policy.`,
        findings: [],
        metrics: { itemsScreened: ctx.request.items.length, allergenHits: 0 },
      };
    }
    const findings = hits.map((h) => `${h.item} contains ${h.allergens.join(", ")}`);
    return {
      stage: "hr",
      agentName: AGENT_DEFINITIONS.hr.name,
      status: "flagged",
      riskLevel: "high",
      summary: `${hits.length} item(s) contain unaccommodated watchlist allergens.`,
      reasoning: `Allergen screening found watchlist allergens without a documented accommodation. This is a high compliance risk that must be reviewed by the manager before approval.`,
      findings,
      metrics: { itemsScreened: ctx.request.items.length, allergenHits: hits.length },
    };
  }

  private finance(ctx: PipelineContext): StageResult {
    const { totals, request } = ctx;
    const overBudget = totals.total > request.teamBudget;
    const overPerPerson = totals.perPerson > PER_PERSON_GUIDELINE;
    const metrics = {
      total: money(totals.total),
      teamBudget: money(request.teamBudget),
      perPerson: money(totals.perPerson),
      guideline: money(PER_PERSON_GUIDELINE),
    };

    if (overBudget) {
      return {
        stage: "finance",
        agentName: AGENT_DEFINITIONS.finance.name,
        status: "rejected",
        riskLevel: "high",
        summary: `Order total ${money(totals.total)} exceeds the team budget ${money(request.teamBudget)}.`,
        reasoning: `Hard budget overrun of ${money(totals.total - request.teamBudget)}. Finance cannot clear this spend; escalating to the manager with a reject recommendation.`,
        findings: [`Over budget by ${money(totals.total - request.teamBudget)}`],
        metrics,
      };
    }
    if (overPerPerson) {
      return {
        stage: "finance",
        agentName: AGENT_DEFINITIONS.finance.name,
        status: "flagged",
        riskLevel: "medium",
        summary: `Per-person spend ${money(totals.perPerson)} exceeds the ${money(PER_PERSON_GUIDELINE)} guideline.`,
        reasoning: `Total is within the team budget, but the per-person amount is above the guideline. Recommend approval with a note to keep future orders leaner.`,
        findings: [`Per-person over guideline by ${money(totals.perPerson - PER_PERSON_GUIDELINE)}`],
        metrics,
      };
    }
    return {
      stage: "finance",
      agentName: AGENT_DEFINITIONS.finance.name,
      status: "approved",
      riskLevel: "low",
      summary: `Spend is within budget and per-person guideline.`,
      reasoning: `Order total ${money(totals.total)} is within the ${money(request.teamBudget)} budget and ${money(totals.perPerson)} per-person is under the ${money(PER_PERSON_GUIDELINE)} guideline. Cleared from a financial-controls perspective.`,
      findings: [],
      metrics,
    };
  }

  async runManager(ctx: PipelineContext): Promise<{ result: StageResult; decision: FinalDecision }> {
    await new Promise((r) => setTimeout(r, 700));
    const hr = ctx.priorResults.find((r) => r.stage === "hr");
    const finance = ctx.priorResults.find((r) => r.stage === "finance");

    const hardBlockers: string[] = [];
    if (hr?.riskLevel === "high") hardBlockers.push(`HR flagged a high allergen risk (${hr.findings.join("; ")})`);
    if (finance?.status === "rejected") hardBlockers.push(`Finance reported a hard budget overrun (${finance.findings.join("; ")})`);

    const overallRisk = maxRisk(ctx.priorResults.map((r) => r.riskLevel));
    const rejected = hardBlockers.length > 0;

    const conditions: string[] = [];
    if (!rejected && finance?.riskLevel === "medium") {
      conditions.push("Keep the next order under the per-person guideline.");
    }

    const reasoning = rejected
      ? `Rejecting the request. Blocking issues: ${hardBlockers.join(" and ")}. Under a zero-trust policy these cannot be waived without an accommodation or a revised budget.`
      : `Approving the request. HR cleared the order for allergens and Finance confirmed the spend is within controls. Overall risk is assessed as ${overallRisk}.`;

    const result: StageResult = {
      stage: "manager",
      agentName: AGENT_DEFINITIONS.manager.name,
      status: rejected ? "rejected" : "approved",
      riskLevel: overallRisk,
      summary: rejected ? "Final decision: REJECTED." : "Final decision: APPROVED.",
      reasoning,
      findings: rejected ? hardBlockers : conditions.length ? conditions : ["No blocking issues found."],
      metrics: { overallRisk },
    };

    const decision: FinalDecision = {
      decision: rejected ? "rejected" : "approved",
      riskLevel: overallRisk,
      reasoning,
      conditions,
    };

    return { result, decision };
  }
}
