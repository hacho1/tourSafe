import type { Recommendation, SearchResponse, WeatherInfo } from '../../../shared/models';
import { appFetch } from './appFetch';
import { connected, nativeApp } from './platform';

export const DATA_CACHE = 'toursafe-data-v1';
export const PREPARED_CACHE = 'toursafe-prepared-v1';
export const PACK_CACHE = 'toursafe-packs-v1';
const SAVED_AT = 'x-toursafe-saved-at';
const RECENT_LIMIT = 24;
export const OFFLINE_CHANGED = 'toursafe-offline-change';
export interface OfflinePack {
  version: 1;
  item: Recommendation;
  preparedAt: string;
  paths: string[];
}

export function offlineKey(path: string): string | null {
  if (!path.startsWith('/api/')) return null;
  const url = new URL(path, 'https://toursafe.invalid');
  if (!['/api/recommendations', '/api/map-facilities', '/api/hospitals'].includes(url.pathname)) return null;
  const allowed = url.pathname === '/api/recommendations' ? ['lat', 'lng', 'radius', 'withKids']
    : url.pathname === '/api/hospitals' ? ['lat', 'lng', 'region'] : ['lat', 'lng', 'area'];
  if ([...url.searchParams.keys()].some(key => !allowed.includes(key)) || allowed.some(key => url.searchParams.getAll(key).length > 1)) return null;
  url.searchParams.sort();
  return `${url.pathname}?${url.searchParams}`;
}

function storage(): CacheStorage | null {
  try { return typeof caches === 'undefined' ? null : caches; } catch { return null; }
}
function changed() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(OFFLINE_CHANGED)); }

/** Weather and current opening status never survive a snapshot read, even a very recent one. */
export function snapshotRecommendation(item: Recommendation): Recommendation {
  const unknown = { value: null, status: 'UNKNOWN' as const, source: null, updatedAt: null };
  const weather = Object.fromEntries(Object.keys(item.weather).map(key => [key, { ...unknown }])) as unknown as WeatherInfo;
  return { ...item, offlineSnapshotAt: item.offlineSnapshotAt || item.checkedAt || new Date().toISOString(), checkedAt: undefined, weather,
    spot: { ...item.spot, openNow: { ...unknown } },
    score: { ...item.score, total: null, grade: 'UNKNOWN', confidence: 'LOW', hardFilter: item.score.hardFilter.filter(reason => !reason.includes('운영시간 외') && !reason.includes('기상특보')) },
  };
}

export async function readOffline(path: string): Promise<Response | undefined> {
  const key = offlineKey(path), store = storage();
  if (!key || !store) return;
  const matches = await Promise.all([DATA_CACHE, PREPARED_CACHE].map(async name => (await store.open(name)).match(key)));
  return matches.filter((entry): entry is Response => Boolean(entry)).sort((a, b) => Date.parse(b.headers.get(SAVED_AT) || '') - Date.parse(a.headers.get(SAVED_AT) || ''))[0];
}

async function writeResponse(path: string, response: Response, cacheName: string) {
  const key = offlineKey(path), store = storage();
  if (!key || !store || !response.ok) return;
  const body = await response.clone().text();
  if (body.length > 4_000_000) throw new Error('자료가 너무 커서 오프라인으로 저장하지 못했어요.');
  const data = JSON.parse(body) as Record<string, unknown>;
  if (data.mode === 'DEMO' || data.status === 'NOT_CONFIGURED' ||
    (path.startsWith('/api/recommendations') && (!Array.isArray(data.recommendations) || !data.origin)) ||
    (path.startsWith('/api/map-facilities') && (!Array.isArray(data.facilities) || !data.origin)) ||
    (path.startsWith('/api/hospitals') && (!Array.isArray(data.hospitals) || !data.origin))) return;
  const headers = new Headers(response.headers);
  headers.set(SAVED_AT, new Date().toISOString());
  headers.set('content-type', 'application/json');
  if (Array.isArray(data.recommendations)) data.recommendations = (data.recommendations as Recommendation[]).map(snapshotRecommendation);
  const cache = await store.open(cacheName);
  await cache.put(key, new Response(JSON.stringify(data), { headers }));
  if (cacheName === DATA_CACHE) {
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - RECENT_LIMIT)).map(request => cache.delete(request)));
  }
}

/** HTTP errors and caller cancellations remain errors; only connection failures use past data. */
export async function offlineFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof input !== 'string') return appFetch(input, init);
  const path = input;
  if (init?.method && init.method.toUpperCase() !== 'GET') return appFetch(input, init);
  const key = offlineKey(path);
  if (!key || !storage()) return appFetch(path, init);
  try {
    if (!connected()) throw new TypeError('OFFLINE');
    const response = await appFetch(path, init);
    if (response.ok) {
      // Cache failure must not break an otherwise successful online lookup.
      await writeResponse(path, response, DATA_CACHE).catch(() => {});
    }
    return response;
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    const cached = await readOffline(path).catch(() => undefined);
    if (!cached) throw new Error('이 위치의 오프라인 자료가 없어요. 연결 후 저장한 장소에서 ‘오프라인 자료 준비’를 눌러 주세요.');
    const body = await cached.json() as Record<string, unknown>;
    if (Array.isArray(body.recommendations)) body.recommendations = (body.recommendations as Recommendation[]).map(snapshotRecommendation);
    body.offlineSnapshotAt = cached.headers.get(SAVED_AT);
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }
}

