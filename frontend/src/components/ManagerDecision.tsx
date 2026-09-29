import type { FinalDecision } from "../types";
import { RiskBadge } from "./RiskBadge";

export function ManagerDecision({ decision }: { decision: FinalDecision }) {
  const approved = decision.decision === "approved";
  return (
    <div className={`decision-panel ${approved ? "approved" : "rejected"}`}>
      <div className="decision-panel__header">
        <span className="decision-panel__icon" aria-hidden>
          {approved ? "✅" : "⛔"}
        </span>
        <div>
          <h2>{approved ? "Request Approved" : "Request Rejected"}</h2>
          <span className="decision-panel__sub">Manager Decision Agent · final authority</span>
        </div>
        <div className="decision-panel__risk">
          <RiskBadge level={decision.riskLevel} />
        </div>
      </div>

      <p className="decision-panel__reasoning">{decision.reasoning}</p>

      {decision.conditions.length > 0 && (
        <div className="decision-panel__conditions">
          <strong>Conditions of approval</strong>
          <ul>
            {decision.conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
