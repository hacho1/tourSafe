import type {
  Evidence,
  Region,
  SearchOptions,
  TouristSpot,
} from "../../../shared/models.js";
import { config } from "../config.js";
import {
  confirmed,
  emptySafety,
  isoDate,
  num,
  plain,
  safeImage,
  str,
  unknown,
} from "../utils/data.js";
import { haversine, validCoordinates } from "../utils/geo.js";
import { buildUrl, fetchData, publicItems } from "../utils/http.js";

const source = {
  kind: "PUBLIC_DATA" as const,
  name: "한국관광공사 TourAPI",
  url: "https://api.visitkorea.or.kr/",
};
const common = () => ({
  serviceKey: config.tourKey,
  MobileOS: "ETC",
  MobileApp: "TourSafe",
  _type: "json",
  pageNo: 1,
  numOfRows: 30,
});
/** Resolve a bookmark by content ID, independently of a nearby search's eight-result cap. */
export async function getTouristIdentity(id: string, request: typeof fetchData = fetchData) {
  if (!/^\d{1,16}$/.test(id) || !config.tourKey) throw new Error('PLACE_UNAVAILABLE');
  const item = publicItems(await request(buildUrl(`${config.tourBase}/detailCommon2`, { ...common(), contentId: id })))[0];
  const lat = num(item?.mapy), lng = num(item?.mapx), name = plain(item?.title);
  if (!item || str(item.contentid) !== id || !name || !validCoordinates(lat, lng) || lng === null) throw new Error('PLACE_UNAVAILABLE');
  return { id, name, lat, lng, address: plain(item.addr1), phone: plain(item.tel), imageUrl: safeImage(item.firstimage), source };
}
export async function findTourRegions(query: string, request: typeof fetchData = fetchData): Promise<Region[]> {
  const rows = publicItems(await request(buildUrl(`${config.tourBase}/searchKeyword2`, {
    ...common(), keyword: query, numOfRows: 20, arrange: "A",
  })));
  return rows.flatMap(item => {
    const lat = num(item.mapy), lng = num(item.mapx), name = plain(item.title);
    if (!name || !validCoordinates(lat, lng) || lng === null) return [];
    return [{ name, address: plain(item.addr1) || "한국관광공사 장소", lat, lng }];
  });
}
export function parseOpenNow(
  hours: string | null,
  holidays: string | null,
  updatedAt: string | null,
  now = new Date(),
): Evidence<boolean> {
  // Free-form schedules with weekly, seasonal or holiday exceptions must stay UNKNOWN.
  if (!hours || !holidays || !/^(연중무휴|없음)$/.test(holidays.trim()))
    return unknown();
  if (/^(24시간|00:00\s*[~–-]\s*24:00)$/.test(hours.trim()))
    return confirmed(true, source, updatedAt);
  const match = /^(\d{2}):(\d{2})\s*[~–-]\s*(\d{2}):(\d{2})$/.exec(
    hours.trim(),
  );
  if (!match) return unknown();
  const [sh, sm, eh, em] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
  ];
  if (sh > 23 || eh > 24 || sm > 59 || em > 59 || (eh === 24 && em !== 0))
    return unknown();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const minute = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const start = sh * 60 + sm,
    end = eh * 60 + em;
  if (start === end) return unknown();
  return confirmed(
    start < end
      ? minute >= start && minute < end
      : minute >= start || minute < end,
    source,
    updatedAt,
  );
}
export async function getTouristSpots(
  options: SearchOptions,
  request: typeof fetchData = fetchData,
): Promise<TouristSpot[]> {
  // Filter at the provider: nearby restaurants/shops must not exhaust the first page.
  const lists = await Promise.all(["12", "14", "28"].map(async contentTypeId => publicItems(await request(
    buildUrl(`${config.tourBase}/locationBasedList2`, {
      ...common(), numOfRows: 8, contentTypeId,
      mapX: options.lng, mapY: options.lat, radius: options.radius, arrange: "E",
    }),
  ))));
  const unique = new Map<string, Record<string, unknown>>();
  for (const item of lists.flat()) {
    const id = str(item.contentid), lat = num(item.mapy), lng = num(item.mapx);
    if (!id || !plain(item.title) || !["12", "14", "28"].includes(str(item.contenttypeid) || "") || !validCoordinates(lat, lng) || lng === null) continue;
    if (haversine(options, { lat, lng }) <= options.radius && !unique.has(id)) unique.set(id, item);
  }
  const candidates = [...unique.values()].sort((a, b) =>
    haversine(options, { lat: num(a.mapy)!, lng: num(a.mapx)! }) - haversine(options, { lat: num(b.mapy)!, lng: num(b.mapx)! }),
  ).slice(0, 8);
  const results = await Promise.all(
    candidates.map(async (item): Promise<TouristSpot | null> => {
      const lat = num(item.mapy),
        lng = num(item.mapx),
        id = str(item.contentid),
        name = plain(item.title);
      if (!validCoordinates(lat, lng) || lng === null || !id || !name)
        return null;
      const type = str(item.contenttypeid)!;
      const detailParams = { ...common(), contentId: id, contentTypeId: type };
      const [detail, intro] = await Promise.allSettled([
        request(
          buildUrl(`${config.tourBase}/detailCommon2`, {
            ...common(), contentId: id,
          }),
        ).then(value => publicItems(value)[0] || {}),
        request(buildUrl(`${config.tourBase}/detailIntro2`, detailParams)).then(value => publicItems(value)[0] || {}),
      ]);
      const d =
        detail.status === "fulfilled" ? detail.value : {};
      const i =
        intro.status === "fulfilled" ? intro.value : {};
      const updatedAt = isoDate(d.modifiedtime ?? item.modifiedtime);
      const hours = plain(i.usetime ?? i.usetimeculture ?? i.usetimeleports);
      const holidays = plain(
        i.restdate ?? i.restdateculture ?? i.restdateleports,
      );
      const coords = { lat, lng };
      return {
        ...coords,
        id,
        name,
        address: plain(d.addr1 ?? item.addr1),
        phone: plain(d.tel ?? item.tel ?? i.infocenter ?? i.infocenterculture),
        description: plain(d.overview),
        imageUrl: safeImage(d.firstimage ?? item.firstimage),
        category:
          type === "14" ? "문화시설" : type === "28" ? "레포츠" : "관광지",
        indoor: null,
        source,
        updatedAt,
        openingHours: hours ? confirmed(hours, source, updatedAt) : unknown(),
        holidays: holidays ? confirmed(holidays, source, updatedAt) : unknown(),
        openNow: parseOpenNow(hours, holidays, updatedAt),
        closure: unknown(),
        safety: emptySafety(),
        distanceMeters: haversine(options, coords),
      };
    }),
  );
  return results.filter(
    (r): r is TouristSpot => r !== null && r.distanceMeters <= options.radius,
  );
}
