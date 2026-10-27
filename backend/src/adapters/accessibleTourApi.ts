import type { PlaceAmenities, TouristSpot } from '../../../shared/models.js';
import { config } from '../config.js';
import { confirmed, plain, str } from '../utils/data.js';
import { buildUrl, fetchData, invalidateFetchCache, publicItems } from '../utils/http.js';
import { listedAmenities, nursingEvidence } from '../utils/visitFacilities.js';

const source = { kind: 'PUBLIC_DATA' as const, name: '한국관광공사 · 무장애 여행 정보', url: 'https://www.data.go.kr/data/15101897/openapi.do' };
const fields = [
  ['route', '접근로'], ['exit', '출입구'], ['stroller', '유모차 대여·이용 안내'],
  ['lactationroom', '수유실'], ['restroom', '화장실'], ['elevator', '엘리베이터'],
  ['wheelchair', '휠체어 대여·이용 안내'], ['parking', '장애인 주차'],
  ['babysparechair', '유아 의자'], ['infantsfamilyetc', '영유아 동반 안내'], ['handicapetc', '기타 접근성'],
] as const;

export function normalizeAccessibleTour(id: string, data: unknown): PlaceAmenities {
  const items = publicItems(data);
  if (!items.length) return { safety: {}, details: [] };
  if (items.length !== 1 || str(items[0]!.contentid) !== id) throw new Error('ACCESSIBLE_PLACE_MISMATCH');
  const row = items[0]!;
  // detailWithTour2 does not supply a source update timestamp. Do not borrow the base place date.
  const details = fields.flatMap(([key, label]) => {
    const text = plain(row[key]);
    return text ? [{ id: `accessible-${key}`, label, text, source, updatedAt: null }] : [];
  });
  const safety: PlaceAmenities['safety'] = {};
  const toilet = plain(row.restroom);
  if (toilet && listedAmenities(toilet, source, null).toilet) safety.toilet = confirmed(true, source);
  const nursing = plain(row.lactationroom);
  if (nursing) { const fact = nursingEvidence(nursing, source); if (fact) safety.nursingRoom = fact; }
  // Stroller rental and a ramp at the entrance do not establish a usable route throughout a place.
  return { safety, details };
}
export async function getAccessibleTour(spot: Pick<TouristSpot, 'id'>, request: typeof fetchData = fetchData): Promise<PlaceAmenities> {
  if (!/^\d{1,16}$/.test(spot.id) || !config.accessibleTourKey) throw new Error('ACCESSIBLE_NOT_CONFIGURED');
  const url = buildUrl(`${config.accessibleTourBase}/detailWithTour2`, {
    serviceKey: config.accessibleTourKey, MobileOS: 'ETC', MobileApp: 'TourSafe', _type: 'json', contentId: spot.id,
  });
  try { return normalizeAccessibleTour(spot.id, await request(url, { ttl: 24 * 3600_000 })); }
  catch (error) { invalidateFetchCache(url); throw error; }
}
