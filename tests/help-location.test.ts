import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHospitalService } from '../backend/src/services/hospitals.js';
import type { HospitalFetch } from '../backend/src/adapters/hospitalApi.js';
import { hospitalResponseIssue } from '../frontend/src/utils/hospital.js';
import { fetchHospitals } from '../frontend/src/services/hospitals.js';

const point = { lat: 35.1631, lng: 129.1636 };
const body = (rows: Record<string, unknown>[]) => ({ response: { body: { items: { item: rows }, totalCount: rows.length } } });

test('coordinate hospital queries retain the exact origin and discard candidates beyond 5km', async () => {
  const requests: URL[] = [];
  const request: HospitalFetch = async url => {
    const parsed = new URL(url); requests.push(parsed);
    if (parsed.pathname.endsWith('getHsptlBassInfoInqire')) return body([{ hpid: 'near', dgidIdName: '소아청소년과', dutyTime2s: '0900', dutyTime2c: '1800' }]);
    return body([
      { hpid: 'far', dutyName: '먼 후보', wgs84Lat: 35.25, wgs84Lon: 129.1636 },
      { hpid: 'near', dutyName: '가까운 후보', wgs84Lat: 35.164, wgs84Lon: 129.1636 },
    ]);
  };
  const service = createHospitalService({
    getConfig: () => ({ hospitalKey: 'test', useMock: true }), fetch: request,
    resolveRegion: async origin => { assert.deepEqual(origin, point); return { province: '부산광역시', district: '해운대구', area: '부산광역시 해운대구' }; },
  });
  const result = await service(point);
  assert.deepEqual(result.origin, point);
  assert.equal(result.regionId, 'nearby');
  assert.equal(result.mode, 'LIVE');
  assert.equal(result.partial, true);
  assert.deepEqual(result.hospitals.map(item => item.id), ['near']);
  assert.deepEqual(result.hospitals[0]!.departments, ['소아청소년과']);
  assert.equal(requests[0]!.searchParams.get('Q0'), '부산광역시');
  assert.equal(requests[0]!.searchParams.get('Q1'), '해운대구');
  assert.equal(requests.length, 2);
  assert.equal(hospitalResponseIssue(result, point), null);
  assert.ok(hospitalResponseIssue(result, { lat: 37.5445, lng: 127.0374 }));
  assert.ok(hospitalResponseIssue({ ...result, regionId: 'seongsu' }, point));
});

test('nearby lookup never substitutes a preset or demo when region lookup fails', async () => {
  let fetched = false;
  const service = createHospitalService({
    getConfig: () => ({ hospitalKey: 'test', useMock: true }),
    fetch: async () => { fetched = true; return body([]); },
    resolveRegion: async () => { throw new Error('REGION_NOT_FOUND'); },
  });
  await assert.rejects(service(point), /REGION_NOT_FOUND/);
  await assert.rejects(service({ lat: NaN, lng: 129 }), /INVALID_COORDINATES/);
  assert.equal(fetched, false);
});

test('unconfigured current-location lookup stays empty and live even when old demo mode is enabled', async () => {
  const service = createHospitalService({ getConfig: () => ({ hospitalKey: '', useMock: true }), fetch: async () => { throw new Error('unexpected fetch'); } });
  const result = await service(point);
  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.equal(result.mode, 'LIVE');
  assert.deepEqual(result.origin, point);
  assert.deepEqual(result.hospitals, []);
});

test('browser hospital request sends selected coordinates and no stale preset id', async () => {
  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input), 'http://localhost');
    assert.equal(url.searchParams.get('lat'), String(point.lat));
    assert.equal(url.searchParams.get('lng'), String(point.lng));
    assert.equal(url.searchParams.has('region'), false);
    return new Response(JSON.stringify({ origin: point }), { status: 200 });
  };
  assert.deepEqual((await fetchHospitals(point, new AbortController().signal, fetchImpl)).origin, point);
});