function packKey(id: string) { return `/__offline/place/${encodeURIComponent(id)}`; }

export async function getOfflinePack(id: string): Promise<OfflinePack | null> {
  const store = storage();
  if (!store) return null;
  const response = await (await store.open(PACK_CACHE)).match(packKey(id));
  if (!response) return null;
  const pack = await response.json() as OfflinePack;
  if (pack.version !== 1 || pack.item?.spot?.id !== id || !Array.isArray(pack.paths) || !Number.isFinite(Date.parse(pack.preparedAt))) return null;
  const cache = await store.open(PREPARED_CACHE);
  if ((await Promise.all(pack.paths.map(path => cache.match(offlineKey(path)!)))).some(row => !row)) return null;
  return pack;
}

export async function findOfflineRecommendation(id: string): Promise<Recommendation | null> {
  const store = storage();
  if (!store) return null;
  const pack = await getOfflinePack(id);
  if (pack) return snapshotRecommendation(pack.item);
  const cache = await store.open(DATA_CACHE);
  const keys = (await cache.keys()).filter(key => new URL(key.url).pathname === '/api/recommendations').reverse();
  for (const key of keys) {
    const response = await cache.match(key);
    const data = await response?.json() as SearchResponse | undefined;
    const item = data?.recommendations.find(row => row.spot.id === id);
    if (item) return snapshotRecommendation(item);
  }
  return null;
}

export async function prepareOfflinePlace(item: Recommendation, signal: AbortSignal): Promise<OfflinePack> {
  const store = storage();
  if (!store) throw new Error('이 브라우저에서는 오프라인 자료를 저장할 수 없어요. HTTPS 또는 localhost에서 열어 주세요.');
  if (!connected()) throw new Error('인터넷에 연결한 뒤 오프라인 자료를 준비해 주세요.');
  if (item.spot.source.kind === 'DEMO_DATA') throw new Error('시연 자료는 실제 여행용으로 내려받지 않아요.');
  const { lat, lng } = item.spot;
  const paths = [
    `/api/map-facilities?${new URLSearchParams({ lat: String(lat), lng: String(lng), area: '' })}`,
    `/api/hospitals?${new URLSearchParams({ lat: String(lat), lng: String(lng) })}`,
  ];
  const responses = await Promise.all(paths.map(async path => {
    const response = await appFetch(path, { signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]), cache: 'no-store' });
    if (!response.ok) throw new Error('주변 시설 자료를 받지 못했어요. 연결 후 다시 준비해 주세요. 기존 저장은 유지돼요.');
    const data = await response.clone().json();
    if (data.origin?.lat !== lat || data.origin?.lng !== lng ||
      (path.startsWith('/api/hospitals') ? data.mode !== 'LIVE' || data.status !== 'OK'
        : !Array.isArray(data.facilities) || data.statuses?.find((row: { key: string }) => row.key === 'publicFiles')?.status !== 'OK')) {
      throw new Error('화장실 또는 의료기관 자료를 확인하지 못했어요. 연결 후 다시 준비해 주세요.');
    }
    return response;
  }));
  signal.throwIfAborted();
  for (const [index, path] of paths.entries()) await writeResponse(path, responses[index]!, PREPARED_CACHE);
  signal.throwIfAborted();
  const pack: OfflinePack = { version: 1, item: snapshotRecommendation(item), preparedAt: new Date().toISOString(), paths };
  await (await store.open(PACK_CACHE)).put(packKey(item.spot.id), new Response(JSON.stringify(pack), { headers: { 'content-type': 'application/json' } }));
  if (!await getOfflinePack(item.spot.id)) throw new Error('자료가 기기에 저장됐는지 확인하지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요.');
  changed();
  return pack;
}

export async function removeOfflinePlace(id: string) {
  const store = storage();
  if (!store) return;
  const pack = await getOfflinePack(id);
  const cache = await store.open(PREPARED_CACHE);
  const packs = await store.open(PACK_CACHE);
  const otherPaths = new Set<string>();
  for (const key of await packs.keys()) {
    if (new URL(key.url).pathname === packKey(id)) continue;
    const other = await (await packs.match(key))?.json() as OfflinePack | undefined;
    other?.paths?.forEach(path => { const key = offlineKey(path); if (key) otherPaths.add(key); });
  }
  if (pack) await Promise.all(pack.paths.filter(path => !otherPaths.has(offlineKey(path)!)).map(path => cache.delete(offlineKey(path)!)));
  await packs.delete(packKey(id));
  changed();
}

export async function offlineShellReady(): Promise<boolean> {
  if (nativeApp) return true; // The complete UI is bundled inside the APK.
  const store = storage();
  if (!store || typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return false;
  const keys = (await store.keys()).filter(key => key.startsWith('toursafe-shell-v18'));
  return keys.length > 0 && Boolean(await (await store.open(keys[0]!)).match('/'));
}
