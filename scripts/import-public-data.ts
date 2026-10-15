import { createReadStream } from 'node:fs';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, basename } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';
import { district, districtFile, normalizePublicRow, tileKey } from '../backend/src/utils/publicCsv.js';
import type { PublicFacilityRecord } from '../shared/mapFacilities.js';

// Usage: npm run import:data -- --cctv path.csv --tourist-info path.csv --toilets path.csv
const args = process.argv.slice(2);
const output = resolve('backend/data/public-facilities');
const version = new Date().toISOString().replace(/[:.]/g, '-');
const directory = join(output, version);
const tiles = new Map<string, PublicFacilityRecord[]>();
const addresses = new Map<string, PublicFacilityRecord[]>();
const seen = new Set<string>();
const files = [];
for (const [flag, type] of [['--cctv', 'CCTV'], ['--tourist-info', 'TOURIST_INFO'], ['--toilets', 'TOILET']] as const) {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1] || args[index + 1]!.startsWith('--')) throw new Error(`Missing ${flag} CSV path`);
  const filename = resolve(args[index + 1]!);
  // Public exports use EUC-KR; accept UTF-8 exports as well.
  const handle = await open(filename, 'r');
  const sample = Buffer.alloc(4096);
  try { await handle.read(sample, 0, sample.length, 0); } finally { await handle.close(); }
  const encoding = new TextDecoder('utf-8').decode(sample, { stream: true }).includes('�') ? 'euc-kr' : 'utf-8';
  const decoder = new TextDecoder(encoding);
  const hash = createHash('sha256');
  let rows = 0, located = 0, unlocated = 0, rejected = 0, duplicates = 0;
  const decode = new Transform({
    transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, decoder.decode(chunk, { stream: true })); },
    flush(callback) { callback(null, decoder.decode()); },
  });
  await pipeline(createReadStream(filename), decode, parse({ columns: (header: string[]) => {
    const required = type === 'CCTV' ? ['관리번호', 'WGS84위도', 'WGS84경도'] : type === 'TOURIST_INFO' ? ['관광안내소명', '위도', '경도'] : ['화장실명'];
    if (!required.every(name => header.includes(name)) || !header.includes('소재지도로명주소')) throw new Error(`Unexpected ${type} CSV columns`);
    return header;
  }, bom: true, trim: true, skip_empty_lines: true }), async source => {
    for await (const row of source) {
      rows++;
      const record = normalizePublicRow(row as Record<string, string>, type);
      if (!record) { rejected++; continue; }
      if (seen.has(record.id)) { duplicates++; continue; }
      seen.add(record.id);
      if (record.lat !== null && record.lng !== null) {
        const key = tileKey(record.lat, record.lng);
        if (!tiles.has(key)) tiles.set(key, []);
        tiles.get(key)!.push(record);
        located++;
      } else {
        unlocated++;
        if (type === 'TOILET') {
          const key = district(record.address);
          if (!addresses.has(key)) addresses.set(key, []);
          addresses.get(key)!.push(record);
        }
      }
    }
  });
  if (!rows || rows === rejected) throw new Error(`No usable ${type} records`);
  files.push({ file: basename(filename), type, encoding, sha256: hash.digest('hex'), rows, located, unlocated, rejected, duplicates });
}
await mkdir(join(directory, 'tiles'), { recursive: true });
await mkdir(join(directory, 'addresses'), { recursive: true });
for (const [key, records] of tiles) await writeFile(join(directory, 'tiles', `${key}.json`), JSON.stringify(records));
for (const [area, records] of addresses) await writeFile(join(directory, 'addresses', `${districtFile(area)}.json`), JSON.stringify(records));
// Publish only after every data file is ready. Previous imports remain recoverable.
const manifest = { version, importedAt: new Date().toISOString(), files, tiles: [...tiles.keys()], areas: [...addresses.keys()] };
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest.files, null, 2));
