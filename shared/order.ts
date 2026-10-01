import type { Recommendation } from "./models.js";
export function recommendationOrder(
  a: Recommendation,
  b: Recommendation,
): number {
  return (
    a.score.hardFilter.length - b.score.hardFilter.length ||
    Number(a.score.coverage < 60) - Number(b.score.coverage < 60) ||
    (b.score.total ?? -1) - (a.score.total ?? -1) ||
    b.score.coverage - a.score.coverage
  );
}
