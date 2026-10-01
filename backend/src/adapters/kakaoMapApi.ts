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
