import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Hospital } from '../shared/hospitals.js';
import type { MapFacility } from '../shared/mapFacilities.js';
import { canExpandMapCluster, groupMapPins, isCctvOnly, mapLayerFor, mergeMapMedical, parseMapLayers } from '../frontend/src/utils/mapLayers.js';

const source = { kind: 'PUBLIC_DATA' as const, name: 'NEMC test', url: null };
const hospital = (id: string): Hospital => ({ id, name: '같은 이름 병원', lat: 37.54, lng: 127.03, address: null, phone: null, departments: ['내과'], hours: [], distanceMeters: 150, source, updatedAt: null, detailStatus: 'OK' });
const emergency = (id: string): MapFacility => ({ id: `medical-${id}`, type: 'MEDICAL', name: '응급기관 등록명', lat: 37.541, lng: 127.031, address: null, phone: '02-123-4567', openingHours: null, distanceMeters: 180, source, updatedAt: null });

test('map preferences preserve independent off states and recover from corrupt storage', () => {
  assert.deepEqual(parseMapLayers(null), { CCTV: false, POLICE: true, MEDICAL: true, TOILET: false });
  assert.deepEqual(parseMapLayers('{broken'), parseMapLayers(null));
  assert.deepEqual(parseMapLayers('{"CCTV":"false","POLICE":true,"MEDICAL":true}'), parseMapLayers(null));
  assert.deepEqual(parseMapLayers('{"CCTV":false,"POLICE":true,"MEDICAL":false}'), { CCTV: false, POLICE: true, MEDICAL: false, TOILET: false });
  assert.deepEqual(parseMapLayers('{"CCTV":false,"POLICE":false,"MEDICAL":false}'), { CCTV: false, POLICE: false, MEDICAL: false, TOILET: false });
  assert.deepEqual(parseMapLayers('{"CCTV":true,"POLICE":true,"MEDICAL":false,"TOILET":true}'), { CCTV: true, POLICE: true, MEDICAL: false, TOILET: true });
});
test('toilet preference survives reload without changing existing toggles', () => {
  assert.deepEqual(parseMapLayers(JSON.stringify({ CCTV: false, POLICE: true, MEDICAL: false, TOILET: true })), { CCTV: false, POLICE: true, MEDICAL: false, TOILET: true });
});

