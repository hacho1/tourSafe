import { reviewFacilities } from '../utils/facilityQuality.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Coordinates, DataSource, SupportFacility } from '../../../shared/models.js';
import type { MapFacility, PublicFacilityRecord } from '../../../shared/mapFacilities.js';
import { districtFile, tileKey } from '../utils/publicCsv.js';
import { haversine } from '../utils/geo.js';
import { applyToiletGeocoding, TOILET_GEOCODING_AREA, TOILET_GEOCODING_FILE, NATIONAL_TOILET_DIRECTORY, normalizedProvinceAddress, toiletAreaKey, type NationalToiletManifest } from '../utils/toiletGeocoding.js';

const root = resolve(process.env.PUBLIC_FACILITIES_DIR || 'backend/data/public-facilities');
export const hasPublicFacilities = () => existsSync(join(root, 'manifest.json'));
const sources: Record<PublicFacilityRecord['type'], DataSource> = {
  CCTV: { kind: 'PUBLIC_DATA', name: '공공데이터포털 · CCTV 설치자료', url: 'https://www.data.go.kr/data/15013094/standard.do' },
  TOURIST_INFO: { kind: 'PUBLIC_DATA', name: '전국관광안내소표준데이터', url: 'https://www.data.go.kr/data/15013112/standard.do' },
  TOILET: { kind: 'PUBLIC_DATA', name: '공공데이터포털 · 공중화장실정보', url: 'https://www.data.go.kr/data/15012892/standard.do' },
};
interface Manifest { version: string; tiles: string[]; areas: string[] }
const cache = new Map<string, Promise<PublicFacilityRecord[]>>();
async function records(path: string) {
  let pending = cache.get(path);
  if (!pending) {
    pending = readFile(path, 'utf8').then(text => JSON.parse(text) as PublicFacilityRecord[]);
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(path, pending);
    pending.catch(() => cache.delete(path));
  }
  return pending;
}
export function inRadius(rows: PublicFacilityRecord[], center: Coordinates, radius: number): MapFacility[] {
  return rows.flatMap(row => row.lat === null || row.lng === null ? [] : [{ ...row, lat: row.lat, lng: row.lng, distanceMeters: haversine(center, { lat: row.lat, lng: row.lng }), source: sources[row.type] }])
    .filter(row => row.distanceMeters <= radius).sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
}
/** Count source sites before marker thinning, without treating cameraCount as sites. */
export function summarizeCctv(facilities: MapFacility[]) {
  const sites = facilities.filter(item => item.type === 'CCTV' && Number.isFinite(item.distanceMeters) && item.distanceMeters >= 0);
  return { within500m: sites.filter(item => item.distanceMeters <= 500).length, within3000m: sites.filter(item => item.distanceMeters <= 3000).length };
}
async function nationalToilets(center: Coordinates, radius: number, area: string, dataRoot: string, sourceVersion: string) {
  const base = join(dataRoot, NATIONAL_TOILET_DIRECTORY);
  const manifest = JSON.parse(await readFile(join(base, 'manifest.json'), 'utf8')) as NationalToiletManifest;
  if (manifest.schemaVersion !== 2 || manifest.sourceVersion !== sourceVersion || !/^[\dTZ-]+$/.test(manifest.version) || !Array.isArray(manifest.tiles) || !Array.isArray(manifest.areas)) return null;
  const directory = join(base, manifest.version);
  const latDelta = radius / 110000, lngDelta = radius / (110000 * Math.cos(center.lat * Math.PI / 180));
  const [minY, minX] = tileKey(center.lat - latDelta, center.lng - lngDelta).split('_').map(Number);
  const [maxY, maxX] = tileKey(center.lat + latDelta, center.lng + lngDelta).split('_').map(Number);
  const keys = new Set(manifest.tiles), pending = [];
  for (let y = minY!; y <= maxY!; y++) for (let x = minX!; x <= maxX!; x++) {
    const key = `${y}_${x}`;
    if (keys.has(key)) pending.push(records(join(directory, 'tiles', `${key}.json`)));
  }
  const facilities = inRadius((await Promise.all(pending)).flat(), center, radius);
  const areaKey = toiletAreaKey(area), prefix = normalizedProvinceAddress(area);
  const addresses = area && manifest.areas.includes(areaKey) ? await records(join(directory, 'addresses', `${districtFile(areaKey)}.json`)) : [];
  const toilets = addresses.filter(row => row.address && normalizedProvinceAddress(row.address).startsWith(`${prefix} `));
  return { facilities, toilets };
}
export async function getPublicFacilities(center: Coordinates, radius = 3000, area = '', dataRoot = root) {
  const manifest = JSON.parse(await readFile(join(dataRoot, 'manifest.json'), 'utf8')) as Manifest;
  if (!/^[\dTZ-]+$/.test(manifest.version)) throw new Error('Invalid data version');
  const directory = join(dataRoot, manifest.version);
  // Bounding box deliberately encloses the full circle; haversine performs the final filter.
  const latDelta = radius / 110000;
  const lngDelta = radius / (110000 * Math.cos(center.lat * Math.PI / 180));
  const [minY, minX] = tileKey(center.lat - latDelta, center.lng - lngDelta).split('_').map(Number);
  const [maxY, maxX] = tileKey(center.lat + latDelta, center.lng + lngDelta).split('_').map(Number);
  const keys = new Set(manifest.tiles);
  const pending = [];
  for (let y = minY!; y <= maxY!; y++) for (let x = minX!; x <= maxX!; x++) {
    const key = `${y}_${x}`;
    if (keys.has(key)) pending.push(records(join(directory, 'tiles', `${key}.json`)));
  }
  const imported = (await Promise.all(pending)).flat();
  try {
    const nationwide = await nationalToilets(center, radius, area, dataRoot, manifest.version);
    if (nationwide) {
      const reviewed = reviewFacilities([...inRadius(imported, center, radius), ...nationwide.facilities], manifest.version);
      const addresses = reviewFacilities(nationwide.toilets, manifest.version);
      return {
        facilities: reviewed.rows.sort((a,b) => a.distanceMeters-b.distanceMeters || a.id.localeCompare(b.id)),
        qualityIssues: [...reviewed.conflicts, ...addresses.conflicts], toiletCoordinates: 'NATIONAL' as const,
        unlocatedToilets: { area, total: addresses.rows.length, items: addresses.rows },
      };
    }
  } catch { /* Keep legacy coordinates and original address lists during migration/failure. */ }
  let geocoded: PublicFacilityRecord[] = [];
  // A missing/stale optional enrichment must never take down CCTV or address lists.
  try {
    if (manifest.areas.includes(TOILET_GEOCODING_AREA)) {
      const data: unknown = JSON.parse(await readFile(join(dataRoot, TOILET_GEOCODING_FILE), 'utf8'));
      const originals = await records(join(directory, 'addresses', `${districtFile(TOILET_GEOCODING_AREA)}.json`));
      geocoded = applyToiletGeocoding(originals, data, manifest.version).filter(row => row.addressLocation);
    }
  } catch { /* Original public data stays available if enrichment is unavailable. */ }
  const reviewed = reviewFacilities(inRadius([...imported, ...geocoded], center, radius), manifest.version);
  const facilities = reviewed.rows;
  const locatedIds = new Set(geocoded.map(row => row.id));
  const addresses = area && manifest.areas.includes(area) ? await records(join(directory, 'addresses', `${districtFile(area)}.json`)) : [];
  const reviewedAddresses = reviewFacilities(addresses.filter(row => !locatedIds.has(row.id)), manifest.version);
  const toilets = reviewedAddresses.rows;
  return { facilities, qualityIssues: [...reviewed.conflicts, ...reviewedAddresses.conflicts], toiletCoordinates: 'PARTIAL' as const, unlocatedToilets: { area, total: toilets.length, items: toilets } };
}
export async function getImportedTouristInfo(center: Coordinates): Promise<SupportFacility[]> {
  return (await getPublicFacilities(center, 5000)).facilities.filter(row => row.type === 'TOURIST_INFO').slice(0, 3)
    .map(row => ({ ...row, type: 'TOURIST_INFO', distanceType: 'STRAIGHT_LINE', holidays: null, languages: null, emergency: null }));
}
/** Nearby facilities remain separate from a tourist site's own amenities. */
export async function getImportedToilets(center: Coordinates, dataRoot?: string): Promise<SupportFacility[]> {
  return (await getPublicFacilities(center, 3000, '', dataRoot)).facilities.filter(row => row.type === 'TOILET').slice(0, 3)
    .map(row => ({ ...row, type: 'TOILET' as const, distanceType: 'STRAIGHT_LINE' as const, holidays: null, languages: null, emergency: null,
      ...(row.addressLocation ? { locationNote: '주소 기준 위치 · 실제 화장실 입구와 다를 수 있어요.' } : {}),
    }));
}

