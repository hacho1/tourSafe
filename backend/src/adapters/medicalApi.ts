import type { Coordinates, SupportFacility } from "../../../shared/models.js";
import { config } from "../config.js";
import { num, str } from "../utils/data.js";
import { haversine, validCoordinates } from "../utils/geo.js";
import { buildUrl, fetchData, publicItems } from "../utils/http.js";

export function normalizeMedical(
  rows: Record<string, unknown>[],
  center: Coordinates,
): SupportFacility[] {
  return rows
    .flatMap((r) => {
      const lat = num(r.latitude ?? r.wgs84Lat),
        lng = num(r.longitude ?? r.wgs84Lon),
        name = str(r.dutyName);
      if (!validCoordinates(lat, lng) || lng === null || !name) return [];
      const distanceMeters = haversine(center, { lat, lng });
      if (distanceMeters > 5000) return [];
      return [
        {
          id: `medical-${str(r.hpid) || `${lat}-${lng}`}`,
          name,
          lat,
          lng,
          type: "MEDICAL" as const,
          address: str(r.dutyAddr),
          phone: str(r.dutyTel3) || str(r.dutyTel1),
          source: {
            kind: "PUBLIC_DATA" as const,
            name: "국립중앙의료원 응급의료기관",
            url: "https://www.data.go.kr/data/15000563/openapi.do",
          },
          updatedAt: null,
          distanceMeters,
          distanceType: "STRAIGHT_LINE" as const,
          openingHours: null,
          holidays: null,
          languages: null,
          emergency: true,
        },
      ];
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 3);
}
export async function getMedical(
  center: Coordinates,
): Promise<SupportFacility[]> {
  const url = buildUrl(
    "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytLcinfoInqire",
    {
      serviceKey: config.medicalKey,
      WGS84_LON: center.lng,
      WGS84_LAT: center.lat,
      pageNo: 1,
      numOfRows: 30,
    },
  );
  return normalizeMedical(publicItems(await fetchData(url)), center);
}
