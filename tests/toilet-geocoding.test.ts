import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyToiletGeocoding, matchToiletAddress, toiletAddressQuery, toiletAreaKey, TOILET_GEOCODING_FILE, NATIONAL_TOILET_DIRECTORY, TOILET_GEOCODING_AREA as area } from '../backend/src/utils/toiletGeocoding.js';
import { normalizePublicRow, districtFile, tileKey } from '../backend/src/utils/publicCsv.js';
import { getPublicFacilities, inRadius } from '../backend/src/adapters/publicFacilities.js';

const address = '서울특별시 성동구 왕십리로 77';
const checkedAt = '2026-10-13T12:00:00.000Z';
const document = { address_type: 'ROAD_ADDR', address_name: '서울 성동구 왕십리로 77', x: '127.04', y: '37.54', road_address: { region_1depth_name: '서울', region_2depth_name: '성동구' } };
const reply = (documents: unknown[] = [document]) => ({ meta: { total_count: documents.length }, documents });
const row = normalizePublicRow({ '화장실명': '서울숲역', '소재지도로명주소': address, '개방시간': '06:00~23:00', '데이터기준일자': '2023-12-20' }, 'TOILET')!;
const version = '2026-10-13T12-00-00-000Z';
const file = () => ({ schemaVersion: 1, sourceVersion: version, area, results: [{ id: row.id, address, location: matchToiletAddress(reply(), address, checkedAt) }] });

test('exact building/parcel match maps x to longitude and y to latitude with provenance', () => {
  const location = matchToiletAddress(reply(), address, checkedAt)!;
  assert.deepEqual(location, { lat: 37.54, lng: 127.04, precision: 'ADDRESS', provider: 'KAKAO', matchedAddress: document.address_name, checkedAt });
  assert.equal(toiletAddressQuery(address + ', 2층 (성수동)'), address);
  const parcel = { ...document, address_type: 'REGION_ADDR', address_name: '서울 성동구 성수동1가 1-2', address: document.road_address };
  assert.ok(matchToiletAddress(reply([parcel]), '서울특별시 성동구 성수동1가 1-2', checkedAt));
});

test('ambiguous, missing, street-only, neighboring district and altered house numbers stay unlocated', () => {
  for (const data of [reply([]), reply([document, document]), { ...reply(), meta: { total_count: 9 } },
    reply([{ ...document, address_type: 'ROAD' }]), reply([{ ...document, address_name: '서울 성동구 왕십리로 79' }]),
    reply([{ ...document, road_address: { region_1depth_name: '서울', region_2depth_name: '광진구' } }]),
    reply([{ ...document, y: '' }]), reply([{ ...document, y: '0' }]), reply([{ ...document, x: 'NaN' }])]) {
    assert.equal(matchToiletAddress(data, address, checkedAt), null);
  }
});

test('nationwide matching accepts province aliases, city/gu addresses and Sejong without guessing missing provinces', () => {
  for (const [query, returned, province, district] of [
    ['부산광역시 해운대구 테스트로 10', '부산 해운대구 테스트로 10', '부산', '해운대구'],
    ['경기도 수원시 영통구 테스트로 10', '경기 수원시 영통구 테스트로 10', '경기', '수원시 영통구'],
    ['강원특별자치도 춘천시 테스트로 10', '강원특별자치도 춘천시 테스트로 10', '강원특별자치도', '춘천시'],
    ['전라북도 전주시 덕진구 테스트로 10', '전북특별자치도 전주시 덕진구 테스트로 10', '전북특별자치도', '전주시 덕진구'],
    ['세종특별자치시 테스트로 10', '세종특별자치시 테스트로 10', '세종특별자치시', ''],
    ['제주특별자치도 제주시 테스트로 10', '제주 제주시 테스트로 10', '제주', '제주시'],
  ]) {
    const data = reply([{ ...document, address_name: returned, road_address: { region_1depth_name: province, region_2depth_name: district } }]);
    assert.ok(matchToiletAddress(data, query!, checkedAt), query);
    assert.equal(matchToiletAddress(data, query!.replace(/^[^ ]+ /, ''), checkedAt), null);
  }
});

test('geocoding preserves hours/source date and rejects stale imports, changed addresses or corrupt coordinates', () => {
  const enriched = applyToiletGeocoding([row], file(), version)[0]!;
  assert.equal(enriched.openingHours, row.openingHours);
  assert.equal(enriched.updatedAt, '2023-12-20');
  assert.equal(enriched.addressLocation?.checkedAt, checkedAt);
  assert.equal(inRadius([enriched], { lat: 37.54, lng: 127.04 }, 3000)[0]?.distanceMeters, 0);
  assert.equal(row.lat, null);
  assert.deepEqual(applyToiletGeocoding([row], file(), 'new-import'), [row]);
  const changed = { ...row, address: address + '9' };
  assert.deepEqual(applyToiletGeocoding([changed], file(), version), [changed]);
  const corrupt = file(); corrupt.results[0]!.location!.lat = 0;
  assert.deepEqual(applyToiletGeocoding([row], corrupt, version), [row]);
  assert.deepEqual(applyToiletGeocoding([row], { ...file(), results: null }, version), [row]);
});

