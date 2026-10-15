import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { HOSPITAL_REGIONS } from "../shared/hospitals.js";
import {
  getHospitalDetail,
  getHospitalList,
  normalizeHospitalDepartments,
  normalizeHospitalDetail,
  normalizeHospitalHours,
  normalizeHospitalList,
  parseHospitalTime,
  type HospitalFetch,
} from "../backend/src/adapters/hospitalApi.js";
import { createHospitalService } from "../backend/src/services/hospitals.js";

const region = HOSPITAL_REGIONS[0];
const now = () => new Date("2026-10-11T02:00:00Z");
function row(id: string, offset = 0): Record<string, unknown> {
  return {
    hpid: id, dutyName: `검증 병원 ${id}`, dutyAddr: "검증용 주소",
    wgs84Lat: String(region.lat + offset), wgs84Lon: String(region.lng),
    dutyTel1: "", dutyTime1s: "0900", dutyTime1c: "1800",
  };
}
function body(rows: Record<string, unknown>[], total: number | string | undefined = rows.length) {
  return { response: { body: { items: { item: rows }, totalCount: total } } };
}
function service(fetch: HospitalFetch, key = "test-key", useMock = true) {
  return createHospitalService({ getConfig: () => ({ hospitalKey: key, useMock }), fetch, now });
}

test("hospital HHmm parsing preserves midnight and accepts 2400 only as closing", () => {
  assert.equal(parseHospitalTime("0000"), 0);
  assert.equal(parseHospitalTime(0), 0);
  assert.equal(parseHospitalTime(900), 540);
  assert.equal(parseHospitalTime("2400"), null);
  assert.equal(parseHospitalTime("2400", true), 1440);
  for (const value of [null, undefined, "", "0900-1800", "24:00", "2360", "2500", "2401", -1, NaN]) {
    assert.equal(parseHospitalTime(value, true), null);
  }
});

test("missing or invalid hour pairs remain unknown, never closed or inferred 24-hour service", () => {
  const hours = normalizeHospitalHours({
    dutyTime1s: "0000", dutyTime1c: "0000",
    dutyTime2s: "0900", dutyTime2c: "0900",
    dutyTime3s: "0900",
    dutyTime4s: "2500", dutyTime4c: "1800",
    dutyTime5s: "0000", dutyTime5c: "0600",
    dutyTime6s: "2300", dutyTime6c: "0000",
    dutyTime7s: "0900", dutyTime7c: "2400",
    dutyTime8s: "2200", dutyTime8c: "0200",
  });
  assert.equal(hours.length, 8);
  for (const item of hours.slice(0, 4)) {
    assert.equal(item.opens, null);
    assert.equal(item.closes, null);
    assert.equal(item.overnight, false);
  }
  assert.deepEqual(hours[4], { day: 5, opens: 0, closes: 360, overnight: false });
  assert.deepEqual(hours[5], { day: 6, opens: 1380, closes: 0, overnight: true });
  assert.deepEqual(hours[6], { day: 7, opens: 540, closes: 1440, overnight: false });
  assert.deepEqual(hours[7], { day: 8, opens: 1320, closes: 120, overnight: true });
});

test("departments use only listed names and supported separators with placeholders removed", () => {
  assert.deepEqual(normalizeHospitalDepartments(" 내과, 소아청소년과 | 내과 / 이비인후과 / N/A, 미상, - "),
    ["내과", "소아청소년과", "이비인후과"]);
  for (const value of [null, undefined, "", "N/A", "정보 없음", 0]) {
    assert.deepEqual(normalizeHospitalDepartments(value), []);
  }
  assert.deepEqual(normalizeHospitalDepartments("내과 소아청소년과"), ["내과 소아청소년과"]);
});

