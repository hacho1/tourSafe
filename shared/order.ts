import type { Recommendation } from "./models.js";
// Server has no personal needs. Keep ordering neutral; personal suitability is evaluated locally.
export function recommendationOrder(a: Recommendation, b: Recommendation): number {
  return a.spot.distanceMeters - b.spot.distanceMeters;
}
