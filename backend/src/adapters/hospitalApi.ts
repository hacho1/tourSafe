import type { Coordinates, DataSource } from "../../../shared/models.js";
import type { Hospital, HospitalDay, HospitalHours } from "../../../shared/hospitals.js";
import { num, str } from "../utils/data.js";
import { haversine, validCoordinates } from "../utils/geo.js";
import { buildUrl, fetchData, invalidateFetchCache, publicBody, publicItems } from "../utils/http.js";

export type HospitalFetch = typeof fetchData;
export interface HospitalRegion extends Coordinates { province: string; district: string }
const BASE = "https://apis.data.go.kr/B552657/HsptlAsembySearchService";
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
export const HOSPITAL_SOURCE: DataSource = {
  kind: "PUBLIC_DATA",
  name: "국립중앙의료원 전국 병·의원 찾기",
  url: "https://www.data.go.kr/data/15000736/openapi.do",
};

const placeholders = /^(?:-|--|없음|미상|미제공|미확인|정보\s*없음|해당\s*없음|n\/?a|null|undefined|unknown|0)$/i;
function textValue(value: unknown): string | null {
  const text = str(value);
  return text && !placeholders.test(text) ? text : null;
}

/** The API uses HHmm; XML parsers may preserve or remove leading zeroes. */
export function parseHospitalTime(value: unknown, closing = false): number | null {
  const text = str(value);
  if (!text || !/^\d{1,4}$/.test(text)) return null;
  const padded = text.padStart(4, "0");
  const hours = Number(padded.slice(0, 2));
  const minutes = Number(padded.slice(2));
  if (closing && hours === 24 && minutes === 0) return 1440;
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

export function normalizeHospitalHours(row: Record<string, unknown>): HospitalHours[] {
  return Array.from({ length: 8 }, (_, index) => {
    const day = (index + 1) as HospitalDay;
    const opens = parseHospitalTime(row[`dutyTime${day}s`]);
    const closes = parseHospitalTime(row[`dutyTime${day}c`], true);
    // Missing/invalid pairs and equal endpoints do not establish closure or 24-hour service.
    if (opens === null || closes === null || opens === closes) {
      return { day, opens: null, closes: null, overnight: false };
    }
    return { day, opens, closes, overnight: closes < opens };
  });
}

export function normalizeHospitalDepartments(value: unknown): string[] {
  const text = textValue(value);
  if (!text) return [];
  return [...new Set(text.replace(/\bn\/a\b/gi, "").split(/[,|/]/)
    .map(textValue).filter((part): part is string => part !== null))];
}

export function normalizeHospitalList(rows: Record<string, unknown>[], origin: Coordinates): Hospital[] {
  const unique = new Map<string, Hospital>();
  for (const row of rows) {
    const id = textValue(row.hpid);
    const name = textValue(row.dutyName);
    const lat = num(row.wgs84Lat);
    const lng = num(row.wgs84Lon);
    if (!id || !name || !validCoordinates(lat, lng) || lng === null || unique.has(id)) continue;
    unique.set(id, {
      id, name, lat, lng,
      address: textValue(row.dutyAddr),
      phone: textValue(row.dutyTel1),
      departments: [],
      hours: normalizeHospitalHours({}),
      distanceMeters: haversine(origin, { lat, lng }),
      source: { ...HOSPITAL_SOURCE },
      updatedAt: null,
      detailStatus: "UNAVAILABLE",
    });
  }
  return [...unique.values()].sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
}

export function normalizeHospitalDetail(row: Record<string, unknown>, hospital: Hospital): Hospital {
  if (textValue(row.hpid) !== hospital.id) throw new Error("HOSPITAL_DETAIL_ID_MISMATCH");
  return {
    ...hospital,
    address: textValue(row.dutyAddr) ?? hospital.address,
    phone: textValue(row.dutyTel1) ?? hospital.phone,
    // dgidIdName is the documented department-name field. Do not infer from dutyName.
    departments: normalizeHospitalDepartments(row.dgidIdName),
    hours: normalizeHospitalHours(row),
    updatedAt: null,
    detailStatus: "OK",
  };
}

export async function getHospitalList(
  region: HospitalRegion,
  key: string,
  request: HospitalFetch = fetchData,
): Promise<{ hospitals: Hospital[]; partial: boolean }> {
  const rows: Record<string, unknown>[] = [];
  const requestedUrls: string[] = [];
  let total: number | null = null;
  let partial = false;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = buildUrl(`${BASE}/getHsptlMdcncListInfoInqire`, {
      serviceKey: key, Q0: region.province, Q1: region.district, pageNo: page, numOfRows: PAGE_SIZE,
    });
    const response = await request(url, { ttl: 10 * 60_000 });
    requestedUrls.push(url);
    let body: Record<string, unknown>;
    let pageRows: Record<string, unknown>[];
    try {
      body = publicBody(response);
      pageRows = publicItems(response);
    } catch (error) {
      invalidateFetchCache(url);
      throw error;
    }
    const reportedTotal = num(body.totalCount);
    if (reportedTotal === null || !Number.isSafeInteger(reportedTotal) || reportedTotal < 0) {
      partial = true;
    } else {
      if (total !== null && total !== reportedTotal) partial = true;
      total = Math.max(total ?? 0, reportedTotal);
    }
    if (pageRows.length > PAGE_SIZE) partial = true;
    rows.push(...pageRows.slice(0, PAGE_SIZE));
    if (pageRows.length === 0 || (total !== null && page * PAGE_SIZE >= total) ||
        (total === null && pageRows.length < PAGE_SIZE)) break;
  }
  const hospitals = normalizeHospitalList(rows, region);
  if (rows.length > 0 && hospitals.length === 0) {
    requestedUrls.forEach(invalidateFetchCache);
    throw new Error("HOSPITAL_LIST_UNUSABLE");
  }
  // Unknown totals, malformed/duplicate rows, and the pagination cap make completeness uncertain.
  partial ||= total === null || rows.length !== total || hospitals.length !== rows.length;
  return { hospitals, partial };
}

export async function getHospitalDetail(
  hospital: Hospital,
  key: string,
  request: HospitalFetch = fetchData,
): Promise<Hospital> {
  const url = buildUrl(`${BASE}/getHsptlBassInfoInqire`, {
    serviceKey: key, HPID: hospital.id, pageNo: 1, numOfRows: 1,
  });
  const response = await request(url, { ttl: 60 * 60_000 });
  try {
    const rows = publicItems(response);
    if (rows.length !== 1) throw new Error("HOSPITAL_DETAIL_UNAVAILABLE");
    return normalizeHospitalDetail(rows[0]!, hospital);
  } catch (error) {
    invalidateFetchCache(url);
    throw error;
  }
}
