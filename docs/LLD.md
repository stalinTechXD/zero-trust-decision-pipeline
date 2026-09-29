# Low-Level Design (LLD)
## Multi-Agent "Zero-Trust" Decision Pipeline

**Version:** 1.0
**Date:** 2026-09-29
**Scope:** Implementation-level detail for backend, frontend, contracts, and Azure setup.

---

## 1. Repository Structure

```
Mutli-Agent-Zero-Trust-Decision-Pipeline/
├─ README.md
├─ docs/
│  ├─ HLD.md
│  └─ LLD.md
├─ backend/
│  ├─ package.json          # type: module, tsx dev/start, tsc typecheck
│  ├─ tsconfig.json         # ESNext, moduleResolution Bundler, noEmit
│  ├─ .env.example
│  └─ src/
│     ├─ index.ts           # Express app, routes, NDJSON streaming
│     ├─ config.ts          # env parsing, useAzure flag
│     ├─ types.ts           # domain + event + engine interfaces
│     ├─ agents/
│     │  ├─ definitions.ts   # role instructions, allergen watchlist, guideline
│     │  ├─ azureEngine.ts   # AzureAgentEngine (@azure/ai-projects)
│     │  └─ mockEngine.ts    # MockEngine (deterministic)
│     └─ pipeline/
│        ├─ orchestrator.ts  # runPipeline() async generator
│        └─ scenarios.ts     # demo scenarios (safe / risky)
└─ frontend/
   ├─ package.json
   ├─ vite.config.ts        # dev server :5173, /api proxy → :5178
   ├─ index.html
   └─ src/
      ├─ main.tsx
      ├─ App.tsx            # dashboard state machine
      ├─ api.ts             # NDJSON stream reader
      ├─ types.ts           # shared types + STAGE_META
      ├─ styles.css
      └─ components/
         ├─ PipelineView.tsx
         ├─ StageCard.tsx
         ├─ RiskBadge.tsx
         ├─ ManagerDecision.tsx
         ├─ ScenarioPicker.tsx
         └─ RequestForm.tsx
```

---

## 2. Domain Model (TypeScript)

Defined in `backend/src/types.ts` and mirrored in `frontend/src/types.ts`.

```ts
type Stage = "employee" | "hr" | "finance" | "manager";
type RiskLevel = "low" | "medium" | "high";
type StageStatus = "pending" | "running" | "approved" | "flagged" | "rejected";

interface LunchItem { name: string; price: number; allergens: string[]; }

interface PipelineRequest {
  employeeName: string;
  teamBudget: number;      // total approved budget (USD)
  attendees: number;
  items: LunchItem[];
  note?: string;
}

interface StageResult {
  stage: Stage;
  agentName: string;
  status: StageStatus;
  riskLevel: RiskLevel;
  summary: string;
  reasoning: string;
  findings: string[];
  metrics?: Record<string, string | number>;
}

interface FinalDecision {
  decision: "approved" | "rejected";
  riskLevel: RiskLevel;
  reasoning: string;
  conditions: string[];
}
```

### Derived totals (computed in orchestrator)

```
total           = Σ item.price
perPerson       = total / attendees
budgetRemaining = teamBudget − total
```

---

## 3. Streaming Event Contract (NDJSON)

Each line of the response body is one JSON object (`StageEvent`):

| `type` | Payload | When |
| --- | --- | --- |
| `pipeline:start` | `{ mode, totals }` | Once, before any stage |
| `stage:start` | `{ stage, agentName }` | Before each stage runs |
| `stage:complete` | `{ result: StageResult }` | After each stage finishes |
| `pipeline:complete` | `{ decision: FinalDecision }` | After the manager stage |
| `error` | `{ message, stage? }` | On any failure; pipeline stops |

Example stream (abridged):

```
{"type":"pipeline:start","mode":"mock","totals":{"total":111,"perPerson":18.5,"budgetRemaining":39}}
{"type":"stage:start","stage":"employee","agentName":"zero-trust-employee"}
{"type":"stage:complete","result":{"stage":"employee","status":"approved","riskLevel":"low",...}}
...
{"type":"stage:complete","result":{"stage":"manager","status":"rejected","riskLevel":"high",...}}
{"type":"pipeline:complete","decision":{"decision":"rejected","riskLevel":"high",...}}
```

---

## 4. REST API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{ ok: true }` |
| GET | `/api/config` | — | `{ mode: "azure"\|"mock", model: string\|null }` |
| GET | `/api/scenarios` | — | `Scenario[]` |
| POST | `/api/pipeline/run` | `PipelineRequest` | `text/x-ndjson` stream of `StageEvent` |

### Request validation (Zod, `index.ts`)

```ts
lunchItemSchema = { name: string≥1, price: number≥0, allergens: string[] = [] }
requestSchema   = {
  employeeName: string≥1,
  teamBudget: number>0,
  attendees: int>0,
  items: lunchItemSchema[]≥1,
  note?: string
}
```

