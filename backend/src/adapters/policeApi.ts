import type { Coordinates, SupportFacility } from "../../../shared/models.js";
import { num, str } from "../utils/data.js";
import { haversine, validCoordinates } from "../utils/geo.js";
import { kakaoSearch } from "./kakaoMapApi.js";

export async function getPolice(
  center: Coordinates,
): Promise<SupportFacility[]> {
  const results = await Promise.all(
    ["경찰서", "지구대", "파출소"].map((query) => kakaoSearch(query, center)),
  );
  const unique = new Map<string, SupportFacility>();
  for (const r of results.flat()) {
    const lat = num(r.y),
      lng = num(r.x),
      id = str(r.id),
      name = str(r.place_name);
    if (
      !validCoordinates(lat, lng) ||
      lng === null ||
      !id ||
      !name ||
      !/경찰|지구대|파출소/.test(str(r.category_name) || "")
    )
      continue;
    const distanceMeters = haversine(center, { lat, lng });
    if (distanceMeters > 5000) continue;
    unique.set(id, {
      id: `kakao-${id}`,
      name,
      lat,
      lng,
      type: "POLICE",
      address: str(r.road_address_name) || str(r.address_name),
      phone: str(r.phone),
      source: {
        kind: "KAKAO_MAP",
        name: "Kakao 장소검색",
        url: "https://developers.kakao.com/docs/ko/local/dev-guide",
      },
      updatedAt: null,
      distanceMeters,
      distanceType: "STRAIGHT_LINE",
      openingHours: null,
      holidays: null,
      languages: null,
      emergency: null,
    });
  }
  return [...unique.values()]
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 3);
}