test("list normalization rejects invalid coordinates or identity, deduplicates HPID and sorts by fixed origin", () => {
  const rows = [row("far", 0.02), row("near", 0.001), row("near", 0.002),
    { ...row("bad-lat"), wgs84Lat: "0" },
    { ...row("bad-lng"), wgs84Lon: "999" },
    { ...row("not-numeric"), wgs84Lat: "NaN" },
    { ...row("empty-name"), dutyName: " " },
    { ...row("missing-id"), hpid: "" },
    { ...row("invalid-first"), wgs84Lat: "" }, row("invalid-first", 0.003)];
  const result = normalizeHospitalList(rows, region);
  assert.deepEqual(result.map((item) => item.id), ["near", "invalid-first", "far"]);
  assert.ok(result[0]!.distanceMeters < result[2]!.distanceMeters);
  assert.equal(result[0]!.phone, null);
  assert.equal(result[0]!.updatedAt, null);
  assert.equal(result[0]!.detailStatus, "UNAVAILABLE");
  assert.ok(result[0]!.hours.every((hours) => hours.opens === null && hours.closes === null));
});

test("detail normalization requires matching HPID and the documented dgidIdName field", () => {
  const hospital = normalizeHospitalList([row("A")], region)[0]!;
  assert.throws(() => normalizeHospitalDetail({ hpid: "B" }, hospital), /ID_MISMATCH/);
  assert.throws(() => normalizeHospitalDetail({}, hospital), /ID_MISMATCH/);
  const detail = normalizeHospitalDetail({ ...row("A"), dgidIdName: "내과,소아청소년과" }, hospital);
  assert.deepEqual(detail.departments, ["내과", "소아청소년과"]);
  assert.equal(detail.detailStatus, "OK");
  assert.equal(detail.updatedAt, null);
  const unknown = normalizeHospitalDetail({ hpid: "A", dutyName: "소아청소년과 의원", dgIdName: "소아청소년과" }, hospital);
  assert.deepEqual(unknown.departments, []);
  assert.ok(unknown.hours.every((item) => item.opens === null));
});

test("list requests official region parameters, ten-minute cache and no more than 300 rows", async () => {
  const calls: Array<{ url: URL; ttl: number | undefined }> = [];
  const fetch: HospitalFetch = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, ttl: options?.ttl });
    const page = Number(parsed.searchParams.get("pageNo"));
    return body(Array.from({ length: 100 }, (_, index) => row(`H${page}-${index}`, (page * 100 + index) / 100_000)), 350);
  };
  const result = await getHospitalList(region, "test-key", fetch);
  assert.equal(calls.length, 3);
  assert.equal(result.hospitals.length, 300);
  assert.equal(result.partial, true);
  for (const call of calls) {
    assert.equal(call.url.pathname, "/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire");
    assert.equal(call.url.searchParams.get("Q0"), region.province);
    assert.equal(call.url.searchParams.get("Q1"), region.district);
    assert.equal(call.url.searchParams.get("numOfRows"), "100");
    assert.equal(call.ttl, 600_000);
  }
});

test("unknown totals, dropped invalid rows and duplicate pagination are marked partial", async () => {
  const missingTotal = await getHospitalList(region, "key", async () => ({ response: { body: { items: { item: [row("A")] } } } }));
  assert.equal(missingTotal.partial, true);
  await assert.rejects(getHospitalList(region, "key", async () => body([{ ...row("A"), wgs84Lat: "0" }], 1)), /LIST_UNUSABLE/);
  const partlyInvalid = await getHospitalList(region, "key", async () => body([row("A"), { ...row("B"), wgs84Lat: "0" }], 2));
  assert.equal(partlyInvalid.hospitals.length, 1);
  assert.equal(partlyInvalid.partial, true);
  const duplicated = await getHospitalList(region, "key", async () => body([row("A"), row("A")], 2));
  assert.equal(duplicated.hospitals.length, 1);
  assert.equal(duplicated.partial, true);
  const complete = await getHospitalList(region, "key", async () => body([row("A"), row("B")], 2));
  assert.equal(complete.partial, false);
  const empty = await getHospitalList(region, "key", async () => body([], 0));
  assert.deepEqual(empty, { hospitals: [], partial: false });
});

