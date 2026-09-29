import type { AgentEngine, PipelineContext, PipelineRequest, Stage, StageEvent } from "../types.js";

const PIPELINE_ORDER: Stage[] = ["employee", "hr", "finance", "manager"];

function computeTotals(request: PipelineRequest): PipelineContext["totals"] {
  const total = request.items.reduce((sum, item) => sum + item.price, 0);
  const perPerson = request.attendees > 0 ? total / request.attendees : total;
  return {
    total,
    perPerson,
    budgetRemaining: request.teamBudget - total,
  };
}

/**
 * Drives the request through each agent in order, yielding streamable events so
 * the frontend can animate the pipeline stage by stage.
 */
export async function* runPipeline(engine: AgentEngine, request: PipelineRequest): AsyncGenerator<StageEvent> {
  const totals = computeTotals(request);
  const ctx: PipelineContext = { request, totals, priorResults: [] };

  yield { type: "pipeline:start", mode: engine.mode, totals };

  for (const stage of PIPELINE_ORDER) {
    yield { type: "stage:start", stage, agentName: `zero-trust-${stage}` };

    try {
      if (stage === "manager") {
        const { result, decision } = await engine.runManager(ctx);
        ctx.priorResults.push(result);
        yield { type: "stage:complete", result };
        yield { type: "pipeline:complete", decision };
      } else {
        const result = await engine.runStage(stage, ctx);
        ctx.priorResults.push(result);
        yield { type: "stage:complete", result };
      }
    } catch (err) {
      yield { type: "error", stage, message: err instanceof Error ? err.message : String(err) };
      return;
    }
  }
}