export function searchToiletAddressRows(rows: PublicFacilityRecord[], query: string, offset: number) {
  const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const needle = normalize(query);
  const matches = rows.filter(row => normalize(`${row.name} ${row.address || ''}`).includes(needle));
  return { total: matches.length, offset, items: matches.slice(offset, offset + 30), nextOffset: offset + 30 < matches.length ? offset + 30 : null };
}

/** Text lookup includes records whose province could not be identified; no distance is inferred. */
export async function searchUnlocatedToilets(query: string, offset: number, dataRoot = root) {
  const source = JSON.parse(await readFile(join(dataRoot, 'manifest.json'), 'utf8')) as Manifest;
  const base = join(dataRoot, NATIONAL_TOILET_DIRECTORY);
  const manifest = JSON.parse(await readFile(join(base, 'manifest.json'), 'utf8')) as NationalToiletManifest;
  if (manifest.schemaVersion !== 2 || manifest.sourceVersion !== source.version || !/^[\dTZ-]+$/.test(manifest.version) || !Array.isArray(manifest.areas)) throw new Error('NATIONAL_ADDRESSES_UNAVAILABLE');
  const rows = (await Promise.all(manifest.areas.map(area => records(join(base, manifest.version, 'addresses', `${districtFile(area)}.json`))))).flat();
  return searchToiletAddressRows(reviewFacilities(rows, source.version).rows, query, offset);
}
