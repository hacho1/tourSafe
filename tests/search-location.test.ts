import { test } from "node:test";
import assert from "node:assert/strict";
import type { Region } from "../shared/models.js";
import {
  createSearchLocationController,
  isFreshSearchLocation,
  searchLocationRegion,
  type SearchLocation,
} from "../frontend/src/utils/searchLocation.js";

const NOW = Date.parse("2026-10-11T01:02:03Z");
const location = (changes: Partial<SearchLocation> = {}): SearchLocation => ({
  latitude: 35.123456, longitude: 129.123456, accuracy: 12.4, timestamp: NOW, ...changes,
});
const position = (changes: Partial<SearchLocation> = {}): GeolocationPosition => {
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
const manualRegion: Region = { name: "직접 선택한 장소", address: "직접 검색한 주소", lat: 37.5, lng: 127 };

function fakeGeolocation() {
  const requests: {
    success: PositionCallback;
    error: PositionErrorCallback | null | undefined;
    options: PositionOptions | undefined;
  }[] = [];
  const geo: Pick<Geolocation, "getCurrentPosition"> = {
    getCurrentPosition(success, error, options) { requests.push({ success, error, options }); },
  };
  return {
    geo, requests,
    success: (index = 0, changes: Partial<SearchLocation> = {}) => requests[index]!.success(position(changes)),
    failure: (index = 0, code = 1) => requests[index]!.error?.({
      code, message: "Untrusted browser details", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
    }),
  };
}

test("GPS readings require finite Korea coordinates, accuracy, and a recent capture time", () => {
  assert.equal(isFreshSearchLocation(location(), NOW), true);
  assert.equal(isFreshSearchLocation(location({ latitude: 33, longitude: 124, accuracy: 0, timestamp: NOW - 60_000 }), NOW), true);
  assert.equal(isFreshSearchLocation(location({ latitude: 39.5, longitude: 132, timestamp: NOW + 10_000 }), NOW), true);
  for (const invalid of [
    { latitude: NaN }, { latitude: Infinity }, { latitude: 32.99999 }, { latitude: 39.50001 },
    { longitude: NaN }, { longitude: Infinity }, { longitude: 123.99999 }, { longitude: 132.00001 },
    { accuracy: NaN }, { accuracy: Infinity }, { accuracy: -1 },
    { timestamp: 0 }, { timestamp: -1 }, { timestamp: NaN }, { timestamp: Infinity },
    { timestamp: NOW - 60_001 }, { timestamp: NOW + 10_001 },
  ]) assert.equal(isFreshSearchLocation(location(invalid), NOW), false, JSON.stringify(invalid));
  assert.equal(isFreshSearchLocation(location(), NaN), false);
});

test("successful GPS selection carries the captured KST date and time instead of claiming a live position", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fake = fakeGeolocation();
  const accepted: Region[] = [];
  const errors: string[] = [];
  const controller = createSearchLocationController(() => NOW);
  controller.request(fake.geo, value => accepted.push(value), message => errors.push(message));
  assert.deepEqual(fake.requests[0]!.options, { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 });
  fake.success(0, { timestamp: NOW - 1_000 });
  assert.deepEqual(accepted, [searchLocationRegion(location({ timestamp: NOW - 1_000 }))]);
  assert.equal(accepted[0]!.name, "마지막 확인 위치");
  assert.match(accepted[0]!.address!, /2026.*10.*11.*10:02:02.*KST.*13m/);
  fake.success(0, { latitude: 38 });
  fake.failure();
  t.mock.timers.tick(20_000);
  assert.equal(accepted.length, 1);
  assert.deepEqual(errors, []);
});

test("manual selection during GPS keeps the chosen region despite late success, failure, and timeout", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fake = fakeGeolocation();
  const errors: string[] = [];
  const controller = createSearchLocationController(() => NOW);
  let selected: Region | null = null;
  controller.request(fake.geo, value => { selected = value; }, message => errors.push(message));
  controller.cancel();
  selected = manualRegion;
  fake.success();
  fake.failure();
  t.mock.timers.tick(20_000);
  assert.equal(selected, manualRegion);
  assert.deepEqual(errors, []);
});

test("cancelling a dismissed screen is idempotent and clears its watchdog", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const clear = t.mock.method(globalThis, "clearTimeout");
  const fake = fakeGeolocation();
  const controller = createSearchLocationController(() => NOW);
  controller.request(fake.geo, () => assert.fail("Dismissed UI must not receive a position"),
    () => assert.fail("Dismissed UI must not receive an error"));
  controller.cancel();
  controller.cancel();
  fake.success();
  fake.failure();
  t.mock.timers.tick(20_000);
  assert.equal(clear.mock.callCount(), 1);
});

