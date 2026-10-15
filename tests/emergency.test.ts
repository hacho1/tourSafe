import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEmergencyMessage,
  formatEmergencyLocation,
  isFreshEmergencyLocation,
  requestEmergencyLocation,
  type EmergencyLocation,
} from "../frontend/src/utils/emergency.js";

const NOW = Date.parse("2026-10-11T01:02:03Z");
const location = (changes: Partial<EmergencyLocation> = {}): EmergencyLocation => ({
  latitude: 35.123456, longitude: 129.987654, accuracy: 12.4, timestamp: NOW, ...changes,
});
const position = (changes: Partial<EmergencyLocation> = {}): GeolocationPosition => {
  const value = location(changes);
  return {
    coords: {
      latitude: value.latitude, longitude: value.longitude, accuracy: value.accuracy,
      altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}),
    },
    timestamp: value.timestamp,
    toJSON: () => ({}),
  };
};
const geoError = (code: number): GeolocationPositionError => ({
  code, message: "Untrusted browser detail", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
});

function fakeGeolocation() {
  let success!: PositionCallback;
  let failure: PositionErrorCallback | null | undefined;
  let options: PositionOptions | undefined;
  let requests = 0;
  const geo: Pick<Geolocation, "getCurrentPosition"> = {
    getCurrentPosition(onSuccess, onError, requestedOptions) {
      requests++;
      success = onSuccess;
      failure = onError;
      options = requestedOptions;
    },
  };
  return {
    geo, success: (value = position()) => success(value), failure: (code: number) => failure?.(geoError(code)),
    options: () => options, requests: () => requests,
  };
}

test("freshness accepts coordinate and time boundaries without accepting stale or future positions", () => {
  assert.equal(isFreshEmergencyLocation(location(), NOW), true);
  assert.equal(isFreshEmergencyLocation(location({ latitude: -90, longitude: -180, accuracy: 0 }), NOW), true);
  assert.equal(isFreshEmergencyLocation(location({ latitude: 90, longitude: 180, timestamp: NOW - 120_000 }), NOW), true);
  assert.equal(isFreshEmergencyLocation(location({ timestamp: NOW + 10_000 }), NOW), true);
  for (const invalid of [
    { latitude: -90.00001 }, { latitude: 90.00001 }, { latitude: NaN }, { latitude: Infinity },
    { longitude: -180.00001 }, { longitude: 180.00001 }, { longitude: NaN }, { longitude: Infinity },
    { accuracy: -1 }, { accuracy: NaN }, { accuracy: Infinity },
    { timestamp: 0 }, { timestamp: -1 }, { timestamp: NaN }, { timestamp: Infinity },
    { timestamp: NOW - 120_001 }, { timestamp: NOW + 10_001 },
  ]) assert.equal(isFreshEmergencyLocation(location(invalid), NOW), false, JSON.stringify(invalid));
  assert.equal(isFreshEmergencyLocation(location(), NaN), false);
});

test("location text includes rounded coordinates, approximate accuracy, and the capture clock", () => {
  assert.equal(formatEmergencyLocation(location()),
    "위도 35.12346, 경도 129.98765 · 정확도 약 13m · 확인 10:02:03");
});

test("message trims a manual landmark and includes only a fresh GPS reading", () => {
  assert.equal(buildEmergencyMessage("  빨간 안내판 앞  ", location(), NOW),
    `도움이 필요합니다.\n현재 위치/주변 표지: 빨간 안내판 앞\nGPS 위치: ${formatEmergencyLocation(location())}`);
  assert.equal(buildEmergencyMessage("  빨간 안내판 앞  ", location({ timestamp: NOW - 120_001 }), NOW),
    "도움이 필요합니다.\n현재 위치/주변 표지: 빨간 안내판 앞");
  assert.equal(buildEmergencyMessage("  빨간 안내판 앞  ", null, NOW),
    "도움이 필요합니다.\n현재 위치/주변 표지: 빨간 안내판 앞");
});

test("empty, invalid, or stale location has no invented coordinates or demo landmark", () => {
  const unconfirmed = "도움이 필요합니다.\n현재 위치는 아직 확인하지 못했습니다.";
  for (const gps of [null, location({ timestamp: NOW - 120_001 }), location({ latitude: 91 })]) {
    const message = buildEmergencyMessage(" \n\t ", gps, NOW);
    assert.equal(message, unconfirmed);
    assert.doesNotMatch(message, /GPS|위도|경도|35\.123|129\.987|광안리|해운대|DEMO/);
  }
  assert.match(buildEmergencyMessage("", location(), NOW), /GPS 위치:/);
});

test("one-shot request uses uncached high accuracy and returns the browser capture timestamp", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fake = fakeGeolocation();
  const accepted: EmergencyLocation[] = [];
  const errors: string[] = [];
  requestEmergencyLocation(fake.geo, value => accepted.push(value), message => errors.push(message), () => NOW);
  assert.equal(fake.requests(), 1);
  assert.deepEqual(fake.options(), { maximumAge: 0, timeout: 10_000, enableHighAccuracy: true });
  fake.success(position({ timestamp: NOW - 1_000 }));
  assert.deepEqual(accepted, [location({ timestamp: NOW - 1_000 })]);
  t.mock.timers.tick(20_000);
  assert.deepEqual(errors, []);
});