Invalid input → `400 { error, details }` (no stream opened).

---

## 5. AgentEngine Abstraction

```ts
interface AgentEngine {
  readonly mode: "azure" | "mock";
  runStage(stage: "employee"|"hr"|"finance", ctx: PipelineContext): Promise<StageResult>;
  runManager(ctx: PipelineContext): Promise<{ result: StageResult; decision: FinalDecision }>;
}
```

`index.ts` selects the implementation once at startup:

```ts
engine = useAzure ? new AzureAgentEngine() : new MockEngine();
// useAzure === (PROJECT_ENDPOINT is non-empty)
// Azure constructor failure → catch → fall back to MockEngine
```

---

## 6. Orchestrator (`pipeline/orchestrator.ts`)

`runPipeline(engine, request)` is an **async generator** yielding `StageEvent`s.

Pseudocode:

```
totals = computeTotals(request)
ctx = { request, totals, priorResults: [] }
yield pipeline:start(mode, totals)
for stage in [employee, hr, finance, manager]:
    yield stage:start(stage)
    try:
        if stage == manager:
            {result, decision} = engine.runManager(ctx)
            ctx.priorResults.push(result)
            yield stage:complete(result)
            yield pipeline:complete(decision)
        else:
            result = engine.runStage(stage, ctx)
            ctx.priorResults.push(result)
            yield stage:complete(result)
    catch err:
        yield error(stage, err.message); return
```

`index.ts` consumes the generator and writes each event to the response with a
trailing `\n`, flushing after each write.

---

## 7. Policy Rules (enforced identically in Mock + Azure prompts)

Constants in `agents/definitions.ts`:

```
ALLERGEN_WATCHLIST = [peanuts, tree nuts, shellfish, gluten, dairy, soy, sesame, eggs]
PER_PERSON_GUIDELINE = 25   // USD
```

| Agent | Rule | Result |
| --- | --- | --- |
| **Employee** | Request complete & well-formed | `approved`, risk `low` |
| **HR** | Any item allergen ∈ watchlist (unaccommodated) | `flagged`, risk **`high`** |
| **HR** | No watchlist allergens | `approved`, risk `low` |
| **Finance** | `total > teamBudget` | `rejected`, risk **`high`** (hard overrun) |
| **Finance** | `perPerson > 25` but within budget | `flagged`, risk `medium` |
| **Finance** | Within budget & guideline | `approved`, risk `low` |
| **Manager** | HR risk `high` OR Finance `rejected` | **`rejected`** |
| **Manager** | Otherwise | **`approved`** (+ conditions if any `medium`) |

Overall risk = `max(risk of all stages)` using `low < medium < high`.

---

## 8. Azure Agent Engine (`agents/azureEngine.ts`)

### Client construction

```ts
project = new AIProjectClient(config.projectEndpoint, new DefaultAzureCredential());
```

### Lazy agent provisioning (per role, cached)

```
getAgentId(stage):
  if cached → return
  if config.agentIds[stage] set → cache & return that id     // reuse pre-created agent
  else → project.agents.createAgent(modelDeploymentName, {name, instructions})
         cache agent.id & return
```

### Single invocation

```
invoke(stage, userPrompt):
  agentId = getAgentId(stage)
  thread  = project.agents.threads.create()
  project.agents.messages.create(thread.id, "user", userPrompt)
  run     = project.agents.runs.createAndPoll(thread.id, agentId)
  if run.status != "completed": throw
  msgs    = project.agents.messages.list(thread.id, {order:"desc"})
  → first assistant text part → extractJson()
```

### Robust JSON extraction

- Strips ```` ```json ```` fences.
- Slices from first `{` to last `}`, `JSON.parse`.
- `coerceRisk` / `coerceStatus` / `coerceStringArray` guard against malformed output.

### Prompt composition

`buildContextBlock(ctx)` (requester, attendees, budget, total, per-person, items+allergens)
`+ buildPriorBlock(ctx)` (summaries + findings of upstream agents).

---

## 9. Mock Engine (`agents/mockEngine.ts`)

- Implements the same `AgentEngine` interface.
- Adds `setTimeout` delays (550–700 ms) so the streaming animation is visible.
- Deterministically computes the rules in Section 7.
- Used when `PROJECT_ENDPOINT` is empty **or** Azure init fails.

---

## 10. Frontend Design

### State machine (`App.tsx`)

```
state:
  scenarios, selectedId, request, mode
  statuses: Record<Stage, StageStatus>   // init all "pending"
  results:  Partial<Record<Stage, StageResult>>
  activeStage, decision, running, error

run():
  reset(); running = true
  for await event of runPipeline(request):
    stage:start      → statuses[stage] = "running"; activeStage = stage
    stage:complete   → results[stage] = result; statuses[stage] = result.status
    pipeline:complete→ decision = event.decision; activeStage = null
    error            → error = message; mark stage rejected
  running = false
