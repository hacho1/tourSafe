import type {
  Coordinates,
  FacilityType,
  SupportFacility,
} from "../../../shared/models.js";
import { isoDate, num, str } from "../utils/data.js";
import { haversine, validCoordinates } from "../utils/geo.js";
import { buildUrl, fetchData, publicBody, publicItems } from "../utils/http.js";

const snapshots = new Map<
  string,
  { expires: number; promise: Promise<Record<string, unknown>[]> }
>();
async function dataset(
  endpoint: string,
  serviceKey: string,
): Promise<Record<string, unknown>[]> {
  const existing = snapshots.get(endpoint);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = (async () => {
    const getPage = (pageNo: number) =>
      fetchData(
        buildUrl(endpoint, {
          serviceKey,
          type: "json",
          pageNo,
          numOfRows: 1000,
        }),
        { ttl: 24 * 3600_000 },
      );
    const first = await getPage(1);
    const total = num(publicBody(first).totalCount);
    if (total === null || total > 100000)
      throw new Error("STANDARD_DATA_PAGINATION_UNVERIFIED");
    const rows = publicItems(first),
      pages = Math.ceil(total / 1000);
    for (let p = 2; p <= pages; p += 4) {
      const group = Array.from({ length: Math.min(4, pages - p + 1) }, (_, i) =>
        getPage(p + i),
      );
      for (const result of await Promise.all(group))
        rows.push(...publicItems(result));
    }
    if (rows.length < total) throw new Error("STANDARD_DATA_INCOMPLETE");
    return rows;
  })();
  snapshots.set(endpoint, { expires: Date.now() + 24 * 3600_000, promise });
  try {
    return await promise;
  } catch (error) {
    snapshots.delete(endpoint);
    throw error;
  }
}
export function normalizeStandard(
  rows: Record<string, unknown>[],
  type: Extract<FacilityType, "TOURIST_INFO" | "TOILET">,
  center: Coordinates,
): SupportFacility[] {
  return rows
    .flatMap((r) => {
      const lat = num(r.latitude),
        lng = num(r.longitude),
        name = str(type === "TOURIST_INFO" ? r.trsmicNm : r.toiletNm);
      if (!validCoordinates(lat, lng) || lng === null || !name) return [];
      const distanceMeters = haversine(center, { lat, lng });
      if (distanceMeters > 5000) return [];
      const hours =
        type === "TOURIST_INFO"
          ? [
              str(r.summerOperOpenHhmm) &&
                `하절기 ${r.summerOperOpenHhmm}–${str(r.summerOperCloseHhmm) || "미확인"}`,
              str(r.winterOperOpenHhmm) &&
                `동절기 ${r.winterOperOpenHhmm}–${str(r.winterOperCloseHhmm) || "미확인"}`,
            ]
              .filter(Boolean)
              .join(" / ")
          : str(r.openTime);
      return [
        {
          id: `${type}-${lat}-${lng}-${name}`,
          type,
          lat,
          lng,
          name,
          address: str(r.rdnmadr) || str(r.lnmadr),
          phone: str(
            type === "TOURIST_INFO" ? r.guidancePhoneNumber : r.phoneNumber,
          ),
          source: {
            kind: "PUBLIC_DATA" as const,
            name:
              type === "TOURIST_INFO"
                ? "전국관광안내소표준데이터"
                : "전국공중화장실표준데이터",
            url:
              type === "TOURIST_INFO"
                ? "https://www.data.go.kr/data/15013112/standard.do"
                : "https://www.data.go.kr/data/15012892/standard.do",
          },
          updatedAt: isoDate(r.referenceDate),
          distanceMeters,
          distanceType: "STRAIGHT_LINE" as const,
          openingHours: hours || null,
          holidays: str(r.rstde),
          languages: str(r.guidanceFggg),
          emergency: null,
        },
      ];
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 3);
}
export async function getStandardFacilities(
  endpoint: string,
  key: string,
  type: Extract<FacilityType, "TOURIST_INFO" | "TOILET">,
  center: Coordinates,
) {
  return normalizeStandard(await dataset(endpoint, key), type, center);
}
