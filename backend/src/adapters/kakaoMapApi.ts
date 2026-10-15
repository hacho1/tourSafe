import type { Coordinates, Region } from "../../../shared/models.js";
import { config } from "../config.js";
import { list, num, record, str } from "../utils/data.js";
import { validCoordinates } from "../utils/geo.js";
import { buildUrl, fetchData } from "../utils/http.js";

export async function kakaoSearch(query: string, center?: Coordinates) {
  const params: Record<string, string | number> = { query, size: 10 };
  if (center)
    Object.assign(params, {
      x: center.lng,
      y: center.lat,
      radius: 5000,
      sort: "distance",
    });
  const data = await fetchData(
    buildUrl("https://dapi.kakao.com/v2/local/search/keyword.json", params),
    { headers: { Authorization: `KakaoAK ${config.kakaoKey}` } },
  );
  return list(record(data).documents);
}
export async function findRegions(query: string): Promise<Region[]> {
  const results = await kakaoSearch(query);
  return results.flatMap((r) => {
    const lat = num(r.y),
      lng = num(r.x),
      name = str(r.place_name);
    return validCoordinates(lat, lng) && lng !== null && name
      ? [
          {
            lat,
            lng,
            name,
            address: str(r.road_address_name) || str(r.address_name),
          },
        ]
      : [];
  });
}

export interface CoordinateRegion {
  province: string;
  district: string;
  area: string;
}

// Keep the requested coordinates as the search origin; Kakao's returned x/y is
// an administrative area's representative point, not the user's position.
export async function regionAtCoordinates(
  point: Coordinates,
  request: typeof fetchData = fetchData,
): Promise<CoordinateRegion> {
  if (!validCoordinates(point.lat, point.lng)) throw new Error('INVALID_COORDINATES');
  if (!config.kakaoKey) throw new Error('REGION_LOOKUP_NOT_CONFIGURED');
  const data = await request(buildUrl('https://dapi.kakao.com/v2/local/geo/coord2regioncode.json', {
    x: point.lng, y: point.lat,
  }), { headers: { Authorization: `KakaoAK ${config.kakaoKey}` }, ttl: 10 * 60_000 });
  const region = list(record(data).documents).find(row => row.region_type === 'B');
  const province = str(region?.region_1depth_name);
  const district = str(region?.region_2depth_name) || '';
  if (!province || (!district && province !== '세종특별자치시')) throw new Error('REGION_NOT_FOUND');
  return { province, district, area: [province, district].filter(Boolean).join(' ') };
}
