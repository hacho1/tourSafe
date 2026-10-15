import type { Coordinates, Evidence, Recommendation, SearchResponse, SupportFacility } from "../../../shared/models";
import { DEFAULT_REGION } from "../config/constants";

export const NEARBY_RADIUS = 1000;
export type NearbySelection =
  | { state: "ready"; place: Recommendation }
  | { state: "empty" | "not-configured" | "demo-blocked" }
  | { state: "error"; reason: "origin-mismatch" | "mixed-demo" | "adapter-error" | "unverified" };

function sameCoordinates(a: Coordinates | undefined, b: Coordinates): boolean {
  return Boolean(a && Number.isFinite(a.lat) && Number.isFinite(a.lng) &&
    Math.abs(a.lat - b.lat) < 0.0000001 && Math.abs(a.lng - b.lng) < 0.0000001);
}

function containsDemo(place: Recommendation): boolean {
  const { spot } = place;
  const evidence = [spot.openingHours, spot.holidays, spot.openNow, spot.closure,
    ...Object.values(spot.safety), ...Object.values(place.weather)];
  return spot.source.kind === "DEMO_DATA" ||
    place.facilities.some((facility) => facility.source.kind === "DEMO_DATA") ||
    evidence.some((item) => item.source?.kind === "DEMO_DATA") ||
    place.statuses.some((status) => status.status === "DEMO");
}

/** Check response identity and provenance before selecting a place. */
export function selectNearbyPlace(response: SearchResponse, origin: Coordinates | null, radius = NEARBY_RADIUS): NearbySelection {
  if (!sameCoordinates(response.origin, origin ?? DEFAULT_REGION) || response.radiusMeters !== radius) {
    return { state: "error", reason: "origin-mismatch" };
  }
  // A GPS fix at the demo coordinates is still an actual-location request.
  if (response.mode === "DEMO" && origin !== null) return { state: "demo-blocked" };
  if (response.mode === "LIVE") {
    if (response.statuses.some((status) => status.status === "DEMO") || response.recommendations.some(containsDemo)) {
      return { state: "error", reason: "mixed-demo" };
    }
    const tour = response.statuses.find((status) => status.key === "tour");
    if (tour?.status === "NOT_CONFIGURED") return { state: "not-configured" };
    if (tour?.status === "ERROR") return { state: "error", reason: "adapter-error" };
    if (tour?.status !== "OK") return { state: "error", reason: "unverified" };
  }
  const place = response.recommendations
    .filter((item) => Number.isFinite(item.spot.distanceMeters) && item.spot.distanceMeters >= 0 && item.spot.distanceMeters <= radius)
    .reduce<Recommendation | undefined>((nearest, item) =>
      !nearest || item.spot.distanceMeters < nearest.spot.distanceMeters ? item : nearest, undefined);
  return place ? { state: "ready", place } : { state: "empty" };
}

export type NearbyMedical =
  | { state: "ready"; facility: SupportFacility }
  | { state: "error" | "not-configured" | "empty" | "unknown" };

export function selectNearbyMedical(place: Recommendation): NearbyMedical {
  const status = place.statuses.find((item) => item.key === "medical");
  if (status?.status === "ERROR") return { state: "error" };
  if (status?.status === "NOT_CONFIGURED") return { state: "not-configured" };
  const facility = place.facilities
    .filter((item) => item.type === "MEDICAL" && item.distanceType === "STRAIGHT_LINE" &&
      Number.isFinite(item.distanceMeters) && item.distanceMeters >= 0)
    .reduce<SupportFacility | undefined>((nearest, item) =>
      !nearest || item.distanceMeters < nearest.distanceMeters ? item : nearest, undefined);
  if (facility) return { state: "ready", facility };
  return { state: status?.status === "OK" || place.statuses.some((item) => item.status === "DEMO") ? "empty" : "unknown" };
}

export function nearbyEvidenceText<T>(evidence: Evidence<T>, known: (value: T) => string, unavailable = "없음 확인"): string {
  if (evidence.status === "UNKNOWN") return "미확인";
  if (evidence.status === "NOT_AVAILABLE") return unavailable;
  return evidence.value === null ? "미확인" : known(evidence.value);
}

/** Invalidate callbacks even when the browser API cannot abort its operation. */
export function createLatestRequestGate() {
  let generation = 0;
  return {
    next: () => ++generation,
    isCurrent: (ticket: number) => ticket === generation,
    invalidate: () => { generation += 1; },
  };
}
