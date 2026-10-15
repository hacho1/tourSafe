import { test } from "node:test";
import assert from "node:assert/strict";
import type { AdapterStatus, DataSource, Evidence, SearchResponse } from "../shared/models.js";
import { demoOrigin, demoRecommendations } from "../backend/src/mock/fixtures.js";
import {
  createLatestRequestGate,
  nearbyEvidenceText,
  selectNearbyMedical,
  selectNearbyPlace,
} from "../frontend/src/utils/nearby.js";

const source: DataSource = { kind: "PUBLIC_DATA", name: "검증용 공공자료", url: null };
const status = (key: string, state: AdapterStatus["status"]): AdapterStatus =>
  ({ key, status: state, name: key, message: state });

function demoResponse(): SearchResponse {
  return {
    mode: "DEMO",
    generatedAt: "2026-10-11T01:00:00Z",
    origin: { ...demoOrigin },
    radiusMeters: 1000,
    recommendations: structuredClone(demoRecommendations({ ...demoOrigin, radius: 5000, withKids: true })),
    statuses: [status("demo", "DEMO")],
  };
}

function liveResponse(): SearchResponse {
  const response = demoResponse();
  response.mode = "LIVE";
  response.statuses = [status("tour", "OK")];
  for (const item of response.recommendations) {
    item.spot.source = source;
    for (const evidence of [item.spot.openingHours, item.spot.holidays, item.spot.openNow, item.spot.closure,
      ...Object.values(item.spot.safety), ...Object.values(item.weather)]) {
      if (evidence.source) evidence.source = source;
    }
    for (const facility of item.facilities) facility.source = source;
    item.statuses = [status("medical", "OK")];
  }
  return response;
}

test("selects the nearest in-radius place rather than score order, without mutating the response", () => {
  const response = demoResponse();
  response.recommendations.reverse();
  const expected = response.recommendations.filter((item) => item.spot.distanceMeters <= 1000)
    .sort((a, b) => a.spot.distanceMeters - b.spot.distanceMeters)[0]!;
  assert.ok(response.recommendations.some((item) => item.spot.distanceMeters > 1000));
  const invalid = structuredClone(expected);
  invalid.spot.id = "invalid-negative-distance";
  invalid.spot.distanceMeters = -1;
  response.recommendations.unshift(invalid);
  const order = response.recommendations.map((item) => item.spot.id);
  const result = selectNearbyPlace(response, null);
  assert.equal(result.state, "ready");
  if (result.state !== "ready") throw new Error("Expected a nearby place");
  assert.equal(result.place.spot.id, expected.spot.id);
  assert.deepEqual(response.recommendations.map((item) => item.spot.id), order);
});

test("demo is available only at the default origin, including when GPS fixes to exactly that location", () => {
  const response = demoResponse();
  assert.equal(selectNearbyPlace(response, null).state, "ready");
  assert.deepEqual(selectNearbyPlace(response, demoOrigin), { state: "demo-blocked" });
  const actualOrigin = { lat: 35.16, lng: 129.16 };
  response.origin = actualOrigin;
  assert.deepEqual(selectNearbyPlace(response, actualOrigin), { state: "demo-blocked" });
  assert.deepEqual(selectNearbyPlace(response, null), { state: "error", reason: "origin-mismatch" });
});

test("a response for old coordinates or a different radius is never displayed under a new request", () => {
  const response = liveResponse();
  assert.equal(selectNearbyPlace(response, demoOrigin).state, "ready");
  assert.deepEqual(selectNearbyPlace(response, { lat: demoOrigin.lat + 0.001, lng: demoOrigin.lng }),
    { state: "error", reason: "origin-mismatch" });
  response.radiusMeters = 3000;
  assert.deepEqual(selectNearbyPlace(response, demoOrigin), { state: "error", reason: "origin-mismatch" });
});

