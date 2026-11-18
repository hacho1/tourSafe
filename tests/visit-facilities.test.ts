import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeAccessibleTour, getAccessibleTour } from '../backend/src/adapters/accessibleTourApi.js';
import { parseTourismStandard, matchTourismStandard, tourismAmenities, type TourismStandardRow } from '../backend/src/adapters/tourismStandard.js';
import { getImportedToilets } from '../backend/src/adapters/publicFacilities.js';
import { listedAmenities, mergeVisitFacilities } from '../backend/src/utils/visitFacilities.js';
import { tileKey } from '../backend/src/utils/publicCsv.js';
import { emptySafety, unknown, confirmed } from '../backend/src/utils/data.js';
import { safeAdapter } from '../backend/src/services/recommendations.js';
import { config } from '../backend/src/config.js';
import type { TouristSpot, PlaceAmenities } from '../shared/models.js';

const source = { kind: 'PUBLIC_DATA' as const, name: 'test source', url: null };
const spot: TouristSpot = { id: '127291', name: '가족 공원', address: '서울특별시 성동구 예시로 1', lat: 37.5445, lng: 127.0374,
  phone: null, description: null, imageUrl: null, category: '관광지', indoor: null, source, updatedAt: '2026-01-01',
  openingHours: unknown(), holidays: unknown(), openNow: unknown(), closure: unknown(), safety: emptySafety(), distanceMeters: 0 };
const envelope = (items: Record<string, unknown>[]) => ({ response: { header: { resultCode: '0000' }, body: { items: { item: items }, totalCount: items.length } } });
const row: TourismStandardRow = { name: spot.name, addresses: [spot.address!], lat: spot.lat, lng: spot.lng, updatedAt: '2026-10-01',
  fields: [{ label: '공공편익시설정보', text: '화장실+수유실+흔들벤치' }] };