```

### NDJSON reader (`api.ts`)

```ts
res = fetch("/api/pipeline/run", {POST, json body})
reader = res.body.getReader(); decoder = TextDecoder
buffer accumulates chunks; split on "\n"; JSON.parse each line → yield StageEvent
```

### Component tree

```
App
├─ ScenarioPicker      (safe/risky cards)
├─ RequestForm         (editable requester/budget/items/allergens)
├─ PipelineView
│  └─ StageCard × 4    (status pill, summary, reasoning, findings, metrics)
│     └─ RiskBadge     (low/medium/high; HIGH pulses red)
└─ ManagerDecision     (approved/rejected panel + conditions)
```

### Risk badge behaviour

`RiskBadge` renders `risk-high` with a CSS pulse animation (red). It turns red as
soon as HR flags an allergen or Finance flags an overrun — visible mid-stream,
before the final decision.

---

## 11. Configuration Reference (`backend/.env`)

| Variable | Required for Azure | Description |
| --- | --- | --- |
| `PROJECT_ENDPOINT` | ✅ | Foundry project endpoint. Empty ⇒ mock mode. |
| `MODEL_DEPLOYMENT_NAME` | ✅ | Deployed chat model name (default `gpt-4o-mini`). |
| `EMPLOYEE_AGENT_ID` | optional | Reuse a pre-created agent instead of auto-create. |
| `HR_AGENT_ID` | optional | " |
| `FINANCE_AGENT_ID` | optional | " |
| `MANAGER_AGENT_ID` | optional | " |
| `PORT` | optional | Backend port (default `5178`). |

---

## 12. Azure Foundry Provisioning (Step-by-Step)

1. **Create the project**
   - Go to https://ai.azure.com → *Create* → new **hub** + **project**
     (or reuse an existing hub). Note the project name.

2. **Deploy a model**
   - In the project → **Models + endpoints** → *Deploy model* → pick a chat model
     (e.g. `gpt-4o-mini`). The **deployment name** you choose is
     `MODEL_DEPLOYMENT_NAME`.

3. **Copy the endpoint**
   - Project **Overview** → copy the **project endpoint**
     (`https://<resource>.services.ai.azure.com/api/projects/<project>`) →
     `PROJECT_ENDPOINT`.

4. **Grant access (RBAC)**
   - On the project resource, assign your user the **Azure AI User** (or
     **Azure AI Developer**) role.
   - Sign in locally: `az login` (this is what `DefaultAzureCredential` uses).

5. **(Optional) Pre-create agents**
   - If you want to manage agents/instructions in the portal, create four agents
     and paste their IDs into `*_AGENT_ID`. Otherwise the app creates them for you
     on first run.

6. **Run**
   ```powershell
   cd backend ; npm install ; npm run dev   # logs "Agent engine mode: AZURE"
   cd frontend ; npm install ; npm run dev
   ```

> **Security note:** never commit `.env`. Credentials are never hard-coded; the
> app relies on `DefaultAzureCredential` (supports `az login`, managed identity,
> environment/service-principal credentials).

---

## 13. Error Handling

| Failure | Behaviour |
| --- | --- |
| Invalid request body | `400` with Zod `details`, no stream. |
| Azure client init fails | Caught in `index.ts`, falls back to `MockEngine`. |
| Agent run not `completed` | Throws; orchestrator emits `error` event; pipeline stops. |
| Agent returns non-JSON | `extractJson` throws → `error` event. |
| Stream write error | Wrapped `error` event appended; response ends. |

---

## 14. Extensibility Guide

**Add a new gate (e.g. "Legal"):**
1. Add `"legal"` to `Stage` in both `types.ts` files.
2. Add `AGENT_DEFINITIONS.legal` instructions in `definitions.ts`.
3. Insert `"legal"` into `PIPELINE_ORDER` in `orchestrator.ts` (before `manager`).
4. Implement its branch in `MockEngine.runStage` (and rely on generic Azure path).
5. Add `STAGE_META.legal` (icon/title) in frontend `types.ts` — UI renders it automatically.

**Change a policy:** edit constants (`ALLERGEN_WATCHLIST`, `PER_PERSON_GUIDELINE`)
and the corresponding rule in `mockEngine.ts` / prompt in `definitions.ts`.

---

## 15. Build & Verification

| Command | Purpose |
| --- | --- |
| `backend> npm run typecheck` | `tsc --noEmit` static check |
| `backend> npm run dev` | Start API on `:5178` (`tsx watch`) |
| `frontend> npm run build` | `tsc -b && vite build` |
| `frontend> npm run dev` | Start UI on `:5173` |

**Verified behaviour:**
- Safe scenario → all stages `approved`, overall risk `low`, decision **approved**.
- Allergen scenario → HR risk **high** (red badge), decision **rejected** citing HR.
- Over-budget scenario → Finance risk **high**, decision **rejected** citing Finance.
