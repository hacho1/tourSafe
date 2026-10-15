export type FacilityKind = "cctv" | "police" | "medical" | "store" | "caution";
export type RouteKind = "safe" | "fast";
export const facilityNames: Record<FacilityKind, string> = {
  cctv: "CCTV", police: "경찰시설", medical: "병원", store: "편의점", caution: "주의 구간",
};
// Concept diagram fixtures only. Never used as real routing or public safety evidence.
export const mapFacilities: { id: string; kind: FacilityKind; x: number; y: number; name: string; detail: string }[] = [
  { id: "c1", kind: "cctv", x: 25, y: 45, name: "교차로 CCTV", detail: "교차로 주변에 CCTV가 있는 상황을 가정한 예시예요." },
  { id: "c2", kind: "cctv", x: 38, y: 32, name: "큰길 CCTV", detail: "큰길을 따라 배치한 가상의 CCTV예요." },
  { id: "c3", kind: "cctv", x: 56, y: 32, name: "보행로 CCTV", detail: "시설 종류와 경로의 관계를 살펴보는 예시예요." },
  { id: "c4", kind: "cctv", x: 68, y: 53, name: "골목 입구 CCTV", detail: "실제 설치 위치나 작동 여부를 확인한 정보는 아니에요." },
  { id: "c5", kind: "cctv", x: 17, y: 72, name: "산책길 CCTV", detail: "주변 안전시설 표시를 체험하기 위한 가상 위치예요." },
  { id: "c6", kind: "cctv", x: 85, y: 69, name: "도로변 CCTV", detail: "주변 안전시설 표시를 체험하기 위한 가상 위치예요." },
  { id: "p1", kind: "police", x: 56, y: 80, name: "성수 안심지구대", detail: "도움을 받을 수 있는 경찰시설의 가상 예시예요." },
  { id: "m1", kind: "medical", x: 87, y: 38, name: "성수 예시병원", detail: "가상 병원입니다. 실제 진료시간이나 응급실 정보는 제공하지 않아요." },
  { id: "s1", kind: "store", x: 28, y: 31, name: "큰길 편의점", detail: "큰길에서 들를 수 있는 가상의 편의점이에요." },
  { id: "s2", kind: "store", x: 62, y: 55, name: "골목 편의점", detail: "실제 영업 여부를 확인한 시설은 아니에요." },
  { id: "s3", kind: "store", x: 76, y: 76, name: "연무장길 편의점", detail: "주변 편의시설을 탐색하기 위한 가상 예시예요." },
  { id: "w1", kind: "caution", x: 54, y: 58, name: "골목 교차로", detail: "차량과 보행자가 만나는 구간을 가정했어요. 실제 사고 통계에 근거한 표시는 아니에요." },
];
export const destinations = [
  { id: "stay", name: "성수 스테이", category: "숙소", x: 76, y: 40,
    safePath: "M 310 640 L 310 400 L 760 400", fastPath: "M 310 640 L 580 640 L 580 400 L 760 400",
    safeMinutes: 16, fastMinutes: 12, safeDistance: "1.1", fastDistance: "0.8", safeScore: 82, fastScore: 59 },
  { id: "atelier", name: "성수 아틀리에", category: "문화공간", x: 76, y: 24,
    safePath: "M 310 640 L 310 240 L 760 240", fastPath: "M 310 640 L 580 640 L 580 240 L 760 240",
    safeMinutes: 19, fastMinutes: 15, safeDistance: "1.3", fastDistance: "1.0", safeScore: 80, fastScore: 64 },
  { id: "forest", name: "숲길 쉼터", category: "산책 공간", x: 19, y: 82,
    safePath: "M 310 640 L 310 820 L 190 820", fastPath: "M 310 640 L 190 640 L 190 820",
    safeMinutes: 8, fastMinutes: 6, safeDistance: "0.5", fastDistance: "0.4", safeScore: 79, fastScore: 65 },
] as const;
export type DemoDestination = (typeof destinations)[number];
