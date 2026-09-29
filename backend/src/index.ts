import cors from "cors";
import express from "express";
import { z } from "zod";
import { config, useAzure } from "./config.js";
import { AzureAgentEngine } from "./agents/azureEngine.js";
import { MockEngine } from "./agents/mockEngine.js";
import { runPipeline } from "./pipeline/orchestrator.js";
import { SCENARIOS } from "./pipeline/scenarios.js";
import type { AgentEngine } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json());

let engine: AgentEngine;
try {
  engine = useAzure ? new AzureAgentEngine() : new MockEngine();
} catch (err) {
  console.error("Failed to initialise Azure engine, falling back to mock:", err);
  engine = new MockEngine();
}

console.log(`Agent engine mode: ${engine.mode.toUpperCase()}`);

if (engine instanceof AzureAgentEngine) {
  console.log("Provisioning zero-trust agents on Azure AI Foundry…");
  engine
    .provisionAgents()
    .then(() => console.log("Agents ready."))
    .catch((err) => console.error("Agent provisioning failed:", err instanceof Error ? err.message : err));
}

const lunchItemSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  allergens: z.array(z.string()).default([]),
});

const requestSchema = z.object({
  employeeName: z.string().min(1),
  teamBudget: z.number().positive(),
  attendees: z.number().int().positive(),
  items: z.array(lunchItemSchema).min(1),
  note: z.string().optional(),
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({ mode: engine.mode, model: useAzure ? config.modelDeploymentName : null });
});

app.get("/api/scenarios", (_req, res) => {
  res.json(SCENARIOS);
});

app.post("/api/pipeline/run", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    for await (const event of runPipeline(engine, parsed.data)) {
      res.write(JSON.stringify(event) + "\n");
      // Ensure each event is flushed to the client immediately.
      (res as unknown as { flush?: () => void }).flush?.();
    }
  } catch (err) {
    res.write(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : String(err) }) + "\n");
  } finally {
    res.end();
  }
});

app.listen(config.port, () => {
  console.log(`Zero-Trust pipeline backend listening on http://localhost:${config.port}`);
});
