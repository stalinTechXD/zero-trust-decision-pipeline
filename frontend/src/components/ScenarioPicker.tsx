import type { Scenario } from "../types";

interface Props {
  scenarios: Scenario[];
  selectedId: string | null;
  onSelect: (scenario: Scenario) => void;
  disabled: boolean;
}

export function ScenarioPicker({ scenarios, selectedId, onSelect, disabled }: Props) {
  return (
    <div className="scenario-picker">
      {scenarios.map((s) => (
        <button
          key={s.id}
          className={`scenario-card ${s.tag} ${selectedId === s.id ? "selected" : ""}`}
          onClick={() => onSelect(s)}
          disabled={disabled}
          type="button"
        >
          <div className="scenario-card__top">
            <span className={`scenario-tag scenario-tag--${s.tag}`}>
              {s.tag === "safe" ? "Safe" : "High risk"}
            </span>
          </div>
          <strong>{s.label}</strong>
          <p>{s.description}</p>
        </button>
      ))}
    </div>
  );
}
