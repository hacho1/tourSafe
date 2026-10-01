import { ShieldCheck } from "lucide-react";
import type { SafetyScore } from "../../../shared/models";
import { GRADE } from "../config/constants";
export function ScoreBadge({
  score,
  compact = false,
}: {
  score: SafetyScore;
  compact?: boolean;
}) {
  return (
    <span
      className={`score-badge ${["HOLD", "CHECK", "UNKNOWN"].includes(score.grade) ? "caution" : ""} ${compact ? "compact" : ""}`}
    >
      <ShieldCheck size={compact ? 14 : 16} />
      {compact ? (
        GRADE[score.grade]
      ) : (
        <>
          TourSafe <strong>{score.total ?? "—"}</strong>
          <span className="score-unit">/ 100</span>
        </>
      )}
    </span>
  );
}
