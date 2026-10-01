import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMedical } from "./medicalApi.js";
import { normalizeStandard } from "./standardData.js";
import { safeAdapter } from "../services/recommendations.js";
import { demoOrigin } from "../mock/fixtures.js";
import { emptyWeather } from "../utils/data.js";

test("medical adapter preserves unknown hours, rejects empty coordinates and labels straight distance", () => {
  const results = normalizeMedical(
    [
      {
        dutyName: "응급기관",
        wgs84Lat: "37.5445",
        wgs84Lon: "127.0374",
        dutyTel1: "02-123-4567",
      },
      { dutyName: "잘못된 위치", wgs84Lat: "", wgs84Lon: "" },
    ],
    demoOrigin,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0]!.distanceMeters, 0);
  assert.equal(results[0]!.openingHours, null);
  assert.equal(results[0]!.distanceType, "STRAIGHT_LINE");
  assert.equal(results[0]!.source.kind, "PUBLIC_DATA");
});
test("standard facilities keep provider revision and unknown phone", () => {
  const results = normalizeStandard(
    [
      {
        trsmicNm: "안내소",
        latitude: "37.5445",
        longitude: "127.0374",
        referenceDate: "2026-09-01",
      },
    ],
    "TOURIST_INFO",
    demoOrigin,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0]!.updatedAt, "2026-09-01");
  assert.equal(results[0]!.phone, null);
  assert.equal(results[0]!.openingHours, null);
});
test("upstream failure reduces available facts without invented values", async () => {
  const result = await safeAdapter(
    "weather",
    "날씨",
    true,
    async () => {
      throw new Error("upstream");
    },
    emptyWeather(),
  );
  assert.equal(result.status.status, "ERROR");
  assert.equal(result.data.temperature.status, "UNKNOWN");
  assert.equal(result.data.temperature.value, null);
});
test("unconfigured adapter does not make any request", async () => {
  let called = false;
  const result = await safeAdapter(
    "medical",
    "의료",
    false,
    async () => {
      called = true;
      return [1];
    },
    [] as number[],
  );
  assert.equal(called, false);
  assert.equal(result.status.status, "NOT_CONFIGURED");
  assert.deepEqual(result.data, []);
});
