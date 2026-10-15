import type { Coordinates, DataSource } from "./models.js";

export const HOSPITAL_REGIONS = [
  { id: "seongsu", name: "서울 성동구", province: "서울특별시", district: "성동구", originName: "성수 기준점", lat: 37.5445, lng: 127.0374 },
  { id: "jongno", name: "서울 종로구", province: "서울특별시", district: "종로구", originName: "광화문 기준점", lat: 37.5759, lng: 126.9769 },
  { id: "haeundae", name: "부산 해운대구", province: "부산광역시", district: "해운대구", originName: "해운대 기준점", lat: 35.1631, lng: 129.1636 },
  { id: "jeju", name: "제주 제주시", province: "제주특별자치도", district: "제주시", originName: "제주시청 기준점", lat: 33.4996, lng: 126.5312 },
] as const;

export type HospitalRegionId = typeof HOSPITAL_REGIONS[number]["id"];
export type HospitalDay = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const HOSPITAL_DAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일", "공휴일"] as const;
export interface HospitalHours {
  day: HospitalDay;
  // Minutes after midnight. 1440 is allowed for closing only.
  opens: number | null;
  closes: number | null;
  overnight: boolean;
}
export interface Hospital extends Coordinates {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  departments: string[];
  hours: HospitalHours[];
  distanceMeters: number;
  source: DataSource;
  updatedAt: string | null;
  detailStatus: "OK" | "ERROR" | "UNAVAILABLE";
}
export interface HospitalResponse {
  mode: "LIVE" | "DEMO";
  status: "OK" | "NOT_CONFIGURED";
  regionId: HospitalRegionId | 'nearby';
  origin: Coordinates;
  originName: string;
  fetchedAt: string;
  hospitals: Hospital[];
  partial: boolean;
  detailFailures: number;
  message: string;
}