test('accessibility keeps route and rental text without declaring a fully stroller-accessible route', () => {
  const result = normalizeAccessibleTour(spot.id, envelope([{ contentid: spot.id, route: '입구 경사로 있음, 일부 구간 계단', stroller: '유모차 대여 가능', restroom: '장애인 화장실 있음', lactationroom: '수유실 있음' }]));
  assert.equal(result.safety.strollerAccessible, undefined);
  assert.equal(result.safety.toilet?.value, true);
  assert.equal(result.safety.nursingRoom?.value, true);
  assert.equal(result.details.find(item => item.id === 'accessible-route')?.text, '입구 경사로 있음, 일부 구간 계단');
  assert.ok(result.details.every(item => item.updatedAt === null));
});
test('missing, negative and nearby accessible restrooms never establish an onsite toilet', () => {
  for (const restroom of ['', '없음', '장애인 화장실 없음', '인근 공용 화장실 이용', '화장실 공사 중']) {
    assert.equal(normalizeAccessibleTour(spot.id, envelope([{ contentid: spot.id, restroom }])).safety.toilet, undefined);
  }
  assert.deepEqual(normalizeAccessibleTour(spot.id, envelope([])), { safety: {}, details: [] });
  assert.equal(normalizeAccessibleTour(spot.id, envelope([{ contentid: spot.id, lactationroom: '' }])).safety.nursingRoom, undefined);
  assert.equal(normalizeAccessibleTour(spot.id, envelope([{ contentid: spot.id, lactationroom: '없음' }])).safety.nursingRoom?.value, false);
});
test('mismatched or multiple API identities reject instead of attaching another place facilities', () => {
  assert.throws(() => normalizeAccessibleTour(spot.id, envelope([{ contentid: '999', restroom: '화장실 있음' }])), /MISMATCH/);
  assert.throws(() => normalizeAccessibleTour(spot.id, envelope([{ restroom: '화장실 있음' }])), /MISMATCH/);
  assert.throws(() => normalizeAccessibleTour(spot.id, envelope([{ contentid: spot.id }, { contentid: spot.id }])), /MISMATCH/);
  assert.throws(() => normalizeAccessibleTour(spot.id, {}), /FORMAT/);
});
test('accessibility requests use the dedicated provider and bound successful caching without returning credentials', async () => {
  const previous = config.accessibleTourKey; config.accessibleTourKey = 'test-access-key';
  try {
    const result = await getAccessibleTour(spot, async (url, options) => {
      const u = new URL(url);
      assert.equal(u.pathname, '/B551011/KorWithService2/detailWithTour2');
      assert.equal(u.searchParams.get('contentId'), spot.id);
      assert.equal(u.searchParams.get('serviceKey'), 'test-access-key');
      assert.equal(options?.ttl, 24 * 3600_000);
      return envelope([{ contentid: spot.id, restroom: '<p>화장실 있음</p>' }]);
    });
    assert.equal(result.details[0]?.text, '화장실 있음');
    assert.equal(JSON.stringify(result).includes('test-access-key'), false);
  } finally { config.accessibleTourKey = previous; }
});
test('CSV reader preserves quoted values and dates and rejects unrelated files', () => {
  const header = '관광지명,소재지도로명주소,위도,경도,공공편익시설정보,데이터기준일자\n';
  const rows = parseTourismStandard(Buffer.from('\ufeff' + header + '가족 공원,"서울특별시 성동구 예시로 1, 2층",37.5445,127.0374,"화장실+벤치",2026-10-01\n'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.addresses[0], '서울특별시 성동구 예시로 1, 2층');
  assert.equal(rows[0]?.updatedAt, '2026-10-01');
  assert.throws(() => parseTourismStandard(Buffer.from('화장실명,주소\n화장실,주소')), /COLUMNS/);
});
test('matching requires name plus coordinates or corroborating address, and rejects ambiguity', () => {
  assert.equal(matchTourismStandard(spot, [row]), row);
  assert.equal(matchTourismStandard(spot, [{ ...row, name: '다른 공원' }]), null);
  assert.equal(matchTourismStandard(spot, [{ ...row, lat: 35, lng: 129 }]), null);
  assert.equal(matchTourismStandard(spot, [row, { ...row }]), null);
  assert.equal(matchTourismStandard(spot, [{ ...row, lat: null, lng: null, addresses: ['다른 주소'] }]), null);
  const byAddress = { ...row, lat: null, lng: null };
  assert.equal(matchTourismStandard(spot, [byAddress]), byAddress);
  assert.equal(matchTourismStandard({ ...spot, address: null }, [byAddress]), null);
});
test('standard facility fields populate only explicitly listed amenities and keep their source dates', () => {
  const result = tourismAmenities(spot, [row]);
  assert.equal(result.safety.toilet?.value, true);
  assert.equal(result.safety.benches?.value, true);
  assert.equal(result.safety.nursingRoom?.updatedAt, '2026-10-01');
  assert.equal(result.safety.shade, undefined);
  assert.equal(result.safety.strollerAccessible, undefined);
  assert.equal(result.details[0]?.text, row.fields[0]?.text);
  assert.equal(tourismAmenities({ ...spot, name: '다른 관광지' }, [row]).details.length, 0);
});
test('absence, future plans, zero counts and signposts cannot become installed facilities', () => {
  for (const text of ['화장실 없음', '화장실 설치 예정', '화장실0개', '화장실 안내판', '주변 화장실', '음수대 공사중', '수유실 이용 문의']) assert.deepEqual(listedAmenities(text, source, null), {});
  assert.equal(listedAmenities('화장실10개+벤치', source, null).toilet?.value, true);
  assert.equal(listedAmenities('나무+야외정자+유모차 대여', source, null).shade, undefined);
});
test('conflicting sources stay unknown while preserving both original explanations', () => {
  const api = normalizeAccessibleTour(spot.id, envelope([{ contentid: spot.id, lactationroom: '없음' }]));
  const csv = tourismAmenities(spot, [row]);
  const result = mergeVisitFacilities(spot, [api, csv]);
  assert.equal(result.safety.nursingRoom.status, 'UNKNOWN');
  assert.equal(result.safety.toilet.value, true);
  assert.equal(result.visitDetails?.length, 2);
  assert.equal(spot.safety.toilet.status, 'UNKNOWN');
});
test('one failed provider does not erase verified data from the other source', async () => {
  const failed = await safeAdapter<PlaceAmenities>('accessibleTour', '무장애', true, async () => { throw new Error('provider unavailable'); }, { safety: {}, details: [] });
  const result = mergeVisitFacilities(spot, [failed.data, tourismAmenities(spot, [row])]);
  assert.equal(failed.status.status, 'ERROR');
  assert.equal(result.safety.toilet.value, true);
  assert.equal(result.safety.strollerAccessible.status, 'UNKNOWN');
});
test('nearby imported toilets preserve address precision, exclude other categories and never mutate onsite amenities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toursafe-visit-toilets-'));
  const version = '2026-10-16T00-00-00-000Z', key = tileKey(spot.lat, spot.lng);
  await mkdir(join(root, version, 'tiles'), { recursive: true });
  await writeFile(join(root, 'manifest.json'), JSON.stringify({ version, tiles: [key], areas: [] }));
  const facilities = Array.from({ length: 4 }, (_, i) => ({ id: `toilet-${i}`, type: 'TOILET', name: `화장실 ${i}`, lat: spot.lat + i * .001, lng: spot.lng,
    address: spot.address, phone: null, openingHours: null, updatedAt: '2026-01-01', cameraCount: null,
    addressLocation: { lat: spot.lat + i * .001, lng: spot.lng, precision: 'ADDRESS', provider: 'KAKAO', matchedAddress: spot.address, checkedAt: '2026-10-01' } }));
  await writeFile(join(root, version, 'tiles', `${key}.json`), JSON.stringify([...facilities, { ...facilities[0], id: 'camera', type: 'CCTV' }]));
  const toilets = await getImportedToilets(spot, root);
  assert.equal(toilets.length, 3);
  assert.equal(toilets[0]?.distanceMeters, 0);
  assert.equal(toilets[0]?.distanceType, 'STRAIGHT_LINE');
  assert.match(toilets[0]!.locationNote!, /주소 기준/);
  assert.ok(toilets.every(item => item.type === 'TOILET'));
  assert.equal(spot.safety.toilet.status, 'UNKNOWN');
});
test('merging additional sources keeps already-established fields unless there is a conflict', () => {
  const existing = { ...spot, safety: { ...spot.safety, toilet: confirmed(true, source, '2026-01-01') } };
  assert.equal(mergeVisitFacilities(existing, [{ safety: {}, details: [] }]).safety.toilet.value, true);
});
