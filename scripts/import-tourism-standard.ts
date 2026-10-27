import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseTourismStandard } from '../backend/src/adapters/tourismStandard.js';
import { config } from '../backend/src/config.js';

const input = process.argv[2];
if (!input) throw new Error('Usage: npm run import:tourism -- <전국관광지정보표준데이터.csv>');
const from = resolve(input), to = resolve(config.tourismStandardFile);
const bytes = await readFile(from);
const rows = parseTourismStandard(bytes);
if (!rows.length) throw new Error('No usable tourism rows');
await mkdir(dirname(to), { recursive: true });
if (from !== to) await copyFile(from, to);
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
if (hash(bytes) !== hash(await readFile(to))) throw new Error('Import verification failed');
console.log(JSON.stringify({ file: to, rows: rows.length, sha256: hash(bytes) }, null, 2));
