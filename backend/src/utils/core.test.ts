import assert from "node:assert/strict";
import test from "node:test";
import { calculateScore } from "./scoring.js";
import {
  confirmed,
  emptySafety,
  emptyWeather,
  unavailable,
  unknown,
} from "./data.js";
import { haversine, toWeatherGrid } from "./geo.js";
import { buildUrl, publicItems } from "./http.js";
import { demoOrigin, demoRecommendations } from "../mock/fixtures.js";
import { demoSource } from "../mock/mockSafetyData.js";
import { parseOpenNow } from "../adapters/tourApi.js";
import { weatherBaseTime } from "../adapters/weatherApi.js";
import { recommendationOrder } from "../../../shared/order.js";

const baseSpot = () => ({
  ...demoRecommendations({ ...demoOrigin, radius: 3000, withKids: true })[0]!
    .spot,
  openingHours: unknown<string>(),
  holidays: unknown<string>(),
  openNow: unknown<boolean>(),
  closure: unknown<boolean>(),
  safety: emptySafety(),
});
test("all unknown produces no numerical score and zero coverage", () => {
  const s = calculateScore(baseSpot(), [], emptyWeather());
  assert.equal(s.total, null);
  assert.equal(s.coverage, 0);
  assert.equal(s.grade, "UNKNOWN");
});
test("missing facts are excluded, not counted as failures", () => {
  const spot = baseSpot();
  spot.safety.toilet = confirmed(true, demoSource);
  let s = calculateScore(spot, [], emptyWeather());
  assert.equal(s.total, 100);
  assert.equal(s.coverage, 2);
  assert.equal(s.confidence, "LOW");
  spot.safety.nursingRoom = unavailable(demoSource);
  s = calculateScore(spot, [], emptyWeather());
  assert.equal(s.total, 50);
  assert.equal(s.coverage, 4);
});
test("closure and severe alerts override even a perfect score", () => {
  const spot = baseSpot();
  spot.safety.toilet = confirmed(true, demoSource);
  spot.closure = confirmed(true, demoSource);
  const w = emptyWeather();
  w.severeAlert = confirmed(true, demoSource);
  const s = calculateScore(spot, [], w);
  assert.equal(s.total, 100);
  assert.equal(s.grade, "HOLD");
  assert.equal(s.hardFilter.length, 2);
});
test("confirmed closed hours prevent a recommendation", () => {
  const spot = baseSpot();
  spot.openNow = confirmed(false, demoSource);
  const s = calculateScore(spot, [], emptyWeather());
  assert.equal(s.grade, "HOLD");
  assert.equal(s.coverage, 12);
});
test("demo respects radius and does not relocate fixtures to arbitrary cities", () => {
  assert.ok(
    demoRecommendations({ ...demoOrigin, radius: 1000, withKids: true })
      .length <
      demoRecommendations({ ...demoOrigin, radius: 3000, withKids: true })
        .length,
  );
  assert.equal(
    demoRecommendations({
      lat: 35.1631,
      lng: 129.1636,
      radius: 10000,
      withKids: true,
    }).length,
    0,
  );
});
test("recommendation order puts sparse evidence after sufficiently documented candidates", () => {
  const rows = demoRecommendations({
    ...demoOrigin,
    radius: 3000,
    withKids: true,
  }).sort(recommendationOrder);
  assert.equal(rows.at(-1)!.spot.id, "demo-garden");
  assert.equal(rows[0]!.spot.id, "demo-park");
});
test("geodesic distance and KMA Seoul grid", () => {
  assert.equal(haversine(demoOrigin, demoOrigin), 0);
  assert.ok(
    Math.abs(haversine({ lat: 37, lng: 127 }, { lat: 38, lng: 127 }) - 111195) <
      2,
  );
  assert.deepEqual(toWeatherGrid({ lat: 37.5665, lng: 126.978 }), {
    nx: 60,
    ny: 127,
  });
});
test("KST weather base crosses the date boundary correctly", () => {
  assert.deepEqual(weatherBaseTime(new Date("2026-09-30T15:10:00Z")), {
    date: "20260930",
    hour: "2300",
  });
  assert.deepEqual(weatherBaseTime(new Date("2026-09-30T15:40:00Z")), {
    date: "20261001",
    hour: "0000",
  });
});
test("unambiguous schedules only; holiday exceptions stay unknown", () => {
  const now = new Date("2026-10-01T05:00:00Z");
  assert.equal(parseOpenNow("09:00–18:00", "연중무휴", null, now).value, true);
  assert.equal(
    parseOpenNow("09:00–18:00", "월요일 휴무", null, now).status,
    "UNKNOWN",
  );
  assert.equal(parseOpenNow("09:00–18:00", null, null, now).status, "UNKNOWN");
  assert.equal(
    parseOpenNow(
      "09:00–18:00",
      "연중무휴",
      null,
      new Date("2026-10-01T09:00:00Z"),
    ).value,
    false,
  );
  assert.equal(
    parseOpenNow("99:00–99:00", "연중무휴", null, now).status,
    "UNKNOWN",
  );
});
test("service key is encoded exactly once and API response shapes are checked", () => {
  assert.equal(
    new URL(
      buildUrl("https://example.org/", { serviceKey: "a%2Bb%3D" }),
    ).searchParams.get("serviceKey"),
    "a+b=",
  );
  assert.equal(
    publicItems({ response: { body: { items: { item: { id: "1" } } } } })[0]!
      .id,
    "1",
  );
  assert.deepEqual(
    publicItems({ response: { body: { items: "", totalCount: 0 } } }),
    [],
  );
  assert.throws(() => publicItems({ unexpected: [] }));
});
