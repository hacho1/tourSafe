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


test('provider outage suppresses ranking without counting unknown evidence as zero', () => {
  const item = demoRecommendations({ ...demoOrigin, radius: 3000, withKids: true })[0]!;
  const score = calculateScore(item.spot, item.facilities.filter(f => f.type !== 'MEDICAL'), item.weather, [{ key:'medical', name:'의료', status:'ERROR', message:'조회 실패' }]);
  assert.equal(score.total, null);
  assert.equal(score.confidence, 'LOW');
  assert.ok(!['PRIORITY','RECOMMENDED'].includes(score.grade));
  assert.ok(score.components.find(c => c.key === 'medical')?.earnedPoints == null);
});

import { currentRecommendation, RECOMMENDATION_TTL } from '../../../frontend/src/utils/recommendationFreshness.js';
test('a stale open detail never keeps a current operating assertion or a high score', () => {
  const base = demoRecommendations({ ...demoOrigin, radius: 3000, withKids: true })[0]!;
  const checkedAt='2026-10-13T01:00:00Z'; const now=Date.parse(checkedAt);
  const item={...base,checkedAt,spot:{...base.spot,source:{...base.spot.source,kind:'PUBLIC_DATA' as const}}};
  assert.equal(currentRecommendation(item,now),item);
  const expired=currentRecommendation(item,now+RECOMMENDATION_TTL);
  assert.equal(expired.spot.openNow.value,null); assert.equal(expired.score.total,null);
  assert.notEqual(expired,item); assert.equal(item.checkedAt,checkedAt);
});
test('unconfirmed operation does not receive a priority recommendation for a live place', () => {
  const base = demoRecommendations({ ...demoOrigin, radius:3000,withKids:true })[0]!;
  const spot={...base.spot,source:{...base.spot.source,kind:'PUBLIC_DATA' as const},openNow:unknown<boolean>()};
  assert.equal(calculateScore(spot,base.facilities,base.weather).grade,'CHECK');
});
