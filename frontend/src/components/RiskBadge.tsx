import type { RiskLevel } from "../types";

const LABEL: Record<RiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

export function RiskBadge({ level, size = "md" }: { level: RiskLevel; size?: "sm" | "md" }) {
  return <span className={`risk-badge risk-${level} risk-${size}`}>{LABEL[level]}</span>;
}