test("cancellation clears its watchdog and ignores late success and error callbacks", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const clear = t.mock.method(globalThis, "clearTimeout");
  const fake = fakeGeolocation();
  const accepted: EmergencyLocation[] = [];
  const errors: string[] = [];
  const cancel = requestEmergencyLocation(fake.geo, value => accepted.push(value), message => errors.push(message), () => NOW);
  cancel();
  cancel();
  fake.success();
  fake.failure(1);
  t.mock.timers.tick(20_000);
  assert.deepEqual(accepted, []);
  assert.deepEqual(errors, []);
  assert.equal(clear.mock.callCount(), 1);
});

test("successful completion clears its watchdog and ignores all duplicate callbacks", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const clear = t.mock.method(globalThis, "clearTimeout");
  const fake = fakeGeolocation();
  const accepted: EmergencyLocation[] = [];
  const errors: string[] = [];
  const cancel = requestEmergencyLocation(fake.geo, value => accepted.push(value), message => errors.push(message), () => NOW);
  fake.success();
  fake.success(position({ latitude: 30 }));
  fake.failure(2);
  cancel();
  t.mock.timers.tick(20_000);
  assert.deepEqual(accepted, [location()]);
  assert.deepEqual(errors, []);
  assert.equal(clear.mock.callCount(), 1);
});

test("stale, invalid, and future browser readings fail without later callbacks replacing the result", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const invalid of [
    { timestamp: NOW - 120_001 }, { timestamp: NOW + 10_001 }, { latitude: 91 },
    { longitude: -181 }, { accuracy: -1 }, { latitude: NaN },
  ]) {
    const fake = fakeGeolocation();
    const accepted: EmergencyLocation[] = [];
    const errors: string[] = [];
    requestEmergencyLocation(fake.geo, value => accepted.push(value), message => errors.push(message), () => NOW);
    fake.success(position(invalid));
    fake.success();
    fake.failure(1);
    t.mock.timers.tick(20_000);
    assert.deepEqual(accepted, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /최신 위치.*직접 입력/);
  }
});

test("freshness is checked when the reading arrives, using the supplied clock", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fake = fakeGeolocation();
  let now = NOW;
  const errors: string[] = [];
  requestEmergencyLocation(fake.geo, () => assert.fail("A stale reading must not be accepted"),
    message => errors.push(message), () => now);
  now += 120_001;
  fake.success();
  assert.equal(errors.length, 1);
});

test("permission, unavailable, timeout, and unknown browser failures offer manual fallback once", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const [code, expected] of [[1, /권한/], [2, /확인하지 못/], [3, /시간이 초과/], [99, /확인하지 못/]] as const) {
    const fake = fakeGeolocation();
    const errors: string[] = [];
    requestEmergencyLocation(fake.geo, () => assert.fail("An error must finish the request"),
      message => errors.push(message), () => NOW);
    fake.failure(code);
    fake.failure(code);
    fake.success();
    t.mock.timers.tick(20_000);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, expected);
    assert.match(errors[0]!, /주소나 주변 표지를 직접 입력/);
    assert.doesNotMatch(errors[0]!, /Untrusted browser detail/);
  }
});

test("a browser that leaves its permission prompt pending is bounded by the watchdog", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fake = fakeGeolocation();
  const errors: string[] = [];
  requestEmergencyLocation(fake.geo, () => assert.fail("A timed-out request must stay finished"),
    message => errors.push(message), () => NOW);
  t.mock.timers.tick(10_999);
  assert.deepEqual(errors, []);
  t.mock.timers.tick(1);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /시간이 초과.*직접 입력/);
  fake.success();
  fake.failure(3);
  assert.equal(errors.length, 1);
});

test("unsupported geolocation and synchronous browser exceptions are actionable and cancellable", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const geo of [undefined, { getCurrentPosition() { throw new Error("Browser unavailable"); } }]) {
    const errors: string[] = [];
    const cancel = requestEmergencyLocation(geo, () => assert.fail("No position is available"),
      message => errors.push(message), () => NOW);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /주소나 주변 표지를 직접 입력/);
    cancel();
    t.mock.timers.tick(20_000);
    assert.equal(errors.length, 1);
  }
});

test("synchronous browser success settles normally and clears the watchdog", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const accepted: EmergencyLocation[] = [];
  const errors: string[] = [];
  const cancel = requestEmergencyLocation({ getCurrentPosition(success) { success(position()); } },
    value => accepted.push(value), message => errors.push(message), () => NOW);
  cancel();
  t.mock.timers.tick(20_000);
  assert.deepEqual(accepted, [location()]);
  assert.deepEqual(errors, []);
});