test('both medical types share one display group without swallowing other categories', () => {
  assert.equal(mapLayerFor('HOSPITAL'), 'MEDICAL');
  assert.equal(mapLayerFor('MEDICAL'), 'MEDICAL');
  assert.equal(mapLayerFor('CCTV'), 'CCTV');
  assert.equal(mapLayerFor('POLICE'), 'POLICE');
  assert.equal(mapLayerFor('TOILET'), 'TOILET');
  assert.equal(mapLayerFor('TOURIST_INFO'), null);
  assert.equal(mapLayerFor('SPOT'), null);
});
test('only CCTV-exclusive markers use the reference style; mixed facilities retain their emphasis', () => {
  assert.equal(isCctvOnly([{type:'CCTV'}, {type:'CCTV'}]), true);
  assert.equal(isCctvOnly([{type:'CCTV'}, {type:'MEDICAL'}]), false);
  assert.equal(isCctvOnly([{type:'CCTV'}, {type:'POLICE'}]), false);
  assert.equal(isCctvOnly([]), false);
});
test('matching NEMC HPIDs merge into one hospital with emergency source and phone retained', () => {
  const result = mergeMapMedical([emergency('A000001')], [hospital('A000001')]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, 'hospital-A000001');
  assert.equal(result[0]?.emergency, true);
  assert.deepEqual(result[0]?.hospital?.departments, ['내과']);
  assert.equal(result[0]?.emergencyFacility?.id, 'medical-A000001');
  assert.equal(result[0]?.phone, '02-123-4567');
});
test('matching names and coordinates cannot merge different hospital IDs', () => {
  const medical = { ...emergency('B000001'), name: hospital('A000001').name, lat: 37.54, lng: 127.03 };
  const result = mergeMapMedical([medical], [hospital('A000001')]);
  assert.equal(result.length, 2);
  assert.equal(result.find(row => row.type === 'HOSPITAL')?.emergency, false);
  assert.equal(result.find(row => row.type === 'MEDICAL')?.emergency, true);
});
test('invalid or demonstration hospitals do not appear on the live map', () => {
  const invalid = [{ ...hospital('bad'), lat: NaN }, { ...hospital('range'), lat: 200 }, { ...hospital('demo'), source: { ...source, kind: 'DEMO_DATA' as const } }];
  assert.deepEqual(mergeMapMedical([], invalid), []);
});
test('overlap grouping preserves every facility without chaining an entire street together', () => {
  const items = [{ point: 'left', x: 0, y: 0 }, { point: 'right', x: 80, y: 0 }, { point: 'bridge', x: 40, y: 0 }, { point: 'separate', x: 200, y: 0 }];
  const result = groupMapPins(items, 48);
  assert.equal(result.length, 3);
  assert.deepEqual([...result[0]!].sort(), ['bridge', 'left']);
  assert.deepEqual(result[1], ['right']);
  assert.deepEqual(result[2], ['separate']);
  assert.equal(new Set(result.flat()).size, items.length);
});
test('exact overlap distance boundary stays separate, identical positions remain selectable', () => {
  assert.deepEqual(groupMapPins([{ point: 'a', x: 0, y: 0 }, { point: 'b', x: 56, y: 0 }]), [['a'], ['b']]);
  assert.deepEqual(groupMapPins([{ point: 'a', x: 0, y: 0 }, { point: 'b', x: 0, y: 0 }]), [['a', 'b']]);
});

test('diagonal marker hitboxes cannot overlap and every source entry is preserved', () => {
  assert.deepEqual(groupMapPins([{ point: 'a', x: 0, y: 0 }, { point: 'b', x: 40, y: 40 }]), [['a', 'b']]);
  const items = Array.from({ length: 60 }, (_, i) => ({ point: i, x: (i * 37) % 300, y: (i * 23) % 280 }));
  const groups = groupMapPins(items);
  assert.equal(new Set(groups.flat()).size, items.length);
  const anchors = groups.map(group => items[group[0]!]!);
  for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) {
    assert.ok(Math.max(Math.abs(anchors[i]!.x - anchors[j]!.x), Math.abs(anchors[i]!.y - anchors[j]!.y)) >= 56);
  }
});

test('clusters expand only when locations can separate; same-position and maximum zoom clusters open lists', () => {
  const p = { lat: 37.54, lng: 127.04 }, near = { lat: 37.5405, lng: 127.0405 };
  assert.equal(canExpandMapCluster([p, near], 14), true);
  assert.equal(canExpandMapCluster([p, near], 18.5), false);
  assert.equal(canExpandMapCluster([p, { ...p }], 14), false);
  assert.equal(canExpandMapCluster([], 14), false);
});


import { originSafeOffsets } from '../frontend/src/utils/mapLayers.js';
test('origin dot and label stay clear without moving nonconflicting pins', () => {
  const anchors = [{x:0,y:0},{x:56,y:0},{x:112,y:0},{x:0,y:90}];
  const result = originSafeOffsets(anchors, {x:0,y:0});
  const positions = anchors.map((p,i) => ({ x:p.x+result[i]!.x, y:p.y+result[i]!.y }));
  assert.deepEqual(result[2], {x:0,y:0});
  for(const p of positions) assert.ok(!(Math.abs(p.x)<62 && p.y>-42 && p.y<76));
  for(let i=0;i<positions.length;i++) for(let j=i+1;j<positions.length;j++) assert.ok(Math.max(Math.abs(positions[i]!.x-positions[j]!.x), Math.abs(positions[i]!.y-positions[j]!.y))>=56);
});
