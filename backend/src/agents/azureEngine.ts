import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "../config.js";
import type {
  AgentEngine,
  FinalDecision,
  PipelineContext,
  RiskLevel,
  Stage,
  StageResult,
  StageStatus,
} from "../types.js";
import { AGENT_DEFINITIONS, PER_PERSON_GUIDELINE } from "./definitions.js";

const money = (n: number) => `$${n.toFixed(2)}`;

const PIPELINE_STAGES: Stage[] = ["employee", "hr", "finance", "manager"];
const agentNameFor = (stage: Stage) => `zero-trust-${stage}`;

/** Extract the first balanced JSON object from an LLM response. */
function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Agent did not return JSON: ${text.slice(0, 200)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function coerceRisk(value: unknown): RiskLevel {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function coerceStatus(value: unknown): StageStatus {
  return value === "approved" || value === "flagged" || value === "rejected" ? value : "approved";
}

function coerceStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

/**
 * Runs the pipeline against real Azure AI Foundry agents. Each role maps to a
 * dedicated agent that is provisioned lazily (or reused via *_AGENT_ID env vars)
 * and cached for the lifetime of the process.
 */
export class AzureAgentEngine implements AgentEngine {
  readonly mode = "azure" as const;
  private readonly project: AIProjectClient;
  private readonly agentIdCache = new Map<Stage, string>();

  constructor() {
    this.project = new AIProjectClient(config.projectEndpoint, new DefaultAzureCredential());
  }

  /**
   * Creates the four role agents up front. Reuses an env-provided id, else an
   * existing agent with the same name, else creates a new one — so restarts do
   * not pile up duplicate agents. Returns the resolved id per stage.
   */
  async provisionAgents(): Promise<Record<Stage, string>> {
    const existingByName = await this.listExistingAgentsByName();
    const resolved = {} as Record<Stage, string>;

    for (const stage of PIPELINE_STAGES) {
      const def = AGENT_DEFINITIONS[stage];
      const name = agentNameFor(stage);
      const preset = config.agentIds[stage];

      let id: string;
      let origin: string;
      if (preset) {
        id = preset;
        origin = "env";
      } else if (existingByName.has(name)) {
        id = existingByName.get(name)!;
        origin = "reused";
      } else {
        const agent = await this.project.agents.createAgent(config.modelDeploymentName, {
          name,
          instructions: def.instructions,
        });
        id = agent.id;
        origin = "created";
      }

      this.agentIdCache.set(stage, id);
      resolved[stage] = id;
      console.log(`  • ${name} [${origin}] -> ${id}`);
    }

    return resolved;
  }

  private async listExistingAgentsByName(): Promise<Map<string, string>> {
    const byName = new Map<string, string>();
    try {
      for await (const agent of this.project.agents.listAgents()) {
        if (agent.name && !byName.has(agent.name)) {
          byName.set(agent.name, agent.id);
        }
      }
    } catch (err) {
      console.warn("Could not list existing agents; new ones will be created:", err instanceof Error ? err.message : err);
    }
    return byName;
  }

  private async getAgentId(stage: Stage): Promise<string> {
    const cached = this.agentIdCache.get(stage);
    if (cached) return cached;

    const preset = config.agentIds[stage];
    if (preset) {
      this.agentIdCache.set(stage, preset);
      return preset;
    }

    const def = AGENT_DEFINITIONS[stage];
    const agent = await this.project.agents.createAgent(config.modelDeploymentName, {
      name: `zero-trust-${stage}`,
      instructions: def.instructions,
    });
    this.agentIdCache.set(stage, agent.id);
    return agent.id;
  }

  private async invoke(stage: Stage, userPrompt: string): Promise<Record<string, unknown>> {
    const agentId = await this.getAgentId(stage);
    const thread = await this.project.agents.threads.create();
    await this.project.agents.messages.create(thread.id, "user", userPrompt);

    const run = await this.project.agents.runs.createAndPoll(thread.id, agentId);
    if (run.status !== "completed") {
      const reason = (run as { lastError?: { message?: string } }).lastError?.message ?? run.status;
      throw new Error(`Agent run for "${stage}" did not complete: ${reason}`);
    }

    const messages = await this.project.agents.messages.list(thread.id, { order: "desc" });
    for await (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.content) {
        if (part.type === "text" && "text" in part) {
          return extractJson((part as { text: { value: string } }).text.value);
        }
      }
    }
    throw new Error(`No assistant response for stage "${stage}".`);
  }

  private buildContextBlock(ctx: PipelineContext): string {
    const { request, totals } = ctx;
    const items = request.items
      .map((i) => `- ${i.name}: ${money(i.price)} | allergens: ${i.allergens.length ? i.allergens.join(", ") : "none declared"}`)
      .join("\n");
    return [
      `Requester: ${request.employeeName}`,
      `Attendees: ${request.attendees}`,
      `Team budget: ${money(request.teamBudget)}`,
      `Order total: ${money(totals.total)}`,
      `Per-person: ${money(totals.perPerson)} (guideline ${money(PER_PERSON_GUIDELINE)})`,
      request.note ? `Requester note: ${request.note}` : "",
      "Items:",
      items,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private buildPriorBlock(ctx: PipelineContext): string {
    if (ctx.priorResults.length === 0) return "";
    return (
      "\n\nUpstream agent assessments:\n" +
      ctx.priorResults
        .map((r) => `- ${r.agentName} [${r.status}, risk=${r.riskLevel}]: ${r.summary} ${r.findings.length ? `Findings: ${r.findings.join("; ")}` : ""}`)
        .join("\n")
    );
  }

  async runStage(stage: Exclude<Stage, "manager">, ctx: PipelineContext): Promise<StageResult> {
    const prompt = `Assess the following team lunch request for your role.\n\n${this.buildContextBlock(ctx)}${this.buildPriorBlock(ctx)}`;
    const raw = await this.invoke(stage, prompt);
    return {
      stage,
      agentName: AGENT_DEFINITIONS[stage].name,
      status: coerceStatus(raw.status),
      riskLevel: coerceRisk(raw.riskLevel),
      summary: String(raw.summary ?? ""),
      reasoning: String(raw.reasoning ?? ""),
      findings: coerceStringArray(raw.findings),
      metrics: (raw.metrics as Record<string, string | number>) ?? undefined,
    };
  }

  async runManager(ctx: PipelineContext): Promise<{ result: StageResult; decision: FinalDecision }> {
    const prompt = `Make the final decision on the following team lunch request.\n\n${this.buildContextBlock(ctx)}${this.buildPriorBlock(ctx)}`;
    const raw = await this.invoke("manager", prompt);
    const decisionValue = raw.decision === "rejected" ? "rejected" : "approved";
    const risk = coerceRisk(raw.riskLevel);
    const reasoning = String(raw.reasoning ?? "");
    const conditions = coerceStringArray(raw.conditions);

    const result: StageResult = {
      stage: "manager",
      agentName: AGENT_DEFINITIONS.manager.name,
      status: decisionValue,
      riskLevel: risk,
      summary: String(raw.summary ?? (decisionValue === "approved" ? "Final decision: APPROVED." : "Final decision: REJECTED.")),
      reasoning,
      findings: coerceStringArray(raw.findings),
      metrics: { overallRisk: risk },
    };

    return {
      result,
      decision: { decision: decisionValue, riskLevel: risk, reasoning, conditions },
    };
  }
}
