import type { PipelineRequest, Scenario, StageEvent } from "./types";

export async function fetchScenarios(): Promise<Scenario[]> {
  const res = await fetch("/api/scenarios");
  if (!res.ok) throw new Error("Failed to load scenarios");
  return res.json();
}

export async function fetchMode(): Promise<{ mode: "azure" | "mock"; model: string | null }> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Failed to load config");
  return res.json();
}

/**
 * Runs the pipeline and yields each stage event as it streams in from the
 * backend (newline-delimited JSON).
 */
export async function* runPipeline(request: PipelineRequest): AsyncGenerator<StageEvent> {
  const res = await fetch("/api/pipeline/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Pipeline request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) yield JSON.parse(line) as StageEvent;
    }
  }

  const rest = buffer.trim();
  if (rest) yield JSON.parse(rest) as StageEvent;
}
