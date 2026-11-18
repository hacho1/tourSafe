import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import type { Recommendation } from '../shared/models.js';
import { DATA_CACHE, PREPARED_CACHE, PACK_CACHE, offlineFetch, offlineKey, prepareOfflinePlace, getOfflinePack, snapshotRecommendation, removeOfflinePlace } from '../frontend/src/services/offline.js';

const descriptors = ['caches', 'navigator', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
const origin = 'https://toursafe.invalid';
const keyOf = (input: RequestInfo | URL) => new URL(input instanceof Request ? input.url : String(input), origin).href;
class MemoryCache {
  rows = new Map<string, Response>();
  fail = false;
  async match(input: RequestInfo | URL) { return this.rows.get(keyOf(input))?.clone(); }
  async put(input: RequestInfo | URL, response: Response) { if (this.fail) throw new DOMException('full', 'QuotaExceededError'); this.rows.set(keyOf(input), response.clone()); }
  async delete(input: RequestInfo | URL) { return this.rows.delete(keyOf(input)); }
  async keys() { return [...this.rows.keys()].map(key => new Request(key)); }
}
let buckets: Map<string, MemoryCache>;
beforeEach(() => {
  buckets = new Map();
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: {
    async open(name: string) { if (!buckets.has(name)) buckets.set(name, new MemoryCache()); return buckets.get(name)!; },
    async keys() { return [...buckets.keys()]; },
  } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
});
afterEach(() => { for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
const response = (value: unknown) => Response.json(value);
const url = '/api/map-facilities?lat=37.5&lng=127&area=';
const facilityData = { origin: { lat: 37.5, lng: 127 }, facilities: [{ id: 'toilet', name: '주소 기준 화장실' }], statuses: [{ key: 'publicFiles', status: 'OK' }] };
function item(): Recommendation {
  const unknown = { value: null, status: 'UNKNOWN', source: null, updatedAt: null };
  return {
    checkedAt: new Date().toISOString(), spot: { id: '1', name: '방문지', lat: 37.5, lng: 127, source: { kind: 'PUBLIC_DATA', name: '기관', url: null }, openNow: { ...unknown, status: 'CONFIRMED', value: true } },
    weather: { temperature: { ...unknown, value: 22, status: 'CONFIRMED' }, severeAlert: { ...unknown, value: false, status: 'CONFIRMED' } },
    facilities: [], score: { total: 80, confidence: 'HIGH', grade: 'RECOMMENDED', coverage: 50, components: [], hardFilter: ['운영시간 외', '위험 기상특보 확인', '출입통제 자료'] }, statuses: [],
  } as unknown as Recommendation;
}

test('snapshot keys preserve exact origin, radius, family option and area; exclude weather, search and arbitrary requests', () => {
  assert.equal(offlineKey(url), offlineKey('/api/map-facilities?area=&lng=127&lat=37.5'));
  assert.notEqual(offlineKey(url), offlineKey('/api/map-facilities?area=&lng=127&lat=37.6'));
  assert.notEqual(offlineKey('/api/recommendations?lat=37.5&lng=127&radius=1000&withKids=true'), offlineKey('/api/recommendations?lat=37.5&lng=127&radius=3000&withKids=true'));
  for (const path of ['https://other.example/api/hospitals?region=seongsu', '/api/map-weather?lat=37.5&lng=127', '/api/regions?q=집', '/api/health', '/api/hospitals?lat=37.5&lat=37.6', '/api/hospitals?token=secret']) assert.equal(offlineKey(path), null);
});

test('connection failure restores only the same location and marks it as past data', async () => {
  globalThis.fetch = async () => response(facilityData);
  await offlineFetch(url);
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  const data = await (await offlineFetch('/api/map-facilities?area=&lng=127&lat=37.5')).json();
  assert.equal(data.facilities[0].id, 'toilet'); assert.ok(data.offlineSnapshotAt);
  await assert.rejects(offlineFetch('/api/map-facilities?lat=37.6&lng=127&area='), /오프라인 자료가 없어요/);
});

test('HTTP errors and caller aborts never silently become a cached success', async () => {
  globalThis.fetch = async () => response(facilityData); await offlineFetch(url);
  globalThis.fetch = async () => new Response('fail', { status: 503 });
  assert.equal((await offlineFetch(url)).status, 503);
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async () => { throw controller.signal.reason; };
  await assert.rejects(offlineFetch(url, { signal: controller.signal }), { name: 'AbortError' });
});

test('quota failure does not break online lookup and does not claim the missing snapshot exists', async () => {
  const cache = await caches.open(DATA_CACHE) as unknown as MemoryCache; cache.fail = true;
  globalThis.fetch = async () => response(facilityData);
  assert.equal((await offlineFetch(url)).status, 200);
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(offlineFetch(url), /오프라인 자료가 없어요/);
});

test('snapshots clear even newly fetched weather, no-alert and opening assertions without changing source facts', () => {
  const original = item(), copy = snapshotRecommendation(original);
  assert.equal(copy.spot.openNow.status, 'UNKNOWN'); assert.equal(copy.spot.openNow.value, null);
  assert.equal(copy.weather.temperature.value, null); assert.equal(copy.weather.severeAlert.value, null);
  assert.equal(copy.score.total, null); assert.deepEqual(copy.score.hardFilter, ['출입통제 자료']);
  assert.equal(original.spot.openNow.value, true); assert.equal(original.weather.temperature.value, 22);
  assert.equal(copy.spot.name, original.spot.name); assert.deepEqual(copy.spot.source, original.spot.source);
});

test('recent-query eviction is bounded and cannot evict a deliberately prepared pack', async () => {
  const pinned = await caches.open(PREPARED_CACHE);
  await pinned.put(url, response(facilityData));
  globalThis.fetch = async input => response({ ...facilityData, origin: { lat: Number(new URL(String(input), origin).searchParams.get('lat')), lng: 127 } });
  for (let n = 0; n < 28; n++) await offlineFetch(`/api/map-facilities?lat=${37 + n / 100}&lng=127&area=`);
  assert.equal((await (await caches.open(DATA_CACHE)).keys()).length, 24);
  assert.ok(await pinned.match(url));
});

test('explicit prepare validates the origin and requires both toilet and hospital data', async () => {
  globalThis.fetch = async input => response(String(input).includes('hospitals') ? { origin: { lat: 38, lng: 127 }, mode: 'LIVE', status: 'OK', hospitals: [] } : facilityData);
  await assert.rejects(prepareOfflinePlace(item(), new AbortController().signal), /자료/);
  assert.equal(await getOfflinePack('1'), null);
});

test('failed preparation leaves old pack readable; missing persisted dependency is never called prepared', async () => {
  globalThis.fetch = async input => response(String(input).includes('hospitals') ? { origin: facilityData.origin, mode: 'LIVE', status: 'OK', hospitals: [] } : facilityData);
  const old = await prepareOfflinePlace(item(), new AbortController().signal);
  assert.ok(await getOfflinePack('1'));
  globalThis.fetch = async () => new Response('error', { status: 503 });
  await assert.rejects(prepareOfflinePlace(item(), new AbortController().signal));
  assert.equal((await getOfflinePack('1'))?.preparedAt, old.preparedAt);
  await (await caches.open(PREPARED_CACHE)).delete(offlineKey(old.paths[0]!)!);
  assert.equal(await getOfflinePack('1'), null);
  assert.equal((await (await caches.open(PACK_CACHE)).keys()).length, 1);
});

test('shell installation includes lazy assets and activation preserves prepared data', async () => {
  const handlers = new Map<string, (event: { waitUntil: (task: Promise<unknown>) => void }) => void>();
  const added: string[] = [], deleted: string[] = [];
  vm.runInNewContext(readFileSync(new URL('../frontend/public/sw.js', import.meta.url), 'utf8'), {
    self: { addEventListener: (type: string, handler: never) => handlers.set(type, handler), skipWaiting: async () => {}, clients: { claim: async () => {} } },
    fetch: async () => response(['/assets/main.js', '/assets/map-lazy.js', '/assets/map-worker.js', '/assets/style.css']),
    caches: { open: async () => ({ addAll: async (paths: string[]) => added.push(...paths) }), keys: async () => ['toursafe-shell-v17', 'toursafe-shell-v18', DATA_CACHE, PREPARED_CACHE, PACK_CACHE], delete: async (key: string) => { deleted.push(key); } },
  });
  let pending: Promise<unknown> | undefined;
  const event = { waitUntil(task: Promise<unknown>) { pending = task; } };
  handlers.get('install')!(event); await pending;
  assert.ok(added.includes('/assets/map-lazy.js')); assert.ok(added.includes('/assets/map-worker.js')); assert.ok(added.includes('/'));
  handlers.get('activate')!(event); await pending;
  assert.deepEqual(deleted, ['toursafe-shell-v17']);
});

test('removing one place does not delete another prepared place with the same origin', async () => {
  globalThis.fetch = async input => response(String(input).includes('hospitals') ? { origin: facilityData.origin, mode: 'LIVE', status: 'OK', hospitals: [] } : facilityData);
  await prepareOfflinePlace(item(), new AbortController().signal);
  const second = item(); second.spot.id = '2';
  await prepareOfflinePlace(second, new AbortController().signal);
  await removeOfflinePlace('1');
  assert.equal(await getOfflinePack('1'), null); assert.ok(await getOfflinePack('2'));
  await removeOfflinePlace('2');
  assert.equal((await (await caches.open(PREPARED_CACHE)).keys()).length, 0);
});