test("detail requests HPID and sixty-minute cache; empty and unrelated records fail", async () => {
  const hospital = normalizeHospitalList([row("A")], region)[0]!;
  let urlSeen = "";
  let ttlSeen: number | undefined;
  const detail = await getHospitalDetail(hospital, "key", async (url, options) => {
    urlSeen = url;
    ttlSeen = options?.ttl;
    return body([{ ...row("A"), dgidIdName: "내과" }]);
  });
  assert.deepEqual(detail.departments, ["내과"]);
  const parsed = new URL(urlSeen);
  assert.equal(parsed.pathname, "/B552657/HsptlAsembySearchService/getHsptlBassInfoInqire");
  assert.equal(parsed.searchParams.get("HPID"), "A");
  assert.equal(parsed.searchParams.get("pageNo"), "1");
  assert.equal(parsed.searchParams.get("numOfRows"), "1");
  assert.equal(ttlSeen, 3_600_000);
  await assert.rejects(getHospitalDetail(hospital, "key", async () => body([])), /UNAVAILABLE/);
  await assert.rejects(getHospitalDetail(hospital, "key", async () => body([row("B")])), /ID_MISMATCH/);
});

test("demo is fictional Seongsu only; unconfigured live data does not appear as an empty success", async () => {
  const neverFetch: HospitalFetch = async () => { throw new Error("Unexpected request"); };
  const demo = await service(neverFetch, "", true)("seongsu");
  assert.equal(demo.mode, "DEMO");
  assert.equal(demo.hospitals.length, 4);
  assert.ok(demo.hospitals.every((item) => item.name.startsWith("예시 ") && item.phone === null && item.source.kind === "DEMO_DATA"));
  assert.ok(demo.hospitals.some((item) => item.departments.length === 0));
  assert.ok(demo.hospitals.some((item) => item.hours.every((hours) => hours.opens === null)));
  const outside = await service(neverFetch, "", true)("jeju");
  assert.equal(outside.regionId, "jeju");
  assert.equal(outside.mode, "DEMO");
  assert.deepEqual(outside.hospitals, []);
  assert.match(outside.message, /성수 예시만/);
  const unconfigured = await service(neverFetch, "", false)("seongsu");
  assert.equal(unconfigured.mode, "LIVE");
  assert.equal(unconfigured.status, "NOT_CONFIGURED");
  assert.deepEqual(unconfigured.hospitals, []);
});

test("list failure propagates but total detail failure keeps basic contact and coordinates", async () => {
  await assert.rejects(service(async () => { throw new Error("UPSTREAM_FAILED"); })("seongsu"), /UPSTREAM_FAILED/);
  const result = await service(async (url) => {
    if (url.includes("getHsptlMdcncListInfoInqire")) return body([row("A"), row("B")].map(item => ({ ...item, dutyTel1: '02-123-4567' })));
    return body([row("unrelated")]);
  })("seongsu");
  assert.equal(result.status, 'OK');
  assert.equal(result.partial, true);
  assert.equal(result.detailFailures, 2);
  assert.deepEqual(result.hospitals.map(item => item.id), ['A', 'B']);
  assert.ok(result.hospitals.every(item => item.detailStatus === 'ERROR' && item.phone && Number.isFinite(item.lat)));
  assert.ok(result.hospitals.every(item => item.departments.length === 0 && item.hours.every(hour => hour.opens === null)));
});

test("partial detail failure preserves list identity but never borrows another hospital's hours", async () => {
  const result = await service(async (url) => {
    if (url.includes("getHsptlMdcncListInfoInqire")) return body([row("A"), row("B", 0.001)]);
    const id = new URL(url).searchParams.get("HPID")!;
    return body([{ ...row(id === "B" ? "wrong" : id), dgidIdName: "내과" }]);
  })("seongsu");
  assert.equal(result.mode, "LIVE");
  assert.equal(result.partial, true);
  assert.equal(result.detailFailures, 1);
  assert.equal(result.hospitals[0]!.detailStatus, "OK");
  assert.equal(result.hospitals[1]!.id, "B");
  assert.equal(result.hospitals[1]!.detailStatus, "ERROR");
  assert.deepEqual(result.hospitals[1]!.departments, []);
  assert.ok(result.hospitals[1]!.hours.every((item) => item.opens === null && item.closes === null));
  assert.match(result.message, /1곳의 상세 조회에 실패/);
});

