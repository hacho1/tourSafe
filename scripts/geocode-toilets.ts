import { readFile, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from '../backend/src/config.js';
import { districtFile } from '../backend/src/utils/publicCsv.js';
import { buildUrl, fetchData } from '../backend/src/utils/http.js';
import { matchToiletAddress, toiletAddressQuery, TOILET_GEOCODING_AREA as area, TOILET_GEOCODING_FILE, type ToiletGeocodingFile } from '../backend/src/utils/toiletGeocoding.js';
import type { AddressLocation, PublicFacilityRecord } from '../shared/mapFacilities.js';

// Explicit maintenance command, never invoked by map requests. Limited to Seongdong-gu.
const root = resolve(process.env.PUBLIC_FACILITIES_DIR || 'backend/data/public-facilities');
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
if (!/^[\dTZ-]+$/.test(manifest.version) || !manifest.areas.includes(area)) throw new Error('SEONGDONG_IMPORT_REQUIRED');
const rows: PublicFacilityRecord[] = JSON.parse(await readFile(join(root, manifest.version, 'addresses', `${districtFile(area)}.json`), 'utf8'));
if (rows.length > 300 || rows.some(row => row.type !== 'TOILET' || !row.address?.startsWith(`${area} `))) throw new Error('UNEXPECTED_TOILET_SCOPE');
const destination = join(root, TOILET_GEOCODING_FILE);
let previous: ToiletGeocodingFile | null = null;
try { previous = JSON.parse(await readFile(destination, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const cache = new Map<string, AddressLocation | null>();
if (previous?.sourceVersion === manifest.version && previous.schemaVersion === 1 && previous.area === area) {
  for (const item of previous.results) cache.set(toiletAddressQuery(item.address), item.location);
}
const missing = [...new Set(rows.map(row => toiletAddressQuery(row.address!)))].filter(query => !cache.has(query));
console.log(JSON.stringify({ area, records: rows.length, uncachedAddresses: missing.length, mode: process.argv.includes('--run') ? 'run' : 'preview' }));
if (!process.argv.includes('--run')) process.exit(0);
if (missing.length && !config.kakaoKey) throw new Error('KAKAO_REST_API_KEY_REQUIRED');
let requests = 0;
async function save() {
  const file: ToiletGeocodingFile = {
    schemaVersion: 1, sourceVersion: manifest.version, area, generatedAt: new Date().toISOString(),
    results: rows.filter(row => cache.has(toiletAddressQuery(row.address!))).map(row => ({ id: row.id, address: row.address!, location: cache.get(toiletAddressQuery(row.address!))! })),
  };
  const temp = `${destination}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(file, null, 2));
  await rename(temp, destination);
}
try {
  for (const query of missing) {
    const data = await fetchData(buildUrl('https://dapi.kakao.com/v2/local/search/address.json', { query, analyze_type: 'exact', size: 2 }), { headers: { Authorization: `KakaoAK ${config.kakaoKey}` } });
    requests++;
    cache.set(query, matchToiletAddress(data, query, new Date().toISOString()));
    if (requests % 20 === 0) { await save(); console.log(JSON.stringify({ processedAddresses: requests, remaining: missing.length - requests })); }
  }
} catch (error) {
  // Preserve progress without retry storms when the provider rejects/limits requests.
  await save();
  throw error;
}
await save();
const matched = rows.filter(row => cache.get(toiletAddressQuery(row.address!))).length;
console.log(JSON.stringify({ area, requests, matched, addressOnly: rows.length - matched }));
