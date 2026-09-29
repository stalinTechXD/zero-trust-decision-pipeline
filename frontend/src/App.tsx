import { useEffect, useMemo, useState } from "react";
import { fetchMode, fetchScenarios, runPipeline } from "./api";
import { ManagerDecision } from "./components/ManagerDecision";
import { PipelineView } from "./components/PipelineView";
import { RequestForm } from "./components/RequestForm";
import { ScenarioPicker } from "./components/ScenarioPicker";
import {
  STAGE_ORDER,
  type FinalDecision,
  type PipelineRequest,
  type Scenario,
  type Stage,
  type StageResult,
  type StageStatus,
} from "./types";

const initialStatuses = (): Record<Stage, StageStatus> => ({
  employee: "pending",
  hr: "pending",
  finance: "pending",
  manager: "pending",
});

export default function App() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [request, setRequest] = useState<PipelineRequest | null>(null);
  const [mode, setMode] = useState<{ mode: "azure" | "mock"; model: string | null } | null>(null);

  const [statuses, setStatuses] = useState<Record<Stage, StageStatus>>(initialStatuses());
  const [results, setResults] = useState<Partial<Record<Stage, StageResult>>>({});
  const [activeStage, setActiveStage] = useState<Stage | null>(null);
  const [decision, setDecision] = useState<FinalDecision | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchScenarios()
      .then((s) => {
        setScenarios(s);
        if (s.length > 0) {
          setSelectedId(s[0].id);
          setRequest(s[0].request);
        }
      })
      .catch((e) => setError(String(e)));
    fetchMode()
      .then(setMode)
      .catch(() => setMode({ mode: "mock", model: null }));
  }, []);

  const reset = () => {
    setStatuses(initialStatuses());
    setResults({});
    setActiveStage(null);
    setDecision(null);
    setError(null);
  };

  const onSelectScenario = (scenario: Scenario) => {
    if (running) return;
    setSelectedId(scenario.id);
    setRequest(scenario.request);
    reset();
  };

  const run = async () => {
    if (!request || running) return;
    reset();
    setRunning(true);

    try {
      for await (const event of runPipeline(request)) {
        switch (event.type) {
          case "stage:start":
            setActiveStage(event.stage);
            setStatuses((prev) => ({ ...prev, [event.stage]: "running" }));
            break;
          case "stage:complete":
            setResults((prev) => ({ ...prev, [event.result.stage]: event.result }));
            setStatuses((prev) => ({ ...prev, [event.result.stage]: event.result.status }));
            break;
          case "pipeline:complete":
            setDecision(event.decision);
            setActiveStage(null);
            break;
          case "error":
            setError(event.message);
            if (event.stage) setStatuses((prev) => ({ ...prev, [event.stage!]: "rejected" }));
            break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setActiveStage(null);
    }
  };

  const overallRisk = useMemo(() => {
    const order = { low: 0, medium: 1, high: 2 } as const;
    return STAGE_ORDER.map((s) => results[s]?.riskLevel)
      .filter(Boolean)
      .reduce<"low" | "medium" | "high">((acc, r) => (order[r!] > order[acc] ? r! : acc), "low");
  }, [results]);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo" aria-hidden>
            🔐
          </span>
          <div>
            <h1>Zero-Trust Decision Pipeline</h1>
            <p>Employee → HR → Finance → Manager · multi-agent orchestration</p>
          </div>
        </div>
        <div className="app__mode">
          {mode && (
            <span className={`mode-chip mode-chip--${mode.mode}`}>
              {mode.mode === "azure" ? `Azure AI Foundry · ${mode.model}` : "Simulated agents"}
            </span>
          )}
        </div>
      </header>

      <section className="panel">
        <div className="panel__head">
          <h2>1 · Pick a demo scenario</h2>
          <span className="hint">or edit the request below</span>
        </div>
        <ScenarioPicker
          scenarios={scenarios}
          selectedId={selectedId}
          onSelect={onSelectScenario}
          disabled={running}
        />
        {request && <RequestForm request={request} onChange={setRequest} disabled={running} />}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>2 · Run the pipeline</h2>
          <button className="run-button" onClick={run} disabled={running || !request}>
            {running ? "Running…" : "▶ Run pipeline"}
          </button>
        </div>

        {error && <div className="error-banner">⚠ {error}</div>}

        <PipelineView results={results} statuses={statuses} activeStage={activeStage} />
      </section>

      {decision && (
        <section className="panel">
          <div className="panel__head">
            <h2>3 · Final decision</h2>
            <span className={`overall-risk risk-${overallRisk}`}>Overall risk: {overallRisk}</span>
          </div>
          <ManagerDecision decision={decision} />
        </section>
      )}

      <footer className="app__footer">
        Reference architecture inspired by the zero-trust-lunch multi-agent demo. Backend runs on{" "}
        {mode?.mode === "azure" ? "Azure AI Foundry Agent Service" : "a deterministic mock engine"}.
      </footer>
    </div>
  );
}