test("only nearest twelve get detail enrichment, at most four at a time, preserving sorted output", async () => {
  let running = 0;
  let peak = 0;
  const requested: string[] = [];
  const result = await service(async (url) => {
    if (url.includes("getHsptlMdcncListInfoInqire")) {
      return body(Array.from({ length: 15 }, (_, index) => row(`H${index}`, index / 1000)).reverse());
    }
    const id = new URL(url).searchParams.get("HPID")!;
    requested.push(id);
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 2));
    running -= 1;
    return body([{ ...row(id), dgidIdName: "내과" }]);
  })("seongsu");
  assert.equal(peak, 4);
  assert.equal(requested.length, 12);
  assert.deepEqual(result.hospitals.map((item) => item.id), Array.from({ length: 12 }, (_, index) => `H${index}`));
  assert.equal(result.partial, true);
  assert.equal(result.detailFailures, 0);
  assert.equal(result.fetchedAt, now().toISOString());
});

test("successful empty and wholly unusable lists remain distinguishable without requesting details", async () => {
  const empty = await service(async () => body([], 0))("jongno");
  assert.equal(empty.mode, "LIVE");
  assert.equal(empty.status, "OK");
  assert.equal(empty.partial, false);
  assert.deepEqual(empty.hospitals, []);
  assert.equal(empty.originName, HOSPITAL_REGIONS[1].originName);
  await assert.rejects(service(async () => body([{ ...row("A"), wgs84Lat: "0" }], 1))("seongsu"), /LIST_UNUSABLE/);
});

test("semantic detail failures evict successful HTTP cache entries so retry fetches upstream again", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const invalidBodies: unknown[] = [
      { items: { item: [] }, totalCount: 0 },
      { items: { item: [row("unrelated-id")] }, totalCount: 1 },
      null,
      { totalCount: 1 },
    ];
    for (const invalidBody of invalidBodies) {
      const id = `retry-detail-${randomUUID()}`;
      const hospital = normalizeHospitalList([row(id)], region)[0]!;
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return Response.json({ response: {
          header: { resultCode: "00" },
          body: calls === 1 ? invalidBody : body([{ ...row(id), dgidIdName: "내과 / N/A" }]).response.body,
        } });
      };
      await assert.rejects(getHospitalDetail(hospital, "cache-test-key"));
      const result = await getHospitalDetail(hospital, "cache-test-key");
      assert.deepEqual(result.departments, ["내과"]);
      assert.equal(result.detailStatus, "OK");
      assert.equal(calls, 2);
      await getHospitalDetail(hospital, "cache-test-key");
      assert.equal(calls, 2, "validated detail responses should remain cached");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("malformed or wholly unusable list responses are not retained in the HTTP cache", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const invalidBodies: unknown[] = [
      null,
      { totalCount: 1 },
      { items: { item: [{ ...row("invalid"), wgs84Lat: "0" }] }, totalCount: 1 },
    ];
    for (const invalidBody of invalidBodies) {
      const id = `retry-list-${randomUUID()}`;
      const key = `cache-test-${id}`;
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return Response.json({ response: {
          header: { resultCode: "00" },
          body: calls === 1 ? invalidBody : body([row(id)]).response.body,
        } });
      };
      await assert.rejects(getHospitalList(region, key));
      const result = await getHospitalList(region, key);
      assert.equal(result.hospitals[0]?.id, id);
      assert.equal(result.partial, false);
      assert.equal(calls, 2);
      await getHospitalList(region, key);
      assert.equal(calls, 2, "validated list responses should remain cached");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
