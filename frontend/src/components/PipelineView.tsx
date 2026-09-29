import { STAGE_ORDER, type Stage, type StageResult, type StageStatus } from "../types";
import { StageCard } from "./StageCard";

interface Props {
  results: Partial<Record<Stage, StageResult>>;
  statuses: Record<Stage, StageStatus>;
  activeStage: Stage | null;
}

export function PipelineView({ results, statuses, activeStage }: Props) {
  return (
    <div className="pipeline">
      {STAGE_ORDER.map((stage, index) => (
        <div key={stage} className="pipeline__node">
          <StageCard
            stage={stage}
            status={statuses[stage]}
            result={results[stage]}
            isActive={activeStage === stage}
          />
          {index < STAGE_ORDER.length - 1 && (
            <div
              className={`pipeline__connector ${
                statuses[STAGE_ORDER[index + 1]] !== "pending" ? "filled" : ""
              }`}
              aria-hidden
            >
              <span className="pipeline__arrow">→</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