test('located toilets appear near district borders, disappear from address-only lists, and fail back without losing other data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toursafe-toilets-'));
  await mkdir(join(root, version, 'addresses'), { recursive: true });
  await mkdir(join(root, version, 'tiles'));
  const tile = tileKey(37.54, 127.04);
  await writeFile(join(root, version, 'tiles', `${tile}.json`), JSON.stringify([{ ...row, id: 'camera', type: 'CCTV', lat: 37.54, lng: 127.04 }]));
  await writeFile(join(root, 'manifest.json'), JSON.stringify({ version, areas: [area], tiles: [tile] }));
  const unknown = { ...row, id: 'unknown', name: '좌표 미확인', address: address + '9' };
  await writeFile(join(root, version, 'addresses', `${districtFile(area)}.json`), JSON.stringify([row, unknown]));
  const path = join(root, TOILET_GEOCODING_FILE);
  await writeFile(path, JSON.stringify(file()));
  const center = { lat: 37.54, lng: 127.04 };
  const result = await getPublicFacilities(center, 3000, area, root);
  assert.deepEqual(result.facilities.map(item => item.id), ['camera', row.id]);
  assert.deepEqual(result.unlocatedToilets.items.map(item => item.id), ['unknown']);
  assert.equal(result.unlocatedToilets.total, 1);
  assert.equal((await getPublicFacilities(center, 3000, '서울특별시 광진구', root)).facilities.filter(item => item.type === 'TOILET').length, 1);
  assert.equal((await getPublicFacilities({ lat: 35.1, lng: 129.1 }, 3000, '', root)).facilities.length, 0);
  await writeFile(path, '{broken');
  const fallback = await getPublicFacilities(center, 3000, area, root);
  assert.deepEqual(fallback.facilities.map(item => item.id), ['camera']);
  assert.equal(fallback.unlocatedToilets.total, 2);
  await writeFile(path, JSON.stringify({ ...file(), sourceVersion: 'old' }));
  assert.equal((await getPublicFacilities(center, 3000, area, root)).unlocatedToilets.total, 2);
});

test('national spatial tiles query multiple provinces and preserve unlocated lists across province aliases and city/gu', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toursafe-national-'));
  await writeFile(join(root, 'manifest.json'), JSON.stringify({ version, areas: [], tiles: [] }));
  const base = join(root, NATIONAL_TOILET_DIRECTORY), output = join(base, version);
  await mkdir(join(output, 'tiles'), { recursive: true }); await mkdir(join(output, 'addresses'));
  const rows = [
    { ...row, id: 'busan', address: '부산광역시 해운대구 테스트로 10', lat: 35.163, lng: 129.163 },
    { ...row, id: 'jeju', address: '제주특별자치도 제주시 테스트로 10', lat: 33.5, lng: 126.53 },
    { ...row, id: 'suwon', address: '경기도 수원시 영통구 테스트로 10', lat: 37.26, lng: 127.05 },
    { ...row, id: 'sejong', address: '세종특별자치시 테스트로 10', lat: 36.48, lng: 127.29 },
  ];
  const areas = ['부산광역시 해운대구', '제주특별자치도 제주시', '경기도 수원시 영통구', '세종특별자치시'];
  const index = { schemaVersion: 2, sourceVersion: version, version, tiles: rows.map(item => tileKey(item.lat, item.lng)), areas: areas.map(toiletAreaKey) };
  await writeFile(join(base, 'manifest.json'), JSON.stringify(index));
  for (const [i, item] of rows.entries()) {
    await writeFile(join(output, 'tiles', `${tileKey(item.lat, item.lng)}.json`), JSON.stringify([item]));
    await writeFile(join(output, 'addresses', `${districtFile(toiletAreaKey(areas[i]!))}.json`), JSON.stringify([{ ...item, id: 'unlocated', lat: null, lng: null }, ...(i === 2 ? [{ ...item, id: 'other-gu', address: '경기도 수원시 장안구 테스트로 10', lat: null, lng: null }] : [])]));
  }
  for (const [i, item] of rows.entries()) {
    const result = await getPublicFacilities(item, 3000, areas[i]!, root);
    assert.deepEqual(result.facilities.map(point => point.id), [item.id]);
    assert.equal(result.facilities[0]?.distanceMeters, 0);
    assert.deepEqual(result.unlocatedToilets.items.map(point => point.id), ['unlocated']);
  }
  await writeFile(join(base, 'manifest.json'), JSON.stringify({ ...index, sourceVersion: 'old' }));
  assert.equal((await getPublicFacilities(rows[0]!, 3000, areas[0]!, root)).facilities.length, 0);
});
