import { STAGE_META, type Stage, type StageResult, type StageStatus } from "../types";
import { RiskBadge } from "./RiskBadge";

interface Props {
  stage: Stage;
  status: StageStatus;
  result?: StageResult;
  isActive: boolean;
}

const STATUS_LABEL: Record<StageStatus, string> = {
  pending: "Waiting",
  running: "Analyzing…",
  approved: "Approved",
  flagged: "Flagged",
  rejected: "Rejected",
};

export function StageCard({ stage, status, result, isActive }: Props) {
  const meta = STAGE_META[stage];

  return (
    <div className={`stage-card status-${status} ${isActive ? "active" : ""}`}>
      <div className="stage-card__header">
        <span className="stage-card__icon" aria-hidden>
          {meta.icon}
        </span>
        <div className="stage-card__title">
          <strong>{meta.title}</strong>
          <span className="stage-card__role">{meta.role}</span>
        </div>
        <span className={`status-pill status-pill--${status}`}>
          {status === "running" && <span className="spinner" aria-hidden />}
          {STATUS_LABEL[status]}
        </span>
      </div>

      {result ? (
        <div className="stage-card__body">
          <div className="stage-card__meta">
            <RiskBadge level={result.riskLevel} size="sm" />
          </div>
          <p className="stage-card__summary">{result.summary}</p>
          <p className="stage-card__reasoning">{result.reasoning}</p>

          {result.findings.length > 0 && (
            <ul className="stage-card__findings">
              {result.findings.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}

          {result.metrics && Object.keys(result.metrics).length > 0 && (
            <div className="stage-card__metrics">
              {Object.entries(result.metrics).map(([k, v]) => (
                <span key={k} className="metric-chip">
                  <span className="metric-chip__key">{k}</span>
                  <span className="metric-chip__val">{String(v)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="stage-card__body stage-card__body--empty">
          {status === "running" ? "Agent is evaluating the request…" : "Awaiting upstream stages."}
        </div>
      )}
    </div>
  );
}