test("LIVE hides a response containing demo sources anywhere, including evidence and nonselected places", () => {
  const demoSource: DataSource = { kind: "DEMO_DATA", name: "예시", url: null };
  const contaminate: Array<(response: SearchResponse) => void> = [
    (response) => { response.recommendations[0]!.spot.source = demoSource; },
    (response) => { response.recommendations[0]!.spot.openingHours.source = demoSource; },
    (response) => { response.recommendations[0]!.spot.safety.lighting.source = demoSource; },
    (response) => { response.recommendations[0]!.facilities[0]!.source = demoSource; },
    (response) => { response.recommendations[0]!.weather.temperature.source = demoSource; },
    (response) => { response.recommendations.at(-1)!.statuses = [status("demo", "DEMO")]; },
    (response) => { response.statuses.push(status("demo", "DEMO")); },
  ];
  for (const change of contaminate) {
    const response = liveResponse();
    change(response);
    assert.deepEqual(selectNearbyPlace(response, null), { state: "error", reason: "mixed-demo" });
  }
});

test("failed or unconfigured adapters cannot masquerade as successful empty search or absent facilities", () => {
  const response = liveResponse();
  const place = response.recommendations[0]!;
  response.recommendations = [];
  assert.deepEqual(selectNearbyPlace(response, null), { state: "empty" });
  response.statuses = [status("tour", "ERROR")];
  assert.deepEqual(selectNearbyPlace(response, null), { state: "error", reason: "adapter-error" });
  response.statuses = [status("tour", "NOT_CONFIGURED")];
  assert.deepEqual(selectNearbyPlace(response, null), { state: "not-configured" });
  response.statuses = [];
  assert.deepEqual(selectNearbyPlace(response, null), { state: "error", reason: "unverified" });
  place.statuses = [status("medical", "ERROR")];
  assert.deepEqual(selectNearbyMedical(place), { state: "error" });
  place.statuses = [status("medical", "NOT_CONFIGURED")];
  assert.deepEqual(selectNearbyMedical(place), { state: "not-configured" });
  place.facilities = [];
  place.statuses = [status("medical", "OK")];
  assert.deepEqual(selectNearbyMedical(place), { state: "empty" });
  place.statuses = [];
  assert.deepEqual(selectNearbyMedical(place), { state: "unknown" });
});

test("unknown, verified absence and confirmed negative evidence retain different meanings", () => {
  const evidence: Evidence<boolean> = { status: "UNKNOWN", value: false, source: null, updatedAt: null };
  const label = (value: boolean) => value ? "운영시간 기준 이용 가능" : "운영시간 기준 이용 불가";
  assert.equal(nearbyEvidenceText(evidence, label), "미확인");
  assert.equal(nearbyEvidenceText({ ...evidence, status: "NOT_AVAILABLE", source }, label), "없음 확인");
  assert.equal(nearbyEvidenceText({ ...evidence, status: "CONFIRMED", source }, label), "운영시간 기준 이용 불가");
  assert.equal(nearbyEvidenceText({ ...evidence, status: "CONFIRMED", value: null, source }, label), "미확인");
});

test("cancelled, superseded and unmounted requests cannot apply late location or search callbacks", async () => {
  const gate = createLatestRequestGate();
  const applied: string[] = [];
  const pending = (value: string) => {
    const ticket = gate.next();
    let finish!: () => void;
    const done = new Promise<void>((resolve) => { finish = resolve; }).then(() => {
      if (gate.isCurrent(ticket)) applied.push(value);
    });
    return { finish, done };
  };
  const cancelledGps = pending("cancelled GPS");
  gate.invalidate();
  const staleSearch = pending("old origin");
  const latestSearch = pending("new origin");
  cancelledGps.finish();
  latestSearch.finish();
  staleSearch.finish();
  await Promise.all([cancelledGps.done, staleSearch.done, latestSearch.done]);
  assert.deepEqual(applied, ["new origin"]);
  const unmountedGps = pending("after close");
  gate.invalidate();
  unmountedGps.finish();
  await unmountedGps.done;
  assert.deepEqual(applied, ["new origin"]);
});
