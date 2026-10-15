import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublicRow, district, districtFile } from '../backend/src/utils/publicCsv.js';
import { inRadius, summarizeCctv } from '../backend/src/adapters/publicFacilities.js';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cctv = { '관리번호': 'A-1', '개방자치단체코드': '3000000', '설치목적구분': '생활방범', '소재지도로명주소': '서울특별시 종로구 테스트길 1', 'WGS84위도': '37.5445', 'WGS84경도': '127.0374', '카메라대수': '3', '데이터기준일자': '2022-06-24' };
test('CCTV retains source date and installation count without asserting live operation', () => {
  const record = normalizePublicRow(cctv, 'CCTV')!;
  assert.equal(record.cameraCount, 3);
  assert.equal(record.updatedAt, '2022-06-24');
  assert.equal(record.name, '생활방범 CCTV');
  assert.equal(record.openingHours, null);
  assert.equal(record.id, normalizePublicRow({ ...cctv }, 'CCTV')!.id);
  assert.notEqual(record.id, normalizePublicRow({ ...cctv, '개방자치단체코드': '4000000' }, 'CCTV')!.id);
});
test('address-only toilets keep null coordinates and cannot become distance/map points', () => {
  const record = normalizePublicRow({ '화장실명': '화장실, A', '소재지도로명주소': '서울특별시 성동구 테스트길 1', '개방시간': '정시', '개방시간상세': '09:00~18:00' }, 'TOILET')!;
  assert.equal(record.name, '화장실, A');
  assert.equal(record.lat, null);
  assert.equal(record.lng, null);
  assert.equal(record.openingHours, '정시 · 09:00~18:00');
  assert.deepEqual(inRadius([record], { lat: 37.5445, lng: 127.0374 }, 3000), []);
});
test('bad or outside-Korea coordinates never enter the map', () => {
  for (const coords of [{ 'WGS84위도': '', 'WGS84경도': '' }, { 'WGS84위도': 'NaN' }, { 'WGS84위도': '0' }, { 'WGS84경도': '200' }]) {
    const record = normalizePublicRow({ ...cctv, ...coords }, 'CCTV')!;
    assert.equal(record.lat, null);
    assert.equal(record.lng, null);
  }
});
test('radius queries preserve source and omit far-away installations', () => {
  const nearby = normalizePublicRow(cctv, 'CCTV')!;
  const far = normalizePublicRow({ ...cctv, '관리번호': 'far', 'WGS84위도': '35.1' }, 'CCTV')!;
  const result = inRadius([far, nearby], { lat: 37.5445, lng: 127.0374 }, 3000);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.distanceMeters, 0);
  assert.equal(result[0]!.source.kind, 'PUBLIC_DATA');
  assert.equal(result[0]!.updatedAt, '2022-06-24');
});
test('CCTV radius summary counts all imported sites before display thinning, not camera units', () => {
  const base = inRadius([normalizePublicRow(cctv, 'CCTV')!], { lat: 37.5445, lng: 127.0374 }, 3000)[0]!;
  const rows = Array.from({ length: 45 }, (_, i) => ({ ...base, id: `site-${i}`, distanceMeters: 100 + i, cameraCount: 8 }));
  rows.push({ ...base, id: 'boundary', distanceMeters: 500 }, { ...base, id: 'outside-small', distanceMeters: 501 }, { ...base, id: 'large-boundary', distanceMeters: 3000 }, { ...base, id: 'outside', distanceMeters: 3001 }, { ...base, id: 'bad', distanceMeters: NaN });
  assert.deepEqual(summarizeCctv([...rows, { ...base, type: 'POLICE', distanceMeters: 10 }]), { within500m: 46, within3000m: 48 });
  assert.deepEqual(summarizeCctv([]), { within500m: 0, within3000m: 0 });
});
test('tourist info preserves seasonal hours and missing hours remain unknown', () => {
  const row = { '관광안내소명': '안내소', '소재지도로명주소': '서울특별시 종로구 세종대로', '위도': '37.57', '경도': '126.97', '운영시작시각(하절기)': '09:00', '운영종료시각(하절기)': '18:00', '휴무일': '월요일' };
  assert.equal(normalizePublicRow(row, 'TOURIST_INFO')!.openingHours, '하절기 09:00–18:00 · 휴무: 월요일');
  assert.equal(normalizePublicRow({ '관광안내소명': '안내소', '소재지도로명주소': '서울특별시 종로구' }, 'TOURIST_INFO')!.openingHours, null);
  assert.equal(normalizePublicRow({}, 'TOURIST_INFO'), null);
});
test('district filenames cannot contain request path fragments', () => {
  assert.equal(district('서울특별시   성동구 테스트길 1'), '서울특별시 성동구');
  assert.match(districtFile('../../.env'), /^[a-f0-9]{16}$/);
});

