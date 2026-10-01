import type {
  Evidence,
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
): Promise<TouristSpot[]> {
  const data = await fetchData(
    buildUrl(`${config.tourBase}/locationBasedList2`, {
      ...common(),
      mapX: options.lng,
      mapY: options.lat,
      radius: options.radius,
      arrange: "E",
    }),
  );
  const candidates = publicItems(data)
    .filter((item) =>
      ["12", "14", "28"].includes(str(item.contenttypeid) || ""),
    )
    .slice(0, 8);
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
        fetchData(
          buildUrl(`${config.tourBase}/detailCommon2`, {
            ...detailParams,
            defaultYN: "Y",
            firstImageYN: "Y",
            addrinfoYN: "Y",
            overviewYN: "Y",
            mapinfoYN: "Y",
          }),
        ),
        fetchData(buildUrl(`${config.tourBase}/detailIntro2`, detailParams)),
      ]);
      const d =
        detail.status === "fulfilled" ? publicItems(detail.value)[0] || {} : {};
      const i =
        intro.status === "fulfilled" ? publicItems(intro.value)[0] || {} : {};
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
