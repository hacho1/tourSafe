import { readFile, writeFile, appendFile, mkdir, rename, open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../backend/src/config.js';
import { districtFile, tileKey } from '../backend/src/utils/publicCsv.js';
import { buildUrl, fetchData } from '../backend/src/utils/http.js';
import { applyToiletGeocoding, hasProvince, matchToiletAddress, toiletAddressQuery, toiletAreaKey, TOILET_GEOCODING_FILE, NATIONAL_TOILET_DIRECTORY, type NationalToiletManifest } from '../backend/src/utils/toiletGeocoding.js';
import type { AddressLocation, PublicFacilityRecord } from '../shared/mapFacilities.js';

const root = resolve(process.env.PUBLIC_FACILITIES_DIR || 'backend/data/public-facilities');
const source = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
if (!/^[\dTZ-]+$/.test(source.version) || !Array.isArray(source.areas)) throw new Error('PUBLIC_IMPORT_REQUIRED');
const directory = join(root, NATIONAL_TOILET_DIRECTORY);
await mkdir(directory, { recursive: true });
const journal = join(directory, `requests-${source.version}.jsonl`);
const rows: PublicFacilityRecord[] = [];
for (const area of source.areas) rows.push(...JSON.parse(await readFile(join(root, source.version, 'addresses', `${districtFile(area)}.json`), 'utf8')));
if (!rows.length || rows.length > 100000 || rows.some(row => row.type !== 'TOILET' || typeof row.address !== 'string')) throw new Error('UNEXPECTED_TOILET_DATA');
const cache = new Map<string, AddressLocation | null>();
let repairedJournal: string | null = null;
try {
  const legacy = JSON.parse(await readFile(join(root, TOILET_GEOCODING_FILE), 'utf8'));
  if (legacy.sourceVersion === source.version) for (const item of legacy.results) cache.set(toiletAddressQuery(item.address), item.location);
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
try {
  const lines = (await readFile(journal, 'utf8')).split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    try { const item = JSON.parse(lines[i]!); cache.set(item.query, item.location); }
    catch { if (i !== lines.length - 1) throw new Error('CORRUPT_GEOCODING_JOURNAL'); repairedJournal = lines.slice(0, -1).join('\n'); }
  }
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const queries = [...new Set(rows.map(row => toiletAddressQuery(row.address!)))];
for (const query of queries) if (!hasProvince(query)) cache.set(query, null);
const missing = queries.filter(query => !cache.has(query));
const argument = process.argv.find(arg => arg.startsWith('--max-requests='));
const budget = argument ? Number(argument.split('=')[1]) : 45000;
if (!Number.isInteger(budget) || budget < 0 || budget > 90000) throw new Error('INVALID_REQUEST_BUDGET');
const pending = missing.slice(0, budget);
console.log(JSON.stringify({ records: rows.length, uniqueAddresses: queries.length, uncachedAddresses: missing.length, requestBudget: budget, plannedRequests: pending.length, mode: process.argv.includes('--run') ? 'run' : 'preview' }));
if (!process.argv.includes('--run')) process.exit(0);
if (pending.length && !config.kakaoKey) throw new Error('KAKAO_REST_API_KEY_REQUIRED');
const lockPath = join(directory, 'run.lock');
const lock = await open(lockPath, 'wx'); // A second process must not double-spend the budget.
await lock.writeFile(String(process.pid));
await lock.close();
if (repairedJournal !== null) await writeFile(journal, repairedJournal);
let completed = 0, stopped = false, failure: unknown;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });

async function publish() {
  // Build immutable spatial tiles; the small manifest is swapped only when complete.
  const version = new Date().toISOString().replace(/[:.]/g, '-');
  const output = join(directory, version);
  await mkdir(join(output, 'tiles'), { recursive: true });
  await mkdir(join(output, 'addresses'), { recursive: true });
  const enriched = applyToiletGeocoding(rows, { schemaVersion: 1, sourceVersion: source.version, area: '전국', results: rows.map(row => ({ id: row.id, address: row.address, location: cache.get(toiletAddressQuery(row.address!)) ?? null })) }, source.version);
  const tiles = new Map<string, PublicFacilityRecord[]>(), areas = new Map<string, PublicFacilityRecord[]>();
  let located = 0;
  for (const row of enriched) {
    if (row.addressLocation && row.lat !== null && row.lng !== null) {
      const key = tileKey(row.lat, row.lng); if (!tiles.has(key)) tiles.set(key, []); tiles.get(key)!.push(row); located++;
    } else {
      // Match region lookup's province spelling and city prefixes, including cities with gu.
      const key = toiletAreaKey(row.address!);
      if (!areas.has(key)) areas.set(key, []); areas.get(key)!.push(row);
    }
  }
  const files = [...tiles].map(([key, value]) => ({ path: join(output, 'tiles', `${key}.json`), value }))
    .concat([...areas].map(([key, value]) => ({ path: join(output, 'addresses', `${districtFile(key)}.json`), value })));
  for (let i = 0; i < files.length; i += 32) await Promise.all(files.slice(i, i + 32).map(file => writeFile(file.path, JSON.stringify(file.value))));
  const manifest: NationalToiletManifest = { schemaVersion: 2, sourceVersion: source.version, version, generatedAt: new Date().toISOString(), tiles: [...tiles.keys()], areas: [...areas.keys()], total: rows.length, located, addressOnly: rows.length - located };
  const path = join(directory, 'manifest.json');
  await writeFile(`${path}.${process.pid}.tmp`, JSON.stringify(manifest));
  await rename(`${path}.${process.pid}.tmp`, path);
  console.log(JSON.stringify({ published: true, ...manifest, tiles: tiles.size, areas: areas.size, attemptedAddresses: completed, remainingUnprocessed: missing.length - completed }));
}
try {
  // Eight concurrent requests, at most 64 starts/second. Stop on any upstream error.
  for (let i = 0; i < pending.length && !stopped; i += 8) {
    const started = Date.now(), batch = pending.slice(i, i + 8);
    const results = await Promise.allSettled(batch.map(async query => {
      const data = await fetchData(buildUrl('https://dapi.kakao.com/v2/local/search/address.json', { query, analyze_type: 'exact', size: 2 }), { headers: { Authorization: `KakaoAK ${config.kakaoKey}` } });
      return { query, location: matchToiletAddress(data, query, new Date().toISOString()) };
    }));
    const accepted = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (accepted.length) {
      await appendFile(journal, '\n' + accepted.map(item => JSON.stringify(item)).join('\n'));
      for (const item of accepted) cache.set(item.query, item.location);
    }
    completed += accepted.length;
    const rejected = results.find(result => result.status === 'rejected');
    if (rejected?.status === 'rejected') { failure = rejected.reason; break; }
    if (completed % 1000 === 0 || completed === pending.length) console.log(JSON.stringify({ processed: completed, remaining: missing.length - completed, matchedAddresses: [...cache.values()].filter(Boolean).length }));
    await delay(Math.max(0, 125 - (Date.now() - started)));
  }
  await publish();
  if (failure) throw failure;
} finally { await unlink(lockPath); }