test('CSV importer handles quoted addresses and duplicate records; bad headers cannot replace an import', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'toursafe-import-test-'));
  await mkdir(join(directory, 'input'));
  const cctvPath = join(directory, 'input/cctv.csv');
  const infoPath = join(directory, 'input/info.csv');
  const toiletPath = join(directory, 'input/toilet.csv');
  const camera = '1,3000000,"서울특별시 종로구 테스트길 1, 2층",37.5445,127.0374\n';
  await writeFile(cctvPath, '관리번호,개방자치단체코드,소재지도로명주소,WGS84위도,WGS84경도\n' + camera + camera);
  await writeFile(infoPath, '관광안내소명,소재지도로명주소,위도,경도\n안내소,서울특별시 종로구 테스트길,37.55,127.04\n');
  await writeFile(toiletPath, '화장실명,소재지도로명주소\n화장실,서울특별시 종로구 테스트길\n');
  const command = ['--import', import.meta.resolve('tsx'), resolve('scripts/import-public-data.ts'), '--cctv', cctvPath, '--tourist-info', infoPath, '--toilets', toiletPath];
  const result = spawnSync(process.execPath, command, { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const path = join(directory, 'backend/data/public-facilities/manifest.json');
  const before = await readFile(path, 'utf8');
  const manifest = JSON.parse(before);
  assert.equal(manifest.files[0].located, 1);
  assert.equal(manifest.files[0].duplicates, 1);
  assert.equal(manifest.files[2].unlocated, 1);
  await writeFile(toiletPath, 'wrong,header\nwrong,data\n');
  const bad = spawnSync(process.execPath, command, { cwd: directory, encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
  assert.equal(await readFile(path, 'utf8'), before);
});


import { reviewFacilities, FACILITY_QUALITY_ISSUES } from '../backend/src/utils/facilityQuality.js';
test('verified conflicts are excluded by stable ID and source version, not similar names', () => {
  const issue = FACILITY_QUALITY_ISSUES[0]!;
  const rows = [ {id:issue.id,name:issue.name}, {id:'another-record',name:issue.name} ] as import('../shared/mapFacilities.js').PublicFacilityRecord[];
  const result = reviewFacilities(rows, issue.sourceVersion);
  assert.deepEqual(result.rows.map(r=>r.id), ['another-record']);
  assert.equal(result.conflicts[0]!.evidenceUrl, issue.evidenceUrl);
  assert.equal(rows.length, 2);
  assert.equal(reviewFacilities(rows, 'different-source-version').rows.length, 2);
});

import { searchToiletAddressRows } from '../backend/src/adapters/publicFacilities.js';
test('address lookup reaches unclassified provinces and exposes the next page', () => {
  const rows = Array.from({length:31},(_,i)=>({ id:'u'+i,name:'중앙 화장실 '+i,address:'지역 미분류 번지' })) as import('../shared/mapFacilities.js').PublicFacilityRecord[];
  const first=searchToiletAddressRows(rows,'중앙화장실',0);
  assert.equal(first.total,31); assert.equal(first.items.length,30); assert.equal(first.nextOffset,30);
  const last=searchToiletAddressRows(rows,'중앙화장실',30);
  assert.equal(last.items[0]!.id,'u30'); assert.equal(last.nextOffset,null);
});
