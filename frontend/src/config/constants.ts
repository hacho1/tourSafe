import type { FacilityType, Region, SafetyScore } from "../../../shared/models";
export const DEFAULT_REGION: Region = {
  name: "서울 성수",
  address: "기본 위치",
  lat: 37.5445,
  lng: 127.0374,
};
export const GRADE: Record<SafetyScore["grade"], string> = {
  PRIORITY: "추천 우선",
  RECOMMENDED: "추천 가능",
  CHECK: "방문 전 확인",
  HOLD: "추천 보류",
  UNKNOWN: "정보 확인 필요",
};
export const CONFIDENCE = { HIGH: "높음", MEDIUM: "보통", LOW: "낮음" };
export function scoreSummary(score: Pick<SafetyScore, "grade" | "coverage" | "total">) {
  const sparse = score.coverage < 60;
  return {
    label: score.grade === "HOLD" ? GRADE.HOLD : sparse ? "정보 확인 필요" : GRADE[score.grade],
    total: sparse ? null : score.total,
  };
}
export const FACILITY_LABEL: Record<FacilityType, string> = {
  MEDICAL: "의료시설",
  POLICE: "경찰시설",
  TOURIST_INFO: "관광안내소",
  TOILET: "화장실",
};
export const SAFETY_LABEL = {
  strollerAccessible: "유모차 이동",
  railing: "난간",
  watersideProtection: "수변 안전시설",
  shade: "그늘",
  benches: "벤치",
  drinkingWater: "음수대",
  lighting: "야간 조명",
  pedestrianSeparation: "차량·보행자 분리",
  toilet: "화장실",
  nursingRoom: "수유실",
};
