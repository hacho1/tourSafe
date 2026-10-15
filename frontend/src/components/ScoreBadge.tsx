import { ShieldCheck } from "lucide-react";
import type { SafetyScore } from "../../../shared/models";
import { scoreSummary } from "../config/constants";
export function ScoreBadge({
  score,
  compact = false,
}: {
  score: SafetyScore;
  compact?: boolean;
}) {
  const summary = scoreSummary(score);
  return (
    <span
      className={`score-badge ${["HOLD", "CHECK", "UNKNOWN"].includes(score.grade) ? "caution" : ""} ${compact ? "compact" : ""}`}
    >
      <ShieldCheck size={compact ? 14 : 16} />
      {compact || summary.total === null ? (
        summary.label
      ) : (
        <>
          TourSafe <strong>{summary.total}</strong>
          <span className="score-unit">/ 100</span>
        </>
      )}
    </span>
  );
}
