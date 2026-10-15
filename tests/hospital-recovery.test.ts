import { test } from "node:test";
import assert from "node:assert/strict";
import { HOSPITAL_REGIONS, type HospitalResponse } from "../shared/hospitals.js";
import {
  fetchHospitals, HospitalFetchError, hospitalFetchErrorMessage, type HospitalFetchErrorCode,
} from "../frontend/src/services/hospitals.js";

const credential = "serviceKey=private-test-credential";
const signal = () => new AbortController().signal;

function expectedError(code: HospitalFetchErrorCode, status?: number) {
  return (error: unknown) => {
    assert.ok(error instanceof HospitalFetchError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.equal(hospitalFetchErrorMessage(error), error.message);
    assert.ok(!error.message.includes(credential));
    return true;
  };
}

test("hospital fetch preserves the requested region, no-store policy, signal and successful response", async () => {
  const region = HOSPITAL_REGIONS[1];
  const data: HospitalResponse = {
    mode: "LIVE", status: "OK", regionId: region.id, origin: { lat: region.lat, lng: region.lng },
    originName: region.originName, fetchedAt: "2026-10-11T04:00:00Z",
    hospitals: [], partial: false, detailFailures: 0, message: "",
  };
  const controller = new AbortController();
  let receivedSignal: AbortSignal | null = null;
  const result = await fetchHospitals(region.id, controller.signal, async (url, options) => {
    assert.equal(url, "/api/hospitals?region=jongno");
    assert.equal(options?.cache, "no-store");
    receivedSignal = options?.signal ?? null;
    assert.ok(receivedSignal instanceof AbortSignal);
    assert.equal(receivedSignal.aborted, false);
    return Response.json(data);
  });
  assert.deepEqual(result, data);
  controller.abort();
  assert.equal((receivedSignal as AbortSignal | null)?.aborted, true);
});

test("only a fetch TypeError is described as a network failure", async () => {
  await assert.rejects(fetchHospitals("seongsu", signal(), async () => {
    throw new TypeError(`Failed to fetch ${credential}`);
  }), expectedError("NETWORK"));
  await assert.rejects(fetchHospitals("seongsu", signal(), async () => {
    throw new Error(`Unexpected failure ${credential}`);
  }), expectedError("UNKNOWN"));
  assert.match(hospitalFetchErrorMessage(new HospitalFetchError("NETWORK")), /인터넷 연결/);
  assert.doesNotMatch(hospitalFetchErrorMessage(new Error(credential)), /인터넷 연결|private-test-credential/);
});

test("timeouts during a request and while reading its body have a distinct recovery message", async () => {
  await assert.rejects(fetchHospitals("seongsu", signal(), async () => {
    throw new DOMException(`Timed out ${credential}`, "TimeoutError");
  }), expectedError("TIMEOUT"));
  const controller = new AbortController();
  await assert.rejects(fetchHospitals("seongsu", controller.signal, async () => {
    const response = Response.json({});
    response.json = async () => {
      controller.abort(new DOMException("Request timed out", "TimeoutError"));
      throw new DOMException("Body reading aborted", "AbortError");
    };
    return response;
  }), expectedError("TIMEOUT"));
  assert.match(hospitalFetchErrorMessage(new HospitalFetchError("TIMEOUT")), /조회 시간/);
});

test("non-OK HTTP responses distinguish upstream, access and other service errors without reading raw bodies", async () => {
  const cases: [number, HospitalFetchErrorCode][] = [
    [502, "UPSTREAM"], [503, "UPSTREAM"], [504, "UPSTREAM"],
    [401, "ACCESS"], [403, "ACCESS"], [400, "HTTP"], [404, "HTTP"], [429, "HTTP"], [500, "HTTP"],
  ];
  for (const [status, code] of cases) {
    await assert.rejects(fetchHospitals("seongsu", signal(), async () => {
      const response = new Response(credential, { status });
      response.json = async () => { assert.fail("HTTP error bodies must not become user messages"); };
      return response;
    }), expectedError(code, status));
    assert.doesNotMatch(hospitalFetchErrorMessage(new HospitalFetchError(code, status)), /인터넷 연결/);
  }
  const upstream = hospitalFetchErrorMessage(new HospitalFetchError("UPSTREAM", 502));
  assert.match(upstream, /병원 정보 제공 서비스.*응답/);
  assert.match(upstream, /잠시 후/);
  assert.match(upstream, /연결 설정/);
  assert.doesNotMatch(upstream, /API|인증키|유효하지/);
  assert.match(hospitalFetchErrorMessage(new HospitalFetchError("ACCESS", 403)), /접근 권한.*연결 설정/);
});

test("malformed JSON and body-read failures are response errors rather than network errors", async () => {
  await assert.rejects(fetchHospitals("seongsu", signal(), async () =>
    new Response(`{ invalid: ${credential}`, { status: 200 })), expectedError("RESPONSE"));
  await assert.rejects(fetchHospitals("seongsu", signal(), async () => {
    const response = Response.json({});
    response.json = async () => { throw new TypeError(`Unreadable body ${credential}`); };
    return response;
  }), expectedError("RESPONSE"));
  assert.match(hospitalFetchErrorMessage(new HospitalFetchError("RESPONSE")), /응답을 읽을 수/);
});

test("user cancellation remains cancellation rather than becoming a connectivity or timeout error", async () => {
  const controller = new AbortController();
  const reason = new DOMException("User cancelled", "AbortError");
  await assert.rejects(fetchHospitals("seongsu", controller.signal, async (_url, options) => {
    controller.abort(reason);
    assert.equal(options?.signal?.aborted, true);
    throw reason;
  }), (error) => error === reason);
});

test("display messages remain safe even if a typed error message is changed", () => {
  const error = new HospitalFetchError("HTTP", 500);
  const message = hospitalFetchErrorMessage(error);
  error.message = credential;
  assert.equal(hospitalFetchErrorMessage(error), message);
});