test("a newer request supersedes the first even if old callbacks and an old cancel handle arrive later", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fake = fakeGeolocation();
  const controller = createSearchLocationController(() => NOW);
  const accepted: Region[] = [];
  const errors: string[] = [];
  const oldCancel = controller.request(fake.geo, value => accepted.push(value), message => errors.push(message));
  controller.request(fake.geo, value => accepted.push(value), message => errors.push(message));
  fake.success(0);
  fake.failure(0);
  oldCancel();
  assert.deepEqual(accepted, []);
  fake.success(1, { latitude: 37 });
  fake.success(0);
  t.mock.timers.tick(20_000);
  assert.deepEqual(accepted, [searchLocationRegion(location({ latitude: 37 }))]);
  assert.deepEqual(errors, []);
});

test("invalid or stale GPS never overwrites an existing manually selected region", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const invalid of [
    { latitude: NaN }, { longitude: Infinity }, { accuracy: -1 }, { accuracy: NaN },
    { latitude: 40 }, { longitude: 133 }, { timestamp: NOW - 60_001 }, { timestamp: NOW + 10_001 },
  ]) {
    const fake = fakeGeolocation();
    const controller = createSearchLocationController(() => NOW);
    let selected = manualRegion;
    const errors: string[] = [];
    controller.request(fake.geo, value => { selected = value; }, message => errors.push(message));
    fake.success(0, invalid);
    fake.success();
    fake.failure();
    t.mock.timers.tick(20_000);
    assert.equal(selected, manualRegion);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /최신 대한민국 위치.*직접 검색/);
  }
});

test("freshness is evaluated on callback arrival rather than request start", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let now = NOW;
  const fake = fakeGeolocation();
  const errors: string[] = [];
  createSearchLocationController(() => now).request(fake.geo,
    () => assert.fail("Expired reading must not be selected"), message => errors.push(message));
  now += 60_001;
  fake.success();
  assert.equal(errors.length, 1);
});

test("unanswered permission prompts time out independently and cannot subsequently select a position", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fake = fakeGeolocation();
  const errors: string[] = [];
  createSearchLocationController(() => NOW).request(fake.geo,
    () => assert.fail("Timed-out position must not be selected"), message => errors.push(message));
  t.mock.timers.tick(10_999);
  assert.deepEqual(errors, []);
  t.mock.timers.tick(1);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /시간이 초과.*직접 검색/);
  fake.success();
  fake.failure();
  assert.equal(errors.length, 1);
});

test("browser failures preserve manual selection and allow a subsequent request", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const [code, expected] of [[1, /권한/], [2, /찾지 못/], [3, /시간이 초과/], [99, /찾지 못/]] as const) {
    const fake = fakeGeolocation();
    const controller = createSearchLocationController(() => NOW);
    const errors: string[] = [];
    let selected = manualRegion;
    controller.request(fake.geo, value => { selected = value; }, message => errors.push(message));
    fake.failure(0, code);
    fake.success();
    assert.equal(selected, manualRegion);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, expected);
    assert.match(errors[0]!, /직접 검색/);
    assert.doesNotMatch(errors[0]!, /Untrusted/);
    controller.request(fake.geo, value => { selected = value; }, message => errors.push(message));
    fake.success(1);
    t.mock.timers.tick(20_000);
    assert.deepEqual(selected, searchLocationRegion(location()));
    assert.equal(errors.length, 1);
  }
});

test("unsupported and synchronously failing browsers settle once without blocking the next request", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const geo of [undefined, { getCurrentPosition() { throw new Error("Browser unavailable"); } }]) {
    const controller = createSearchLocationController(() => NOW);
    const errors: string[] = [];
    const cancelFailed = controller.request(geo, () => assert.fail("No position available"), message => errors.push(message));
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /직접 검색/);
    const fake = fakeGeolocation();
    const accepted: Region[] = [];
    controller.request(fake.geo, value => accepted.push(value), message => errors.push(message));
    cancelFailed();
    fake.success();
    controller.cancel();
    t.mock.timers.tick(20_000);
    assert.equal(errors.length, 1);
    assert.deepEqual(accepted, [searchLocationRegion(location())]);
  }
});

test("synchronous success does not leave an active watchdog or a stale cancellation handle", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = createSearchLocationController(() => NOW);
  const accepted: Region[] = [];
  const errors: string[] = [];
  const oldCancel = controller.request({ getCurrentPosition(success) { success(position()); } },
    value => accepted.push(value), message => errors.push(message));
  const fake = fakeGeolocation();
  controller.request(fake.geo, value => accepted.push(value), message => errors.push(message));
  oldCancel();
  fake.success(0, { latitude: 38 });
  t.mock.timers.tick(20_000);
  assert.deepEqual(accepted, [searchLocationRegion(location()), searchLocationRegion(location({ latitude: 38 }))]);
  assert.deepEqual(errors, []);
});

test('a 25 km GPS uncertainty offers manual location without replacing the chosen point', () => {
  const fake=fakeGeolocation(); const accepted:Region[]=[]; const errors:string[]=[];
  createSearchLocationController(()=>NOW).request(fake.geo, value=>accepted.push(value), message=>errors.push(message));
  fake.success(0,{accuracy:25000});
  assert.equal(accepted.length,0); assert.match(errors[0]!,/25km.*직접 검색/);
});
