import assert from "node:assert/strict";
import test from "node:test";
import { findTourRegions, getTouristSpots } from "../backend/src/adapters/tourApi.js";
import { fetchData } from "../backend/src/utils/http.js";
import { scoreSummary } from "../frontend/src/config/constants.js";

test("sparse live facts cannot present a high partial score as a confident recommendation", () => {
  assert.deepEqual(scoreSummary({ grade: "PRIORITY", coverage: 5, total: 100 }), { label: "정보 확인 필요", total: null });
  assert.equal(scoreSummary({ grade: "HOLD", coverage: 5, total: 100 }).label, "추천 보류");
  assert.equal(scoreSummary({ grade: "PRIORITY", coverage: 60, total: 100 }).total, 100);
});

const options = { lat: 37.5445, lng: 127.0374, radius: 3000, withKids: true };
const envelope = (items: unknown[]) => ({ response: { header: { resultCode: "0000" }, body: { totalCount: items.length, items: { item: items } } } });
const item = (id: string, type = "12", lng = 127.038) => ({ contentid: id, contenttypeid: type, title: `장소 ${id}`, mapx: lng, mapy: 37.545, addr1: "공개 예시 주소", modifiedtime: "20261001140000" });

test("TourAPI keyword lookup encodes names and returns only named Korea coordinates", async () => {
  const regions = await findTourRegions("서울 숲", async url => {
    const u = new URL(url);
    assert.ok(u.pathname.endsWith("searchKeyword2"));
    assert.equal(u.searchParams.get("keyword"), "서울 숲");
    return envelope([item("good"), { ...item("empty"), mapx: "" }, { ...item("outside"), mapy: 10 }, { ...item("title"), title: "" }]);
  });
  assert.deepEqual(regions, [{ name: "장소 good", address: "공개 예시 주소", lat: 37.545, lng: 127.038 }]);
});

test("TourAPI filters three supported categories upstream and sends only current detailCommon2 parameters", async () => {
  const types: string[] = [];
  const rows = await getTouristSpots(options, async url => {
    const u = new URL(url);
    if (u.pathname.endsWith("locationBasedList2")) {
      const type = u.searchParams.get("contentTypeId")!; types.push(type);
      assert.equal(u.searchParams.get("numOfRows"), "8");
      return envelope([item(type, type)]);
    }
    if (u.pathname.endsWith("detailCommon2")) {
      for (const field of ["defaultYN", "firstImageYN", "addrinfoYN", "overviewYN", "mapinfoYN", "contentTypeId"]) assert.equal(u.searchParams.has(field), false, field);
      return envelope([{ overview: "<p>실제 형식의 소개</p>", firstimage: "http://example.org/photo.jpg" }]);
    }
    return envelope([{ usetime: "09:00-18:00", restdate: "연중무휴" }]);
  });
  assert.deepEqual(types.sort(), ["12", "14", "28"]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]!.description, "실제 형식의 소개");
  assert.equal(rows[0]!.imageUrl, "https://example.org/photo.jpg");
  assert.equal(rows[0]!.openingHours.status, "CONFIRMED");
  assert.ok(rows.every(row => row.source.kind === "PUBLIC_DATA"));
});

test("invalid, duplicate and out-of-range records cannot consume the nearest eight places", async () => {
  let details = 0;
  const rows = await getTouristSpots(options, async url => {
    const u = new URL(url);
    if (u.pathname.endsWith("locationBasedList2")) return envelope([
      item("outside", "12", 129), { ...item("bad"), mapy: "" }, item("restaurant", "39"),
      ...Array.from({ length: 10 }, (_, n) => item(String(n), "12", 127.038 + n * .001)),
    ]);
    details++; return envelope([]);
  });
  assert.equal(rows.length, 8);
  assert.equal(details, 16);
  assert.deepEqual(rows.map(row => row.id), ["0", "1", "2", "3", "4", "5", "6", "7"]);
});

test("malformed detail replies preserve the valid list and keep unavailable information unknown", async () => {
  const rows = await getTouristSpots(options, async url => {
    const u = new URL(url);
    if (u.pathname.endsWith("locationBasedList2")) return envelope(u.searchParams.get("contentTypeId") === "12" ? [item("known")] : []);
    return { resultCode: "ERROR", resultMsg: "Unexpected provider format" };
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.description, null);
  assert.equal(rows[0]!.address, "공개 예시 주소");
  assert.equal(rows[0]!.openingHours.status, "UNKNOWN");
  assert.equal(rows[0]!.openNow.status, "UNKNOWN");
});

test("failed list queries reject rather than producing fabricated or successful empty results", async () => {
  await assert.rejects(getTouristSpots(options, async () => { throw new Error("LIST_FAILED"); }), /LIST_FAILED/);
});

test("top-level TourAPI error envelopes are rejected even when HTTP reports success", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ resultCode: "INVALID_REQUEST_PARAMETER_ERROR", resultMsg: "invalid parameter" }), { status: 200 });
  try { await assert.rejects(fetchData("https://example.org/tour-top-level-error"), /UPSTREAM_API_ERROR/); }
  finally { globalThis.fetch = original; }
});
