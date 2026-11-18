import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import type { PlaceAmenities, TouristSpot } from '../../../shared/models.js';
import { config } from '../config.js';
import { isoDate, num, plain } from '../utils/data.js';
import { haversine, validCoordinates } from '../utils/geo.js';
import { listedAmenities } from '../utils/visitFacilities.js';

const source = { kind: 'PUBLIC_DATA' as const, name: '전국관광지정보표준데이터', url: 'https://www.data.go.kr/data/15021141/standard.do' };
const facilityColumns = ['공공편익시설정보', '지원시설정보', '휴양및문화시설정보'] as const;
export interface TourismStandardRow {
  name: string; addresses: string[]; lat: number | null; lng: number | null;
  updatedAt: string | null; fields: { label: string; text: string }[];
}
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s·ㆍ.,()\[\]{}'"-]/g, '');
export function parseTourismStandard(bytes: Uint8Array): TourismStandardRow[] {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder('euc-kr', { fatal: true }).decode(bytes); }
  const rows = parse(text, { bom: true, skip_empty_lines: true, trim: true, columns: (columns: string[]) => {
    if (!['관광지명', '소재지도로명주소', '위도', '경도', '공공편익시설정보', '데이터기준일자'].every(key => columns.includes(key))) throw new Error('TOURISM_CSV_COLUMNS');
    return columns;
  } }) as Record<string, string>[];
  if (!rows.length || rows.length > 100_000) throw new Error('TOURISM_CSV_SIZE');
  return rows.flatMap(row => {
    const name = plain(row['관광지명']), lat = num(row['위도']), lng = num(row['경도']);
    const addresses = [plain(row['소재지도로명주소']), plain(row['소재지지번주소'])].filter((s): s is string => !!s);
    const located = validCoordinates(lat, lng) && lng !== null;
    if (!name || (!located && !addresses.length)) return [];
    return [{ name, addresses, lat: located ? lat : null, lng: located ? lng : null, updatedAt: isoDate(row['데이터기준일자']),
      fields: facilityColumns.flatMap(label => { const text = plain(row[label]); return text && !/^(없음|해당없음|미제공|-)$/.test(text) ? [{ label, text }] : []; }),
    }];
  });
}
export function matchTourismStandard(spot: Pick<TouristSpot, 'name' | 'address' | 'lat' | 'lng'>, rows: TourismStandardRow[]): TourismStandardRow | null {
  const candidates = rows.filter(row => {
    if (normalize(spot.name) !== normalize(row.name)) return false;
    const sameAddress = !!spot.address && row.addresses.some(address => normalize(address) === normalize(spot.address!));
    if (row.lat === null || row.lng === null) return sameAddress;
    const meters = haversine(spot, { lat: row.lat, lng: row.lng });
    return meters <= 150 || (sameAddress && meters <= 1500);
  });
  // Multiple matches are intentionally unresolved, including conflicting duplicate submissions.
  return candidates.length === 1 ? candidates[0]! : null;
}
export function tourismAmenities(spot: Pick<TouristSpot, 'name' | 'address' | 'lat' | 'lng'>, rows: TourismStandardRow[]): PlaceAmenities {
  const match = matchTourismStandard(spot, rows);
  if (!match) return { safety: {}, details: [] };
  return {
    safety: listedAmenities(match.fields.map(field => field.text).join('\n'), source, match.updatedAt),
    details: match.fields.map((field, index) => ({ id: `tourism-standard-${index}`, label: field.label, text: field.text, source, updatedAt: match.updatedAt })),
  };
}
export const hasTourismStandardData = () => existsSync(config.tourismStandardFile);
let cache: { stamp: string; pending: Promise<TourismStandardRow[]> } | undefined;
export async function loadTourismStandard(): Promise<TourismStandardRow[]> {
  const file = config.tourismStandardFile;
  const info = await stat(file);
  if (info.size > 30_000_000) throw new Error('TOURISM_CSV_SIZE');
  const stamp = `${file}:${info.size}:${info.mtimeMs}`;
  if (cache?.stamp === stamp) return cache.pending;
  const pending = readFile(file).then(parseTourismStandard);
  cache = { stamp, pending };
  try { return await pending; } catch (error) { if (cache?.stamp === stamp) cache = undefined; throw error; }
}
export async function getTourismAmenities(spot: TouristSpot): Promise<PlaceAmenities> {
  return tourismAmenities(spot, await loadTourismStandard());
}
