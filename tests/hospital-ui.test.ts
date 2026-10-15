import { test } from "node:test";
import assert from "node:assert/strict";
import { HOSPITAL_REGIONS, type Hospital, type HospitalResponse } from "../shared/hospitals.js";
import {
  ALL_DEPARTMENTS, UNKNOWN_DEPARTMENT, currentHospitalDay, departmentOptions, filterHospitals,
  hospitalContactLinks, hospitalHoursLabel, hospitalResponseIssue, hospitalTimestamp,
  resolveHospitalDepartment,
} from "../frontend/src/utils/hospital.js";

function hospital(overrides: Partial<Hospital> = {}): Hospital {
  return {
    id: "test-hospital", name: "검증용 병원", address: "서울 성동구 검증 주소", phone: "02-123-4567",
    departments: ["소아청소년과", "내과"], hours: [], lat: 37.5445, lng: 127.0374,
    distanceMeters: 200, source: { kind: "PUBLIC_DATA", name: "검증용 공공자료", url: null },
    updatedAt: null, detailStatus: "OK", ...overrides,
  };
}

function response(): HospitalResponse {
  const region = HOSPITAL_REGIONS[0];
  return {
    mode: "LIVE", status: "OK", regionId: region.id, origin: { lat: region.lat, lng: region.lng },
    originName: region.originName, fetchedAt: "2026-10-11T04:00:00Z",
    hospitals: [hospital()], partial: false, detailFailures: 0, message: "",
  };
}

test("missing, partial, invalid and ambiguous zero hours are unknown rather than a closed-day claim", () => {
  assert.equal(hospitalHoursLabel(undefined), "정보 없음");
  assert.equal(hospitalHoursLabel({ day: 7, opens: null, closes: null, overnight: false }), "정보 없음");
  assert.equal(hospitalHoursLabel({ day: 8, opens: 540, closes: null, overnight: false }), "정보 없음");
  assert.equal(hospitalHoursLabel({ day: 1, opens: -1, closes: 1080, overnight: false }), "정보 없음");
  assert.equal(hospitalHoursLabel({ day: 1, opens: 0, closes: 0, overnight: false }), "정보 없음");
  assert.equal(hospitalHoursLabel({ day: 1, opens: 540, closes: 1080, overnight: false }), "09:00 – 18:00");
});

test("overnight hours explicitly label next-day closing without claiming current availability", () => {
  assert.equal(hospitalHoursLabel({ day: 1, opens: 1080, closes: 120, overnight: true }), "18:00 – 다음 날 02:00");
  assert.equal(hospitalHoursLabel({ day: 2, opens: 1080, closes: 120, overnight: false }), "18:00 – 다음 날 02:00");
  assert.equal(hospitalHoursLabel({ day: 3, opens: 540, closes: 1440, overnight: false }), "09:00 – 다음 날 00:00");
  assert.equal(hospitalHoursLabel({ day: 4, opens: 540, closes: 1500, overnight: true }), "정보 없음");
});

test("department choices derive from received hospitals and unknown information stays separately filterable", () => {
  const known = hospital({ id: "known", departments: [" 내과 ", "내과", "소아청소년과"] });
  const unknown = hospital({ id: "unknown", departments: [" ", ""] });
  const other = hospital({ id: "other", departments: ["정형외과"] });
  const items = [known, unknown, other];
  assert.deepEqual(departmentOptions(items), ["내과", "소아청소년과", "정형외과"]);
  assert.deepEqual(filterHospitals(items, ALL_DEPARTMENTS), items);
  assert.deepEqual(filterHospitals(items, UNKNOWN_DEPARTMENT), [unknown]);
  assert.deepEqual(filterHospitals(items, "department:내과"), [known]);
  assert.deepEqual(filterHospitals(items, "department:안과"), []);
  assert.deepEqual(known.departments, [" 내과 ", "내과", "소아청소년과"]);
});

test("the default weekday follows Korean midnight rather than the host timezone", () => {
  assert.equal(currentHospitalDay(new Date("2026-10-11T14:59:59Z")), 7);
  assert.equal(currentHospitalDay(new Date("2026-10-11T15:00:00Z")), 1);
  assert.equal(currentHospitalDay(new Date("2026-10-09T15:00:00Z")), 6);
});

test("a refreshed list that loses the chosen department shows the all option and all results together", () => {
  const original = [hospital()];
  const chosen = "department:소아청소년과";
  assert.equal(resolveHospitalDepartment(original, chosen), chosen);
  const refreshed = [hospital({ departments: ["내과"] }), hospital({ id: "missing", departments: [] })];
  const selected = resolveHospitalDepartment(refreshed, chosen);
  assert.equal(selected, ALL_DEPARTMENTS);
  assert.deepEqual(filterHospitals(refreshed, selected), refreshed);
  assert.equal(resolveHospitalDepartment(refreshed, UNKNOWN_DEPARTMENT), UNKNOWN_DEPARTMENT);
  assert.deepEqual(filterHospitals(refreshed, UNKNOWN_DEPARTMENT), [refreshed[1]]);
});

test("demo and non-public sources cannot place calls or launch maps, and unsafe telephone text is rejected", () => {
  const valid = hospital();
  assert.deepEqual(hospitalContactLinks(valid, "DEMO"), { phone: null, map: null });
  assert.deepEqual(hospitalContactLinks(hospital({ source: { kind: "DEMO_DATA", name: "예시", url: null } }), "LIVE"), { phone: null, map: null });
  assert.deepEqual(hospitalContactLinks(hospital({ source: { kind: "KAKAO_MAP", name: "기타 자료", url: null } }), "LIVE"), { phone: null, map: null });
  const links = hospitalContactLinks(valid, "LIVE");
  assert.equal(links.phone, "tel:021234567");
  assert.equal(links.map, `https://map.kakao.com/link/search/${encodeURIComponent(`${valid.address} ${valid.name}`)}`);
  assert.equal(hospitalContactLinks(hospital({ phone: "javascript:alert(1)" }), "LIVE").phone, null);
  assert.equal(hospitalContactLinks(hospital({ phone: "123" }), "LIVE").phone, null);
});

test("responses from a prior region, wrong coordinates or mixed demo source are withheld", () => {
  const data = response();
  assert.equal(hospitalResponseIssue(data, "seongsu"), null);
  assert.ok(hospitalResponseIssue(data, "jongno"));
  assert.ok(hospitalResponseIssue({ ...data, origin: { ...data.origin, lat: 35 } }, "seongsu"));
  const mixed = response();
  mixed.hospitals[0]!.source = { kind: "DEMO_DATA", name: "예시", url: null };
  assert.ok(hospitalResponseIssue(mixed, "seongsu"));
  const region = HOSPITAL_REGIONS[1];
  const emptyDemo: HospitalResponse = { ...data, mode: "DEMO", regionId: "jongno",
    origin: { lat: region.lat, lng: region.lng }, originName: region.originName, hospitals: [] };
  assert.equal(hospitalResponseIssue(emptyDemo, "jongno"), null);
  assert.ok(hospitalResponseIssue({ ...emptyDemo, hospitals: [hospital()] }, "jongno"));
});

test("missing publication dates stay unknown and date-only data does not invent an observation time", () => {
  assert.equal(hospitalTimestamp(null), "미제공");
  assert.equal(hospitalTimestamp("invalid"), "미제공");
  assert.equal(hospitalTimestamp("2025-01-03"), "2025-01-03");
  assert.match(hospitalTimestamp("2026-10-11T01:00:00Z"), /2026/);
  assert.match(hospitalTimestamp("2026-10-11T01:00:00Z"), /10:00/);
});
