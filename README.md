<div align="center">

# 🛡️ Zero-Trust Decision Pipeline

### A multi-agent AI workflow that runs a team lunch request through four independent agents — each with its own role, memory, and veto power.

**React · TypeScript · Azure AI Foundry · Express · NDJSON Streaming**

[![CI/CD](https://github.com/<owner>/<repo>/actions/workflows/ci-cd.yml/badge.svg)](../../actions/workflows/ci-cd.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Azure AI Foundry](https://img.shields.io/badge/Azure-AI%20Foundry-0078D4?logo=microsoftazure&logoColor=white)](https://ai.azure.com/)
[![Deployed with azd](https://img.shields.io/badge/deployed%20with-azd-0078D4?logo=microsoftazure&logoColor=white)](https://learn.microsoft.com/azure/developer/azure-developer-cli/)

[**Live Demo**](#-live-demo) · [**Architecture**](#-architecture) · [**Quick Start**](#-quick-start) · [**Deploy**](#-deploy-to-azure)

</div>

---

<!--
📸 Replace this block with a real GIF of the pipeline animating.
Record with Loom, Kap, or OBS → save as docs/demo.gif → uncomment.
-->

<!--
<div align="center">
  <img src="docs/demo.gif" alt="Zero-Trust Decision Pipeline demo" width="820"/>
</div>
-->

## 📖 What is this?

A **team lunch request** flows through a pipeline of four specialist AI agents:


## Why this project stands out

- Zero-trust by design: each agent enforces a different constraint before the final decision is made.
- Role-based reasoning: the workflow separates task creation, risk screening, financial validation, and final approval.
- Azure AI Foundry ready: it can run with real hosted agents when configured, while still working offline with a deterministic mock engine.
- Explainable decisions: every stage emits structured events so the final decision can be traced and inspected.
- Demo-friendly patterns: built-in scenarios make it easy to test safe, risky, and blocked requests.

## Architecture

```text
Client / UI
   │
   ▼
POST /api/pipeline/run
   │
   ▼
Express API (TypeScript)
   │
   ├── Employee agent: captures the request and context
   ├── HR agent: checks allergens and compliance risk
   ├── Finance agent: validates cost against budget
   └── Manager agent: approves or rejects with reasoning

Fallback / optional execution:
   - Mock engine: deterministic local mode (default)
   - Azure AI Foundry engine: real hosted agents when PROJECT_ENDPOINT is set
```

The backend emits newline-delimited JSON events as each stage completes, which makes it easy to power a real-time UI or dashboard.

## Core workflow

1. Employee submits the lunch request.
2. HR verifies allergens and safety constraints.
3. Finance checks whether the order fits the team budget.
4. Manager reviews the full decision trail and approves or rejects.
5. The result is returned with traceable reasoning, not just a raw yes/no.

## Built-in scenarios

The system ships with a few demo requests:

- Safe team lunch: within budget and allergen-safe.
- High-risk allergen order: contains flagged ingredients.
- Over-budget order: financially invalid even if otherwise acceptable.

These scenarios are defined in the pipeline layer and are useful for testing both policy enforcement and user experience.

## Prerequisites

- Node.js 18+
- npm
- Optional: Azure CLI + Azure AI Foundry access if you want to run the real hosted agents

## Quick start

```powershell
cd backend
npm install
npm run dev
```

The API starts on:

```text
http://localhost:5178
```

### Health check

```powershell
curl http://localhost:5178/api/health
```

Expected response:

```json
{ "ok": true }
```

### Available endpoints

```text
GET  /api/health
GET  /api/config
GET  /api/scenarios
POST /api/pipeline/run
```

### Example request

```bash
curl -X POST http://localhost:5178/api/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{
    "employeeName": "Priya Sharma",
    "teamBudget": 120,
    "attendees": 5,
    "items": [
      { "name": "Garden salad bowls", "price": 40, "allergens": [] },
      { "name": "Grilled chicken wraps", "price": 45, "allergens": [] }
    ],
    "note": "Sprint retro lunch"
  }'
```

## Azure AI Foundry integration

By default, the backend runs with a deterministic mock engine so the project works without external infrastructure. To enable the real Azure-backed agent flow, set environment variables in a local `.env` file inside the backend folder.

```env
PROJECT_ENDPOINT="https://<resource>.services.ai.azure.com/api/projects/<project>"
MODEL_DEPLOYMENT_NAME="gpt-4o-mini"
EMPLOYEE_AGENT_ID=""
HR_AGENT_ID=""
FINANCE_AGENT_ID=""
MANAGER_AGENT_ID=""
PORT=5178
```

When `PROJECT_ENDPOINT` is present, the backend switches to the Azure engine and provisions role-specific agents. Authentication uses `DefaultAzureCredential`, so you should log in first with the Azure CLI:

```powershell
az login
```

## Project structure

```text
zero-trust-decision-pipeline/
├── .github/
│   └── workflows/
│       └── ci-cd.yml
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── config.ts
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── agents/
│   │   │   ├── azureEngine.ts
│   │   │   ├── definitions.ts
│   │   │   └── mockEngine.ts
│   │   └── pipeline/
│   │       ├── orchestrator.ts
│   │       └── scenarios.ts
│   └── run.log
├── LICENSE
├── README.md
└── .gitignore
```

## CI/CD

The repository includes a GitHub Actions workflow scaffold in `.github/workflows/ci-cd.yml` for automated validation and deployment workflows. The repository is ready to extend with Azure deployment automation as the app matures.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome. If you want to improve the policy logic, add more agent roles, or integrate a richer UI layer, open a pull request with a clear explanation of the workflow change and the expected behavior.

## Recommended next steps

- Add a real frontend dashboard for visualizing stage-by-stage events.
- Expand the agent policies to cover more risk dimensions.
- Add persistence for approvals and audit logs.
- Integrate a production deployment pipeline for Azure hosting.

---

Built for demonstrating how AI governance and zero-trust approval patterns can be expressed as an operational system, not just a single model call.
