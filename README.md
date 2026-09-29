# Multi-Agent "Zero-Trust" Decision Pipeline

A React dashboard that visualizes a multi-step AI workflow. A team lunch request
flows through a pipeline of specialist agents — **Employee → HR → Finance →
Manager** — where each stage is a separate agent with its own role. The final
Manager agent makes the approve/reject decision with reasoning.

Inspired by the [zero-trust-lunch](https://github.com/sazimi/zero-trust-lunch)
multi-agent demo.

## What it shows

- **Multi-agent orchestration** — each role is an independent agent; state is
  passed down the pipeline.
- **Zero-trust checks** — HR screens for allergens, Finance enforces budget, and
  nothing is approved until the Manager signs off.
- **Human-in-the-loop framing** — a final approval screen with the Manager
  agent's reasoning and conditions.
- **Live risk badges** — the risk badge turns red when HR flags an allergen or
  Finance detects a budget overrun.
- **Built-in demo scenarios** — a safe order and two high-risk orders so anyone
  can try it instantly.

## Architecture

```
frontend (React + TS + Vite)  ──POST /api/pipeline/run (NDJSON stream)──▶  backend (Express + TS)
                                                                             │
                                                        ┌────────────────────┴────────────────────┐
                                                        │  AzureAgentEngine  (@azure/ai-projects)   │  ← when PROJECT_ENDPOINT set
                                                        │  MockEngine        (deterministic)        │  ← default, runs offline
                                                        └───────────────────────────────────────────┘
```

The backend streams a stage-by-stage event feed (newline-delimited JSON) so the
UI animates the pipeline as each agent finishes.

## Prerequisites

- Node.js 18+

## Run it

Open two terminals.

**Backend**

```powershell
cd backend
npm install
Copy-Item .env.example .env   # optional: fill in Azure values
npm run dev
```

**Frontend**

```powershell
cd frontend
npm install
npm run dev
```

Then open the printed Vite URL (default http://localhost:5173). The frontend
proxies `/api` to the backend on port 5178.

## Using real Azure AI Foundry agents

By default the backend runs a deterministic **mock engine** so the demo works
with zero configuration. To use the real Azure AI Foundry Agent Service, set the
following in `backend/.env`:

| Variable | Description |
| --- | --- |
| `PROJECT_ENDPOINT` | Your Azure AI Foundry project endpoint (`https://<resource>.services.ai.azure.com/api/projects/<project>`) |
| `MODEL_DEPLOYMENT_NAME` | A deployed chat model, e.g. `gpt-4o-mini` |
| `EMPLOYEE_AGENT_ID` / `HR_AGENT_ID` / `FINANCE_AGENT_ID` / `MANAGER_AGENT_ID` | Optional — reuse pre-created agents instead of creating them on startup |

Authentication uses `DefaultAzureCredential`, so run `az login` (or provide a
service principal) before starting the backend. When `PROJECT_ENDPOINT` is set,
each role is provisioned as its own agent with role-specific instructions and
the pipeline calls them in sequence.

## Deployment (CI/CD)

Pushing to `main` triggers the GitHub Actions workflow in
[`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml):

1. **`build` job** (every push and pull request) — installs dependencies,
   type-checks the backend (`npm run typecheck`), and builds the frontend
   (`npm run build`). A failure here blocks the deploy.
2. **`deploy` job** (pushes to `main` only) — logs in to Azure with a
   passwordless **OIDC federated credential**, then runs
   `azd provision` and `azd deploy` using the service map in
   [`azure.yaml`](azure.yaml) (backend → App Service, frontend → Static Web App).

### Required GitHub repository variables

Set these under **Settings → Secrets and variables → Actions → Variables**:

| Variable | How to get it |
| --- | --- |
| `AZURE_CLIENT_ID` | App registration (Entra ID) **Application (client) ID** |
| `AZURE_TENANT_ID` | Entra ID **Directory (tenant) ID** |
| `AZURE_SUBSCRIPTION_ID` | Subscription overview **Subscription ID** |
| `AZURE_ENV_NAME` | Any azd environment name, e.g. `zerotrust-prod` |
| `AZURE_LOCATION` | Azure region, e.g. `eastus` |

The fastest way to create the app registration, OIDC federated credential, and
all five variables in one shot:

```powershell
azd auth login
azd pipeline config --provider github
```

The app registration needs a **Contributor** role assignment on the target
subscription and a federated credential whose subject is
`repo:<owner>/<repo>:ref:refs/heads/main`.

## Project layout

```
backend/
  src/
    index.ts               Express app + NDJSON streaming endpoint
    config.ts              Environment configuration
    types.ts               Shared domain + event types
    agents/
      definitions.ts       Role instructions + allergen watchlist
      azureEngine.ts       Azure AI Foundry Agent Service engine
      mockEngine.ts        Deterministic offline engine
    pipeline/
      orchestrator.ts      Runs stages in order, emits stream events
      scenarios.ts         Safe vs high-risk demo scenarios
frontend/
  src/
    App.tsx                Dashboard shell + pipeline state machine
    api.ts                 NDJSON stream client
    components/            PipelineView, StageCard, RiskBadge, ManagerDecision, ...
    styles.css             Dark theme
```
