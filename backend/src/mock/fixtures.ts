import type {
  Coordinates,
  FacilityType,
  Recommendation,
  SearchOptions,
  SupportFacility,
  TouristSpot,
} from "../../../shared/models.js";
import { confirmed, emptyWeather, unknown } from "../utils/data.js";
import { haversine } from "../utils/geo.js";
import { calculateScore } from "../utils/scoring.js";
import { demoAt, demoSource, mockSafetyData } from "./mockSafetyData.js";

export const demoOrigin = { lat: 37.5445, lng: 127.0374 };
const definitions = [
  {
    id: "demo-park",
    name: "하늘빛 어린이공원",
    lat: 37.5488,
    lng: 127.0431,
    category: "공원 · 야외",
    indoor: false,
    imageUrl: "/images/park.webp",
    description:
      "넓은 잔디와 나무 사이 산책길이 있는 가족 나들이 공간입니다. 잠깐 쉬어가며 아이와 계절을 느껴보세요.",
    hours: "09:00–18:00",
  },
  {
    id: "demo-museum",
    name: "바다향 해양박물관",
    lat: 37.5401,
    lng: 127.0457,
    category: "박물관 · 실내",
    indoor: true,
    imageUrl: "/images/museum.webp",
    description:
      "바닷속 이야기를 함께 발견하는 실내 전시 공간입니다. 호기심 많은 아이와 천천히 둘러보는 하루를 상상해 보세요.",
    hours: "10:00–18:00",
  },
  {
    id: "demo-forest",
    name: "숲속 자연생태공원",
    lat: 37.5347,
    lng: 127.0241,
    category: "자연 · 야외",
    indoor: false,
    imageUrl: "/images/forest.webp",
    description:
      "초록 산책길을 따라 다양한 나무와 식물을 만나는 공간입니다. 유모차 이동과 수변 구간은 방문 전 확인이 필요합니다.",
    hours: "08:00–19:00",
  },
  {
    id: "demo-garden",
    name: "노을빛 정원",
    lat: 37.5628,
    lng: 127.0574,
    category: "정원 · 야외",
    indoor: false,
    imageUrl: null,
    description:
      "계절 꽃과 열린 풍경을 감상하는 정원입니다. 확인된 정보가 적어 운영시간과 편의시설을 먼저 확인해 주세요.",
    hours: null,
  },
];
export function demoRecommendations(options: SearchOptions): Recommendation[] {
  return definitions
    .map((d, index) => {
      const center: Coordinates = { lat: d.lat, lng: d.lng };
      const spot: TouristSpot = {
        ...center,
        id: d.id,
        name: d.name,
        category: d.category,
        indoor: d.indoor,
        imageUrl: d.imageUrl,
        description: d.description,
        address: "서울 성동구 일대 · 실제 장소가 아닌 시연용 예시",
        phone: null,
        source: demoSource,
        updatedAt: demoAt,
        openingHours: d.hours
          ? confirmed(d.hours, demoSource, demoAt)
          : unknown(),
        holidays: d.hours
          ? confirmed("시연 기준 휴무 없음", demoSource, demoAt)
          : unknown(),
        openNow: d.hours ? confirmed(true, demoSource, demoAt) : unknown(),
        closure: unknown(),
        safety: mockSafetyData[d.id]!,
        distanceMeters: haversine(options, center),
      };
      const names: [FacilityType, string][] = [
        ["MEDICAL", "예시 응급의료기관"],
        ["POLICE", "예시 지구대"],
        ["TOURIST_INFO", "예시 관광안내소"],
        ["TOILET", "예시 공중화장실"],
      ];
      const facilities: SupportFacility[] = names
        .slice(0, index === 3 ? 1 : 4)
        .map(([type, name], i) => {
          const coords = {
            lat: d.lat + (0.003 + index * 0.004) * (i % 2 ? -1 : 1),
            lng: d.lng + 0.002 + i * 0.002,
          };
          return {
            ...coords,
            id: `${d.id}-${type}`,
            type,
            name,
            address: "시연용 가상 시설",
            phone: null,
            source: demoSource,
            updatedAt: demoAt,
            openingHours: null,
            holidays: null,
            languages: null,
            emergency: type === "MEDICAL" ? true : null,
            distanceMeters: haversine(center, coords),
            distanceType: "STRAIGHT_LINE",
          };
        });
      const weather = {
        ...emptyWeather(),
        temperature: confirmed(24, demoSource, demoAt),
        precipitation: confirmed(0, demoSource, demoAt),
        precipitationProbability: confirmed(10, demoSource, demoAt),
        windSpeed: confirmed(2.1, demoSource, demoAt),
        condition: confirmed("맑음", demoSource, demoAt),
      };
      return {
        spot,
        facilities,
        weather,
        score: calculateScore(spot, facilities, weather),
        statuses: [
          {
            key: "demo",
            name: "시연 데이터",
            status: "DEMO" as const,
            message: "장소·시설·날씨·운영정보는 가상의 예시입니다.",
          },
        ],
      };
    })
    .filter((r) => r.spot.distanceMeters <= options.radius);
}
