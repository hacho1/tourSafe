import { HOSPITAL_REGIONS, type Hospital, type HospitalDay, type HospitalHours, type HospitalRegionId, type HospitalResponse } from "../../../shared/hospitals";
import { phoneLink } from "./format";
import type { Coordinates } from '../../../shared/models';

export const ALL_DEPARTMENTS = "all";
export const UNKNOWN_DEPARTMENT = "unknown";

export function hospitalDepartments(hospital: Hospital): string[] {
  return [...new Set(hospital.departments.map((value) => value.trim()).filter(Boolean))];
}

export function departmentOptions(hospitals: Hospital[]): string[] {
  return [...new Set(hospitals.flatMap(hospitalDepartments))].sort((a, b) => a.localeCompare(b, "ko"));
}

export function filterHospitals(hospitals: Hospital[], filter: string): Hospital[] {
  if (filter === ALL_DEPARTMENTS) return hospitals;
  if (filter === UNKNOWN_DEPARTMENT) return hospitals.filter((hospital) => hospitalDepartments(hospital).length === 0);
  if (!filter.startsWith("department:")) return [];
  const department = filter.slice("department:".length);
  return hospitals.filter((hospital) => hospitalDepartments(hospital).includes(department));
}

/** The select and displayed results must agree if refreshed departments change. */
export function resolveHospitalDepartment(hospitals: Hospital[], requested: string): string {
  if (requested === ALL_DEPARTMENTS || requested === UNKNOWN_DEPARTMENT) return requested;
  return requested.startsWith("department:") &&
    departmentOptions(hospitals).includes(requested.slice("department:".length))
    ? requested : ALL_DEPARTMENTS;
}

export function currentHospitalDay(now = new Date()): HospitalDay {
  const weekday = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
  return (weekday === 0 ? 7 : weekday) as HospitalDay;
}

const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function hospitalHoursLabel(hours: HospitalHours | undefined): string {
  if (!hours || hours.opens === null || hours.closes === null ||
    !Number.isInteger(hours.opens) || !Number.isInteger(hours.closes) ||
    hours.opens < 0 || hours.opens >= 1440 || hours.closes < 0 || hours.closes > 1440 ||
    (hours.opens === 0 && hours.closes === 0)) return "정보 없음";
  const nextDay = hours.overnight || hours.closes < hours.opens || hours.closes === 1440;
  const closing = hours.closes === 1440 ? "00:00" : clock(hours.closes);
  return `${clock(hours.opens)} – ${nextDay ? "다음 날 " : ""}${closing}`;
}

export function hospitalTimestamp(value: string | null): string {
  if (!value || Number.isNaN(new Date(value).getTime())) return "미제공";
  // A date-only publication does not establish a midnight observation time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

export function hospitalContactLinks(hospital: Hospital, mode: HospitalResponse["mode"]) {
  if (mode !== "LIVE" || hospital.source.kind !== "PUBLIC_DATA") return { phone: null, map: null };
  const query = [hospital.address, hospital.name].filter(Boolean).join(" ").trim();
  return {
    phone: phoneLink(hospital.phone),
    map: hospital.name.trim() && query ? `https://map.kakao.com/link/search/${encodeURIComponent(query)}` : null,
  };
}

/** Fail closed before showing a response under the selected region. */
export function hospitalResponseIssue(response: HospitalResponse, target: HospitalRegionId | Coordinates): string | null {
  const regionId = typeof target === 'string' ? target : 'nearby';
  const region = typeof target === 'string' ? HOSPITAL_REGIONS.find(item => item.id === target)! : target;
  if (response.regionId !== regionId || !response.origin ||
      !Number.isFinite(response.origin.lat) || !Number.isFinite(response.origin.lng) ||
      Math.abs(response.origin.lat - region.lat) > 0.0000001 ||
      Math.abs(response.origin.lng - region.lng) > 0.0000001) {
    return "조회 지역과 결과의 기준점이 달라 결과를 표시하지 않았어요. 다시 조회해 주세요.";
  }
  if (!["LIVE", "DEMO"].includes(response.mode) ||
      !["OK", "NOT_CONFIGURED"].includes(response.status) || !Array.isArray(response.hospitals)) {
    return "병원 정보를 확인할 수 없어요. 잠시 후 다시 조회해 주세요.";
  }
  if (response.mode === "LIVE" && response.hospitals.some((hospital) => hospital.source.kind === "DEMO_DATA")) {
    return "실제 조회에 예시 자료가 포함되어 결과를 표시하지 않았어요.";
  }
  if (response.mode === "DEMO" && regionId !== "seongsu" && response.hospitals.length > 0) {
    return "선택한 지역의 예시 자료를 확인할 수 없어요. 성동구 예시를 이용해 주세요.";
  }
  return null;
}
