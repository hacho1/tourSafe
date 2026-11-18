import type {
  AdapterStatus,
  PlaceAmenities,
  Recommendation,
  SearchOptions,
  SearchResponse,
  SupportFacility,
  WeatherInfo,
} from "../../../shared/models.js";
import { config } from "../config.js";
import { getTouristSpots } from "../adapters/tourApi.js";
import { getWeather } from "../adapters/weatherApi.js";
import { getMedical } from "../adapters/medicalApi.js";
import { getPolice } from "../adapters/policeApi.js";
import { getTouristInfo } from "../adapters/touristInfoApi.js";
import { getToilets } from "../adapters/toiletApi.js";
import { applyClosures } from "../adapters/closureData.js";
import { demoRecommendations } from "../mock/fixtures.js";
import { emptyWeather } from "../utils/data.js";
import { calculateScore } from "../utils/scoring.js";
import { recommendationOrder } from "../../../shared/order.js";
import { hasPublicFacilities, getImportedTouristInfo, getImportedToilets } from "../adapters/publicFacilities.js";
import { getAccessibleTour } from '../adapters/accessibleTourApi.js';
import { getTourismAmenities, hasTourismStandardData } from '../adapters/tourismStandard.js';
import { mergeVisitFacilities } from '../utils/visitFacilities.js';

export async function safeAdapter<T>(
  key: string,
  name: string,
  enabled: boolean,
  run: () => Promise<T>,
  fallback: T,
): Promise<{ data: T; status: AdapterStatus }> {
  if (!enabled)
    return {
      data: fallback,
      status: {
        key,
        name,
        status: "NOT_CONFIGURED",
        message: `${name} 미연결 · 정보 미확인`,
      },
    };
  try {
    return {
      data: await run(),
      status: { key, name, status: "OK", message: `${name} 조회 완료` },
    };
  } catch {
    return {
      data: fallback,
      status: {
        key,
        name,
        status: "ERROR",
        message: `${name} 조회 실패 · 정보 확인 불가`,
      },
    };
  }
}
export async function getRecommendations(
  options: SearchOptions,
): Promise<SearchResponse> {
  const mode = !config.tourKey && config.useMock ? "DEMO" : "LIVE";
  const statuses: AdapterStatus[] = [];
  let recommendations: Recommendation[];
  if (mode === "DEMO") {
    recommendations = demoRecommendations(options);
    statuses.push({
      key: "demo",
      name: "시연 모드",
      status: "DEMO",
      message:
        "성수 일대의 가상 장소·시설과 예시 날씨입니다. 실제 방문에 사용하지 마세요.",
    });
  } else {
    const tour = await safeAdapter(
      "tour",
      "관광정보",
      !!config.tourKey,
      () => getTouristSpots(options),
      [],
    );
    statuses.push(tour.status);
    try {
      await applyClosures(tour.data);
    } catch {
      statuses.push({
        key: "closures",
        name: "공식 폐쇄정보",
        status: "ERROR",
        message: "폐쇄정보 파일을 읽지 못했습니다. 방문 전 확인이 필요합니다.",
      });
    }
    recommendations = await Promise.all(
      tour.data.map(async (spot): Promise<Recommendation> => {
        const [weather, medical, police, info, toilets, accessible, tourismStandard] = await Promise.all([
          safeAdapter<WeatherInfo>(
            "weather",
            "날씨",
            !!config.weatherKey,
            () => getWeather(spot),
            emptyWeather(),
          ),
          safeAdapter<SupportFacility[]>(
            "medical",
            "의료시설",
            !!config.medicalKey,
            () => getMedical(spot),
            [],
          ),
          safeAdapter<SupportFacility[]>(
            "police",
            "경찰시설",
            !!config.kakaoKey,
            () => getPolice(spot),
            [],
          ),
          safeAdapter<SupportFacility[]>(
            "touristInfo",
            "관광안내소",
            hasPublicFacilities() || !!config.touristInfoKey,
            () => hasPublicFacilities() ? getImportedTouristInfo(spot) : getTouristInfo(spot),
            [],
          ),
          safeAdapter<SupportFacility[]>(
            "toilets",
            "공중화장실",
            hasPublicFacilities() || !!config.toiletKey,
            () => hasPublicFacilities() ? getImportedToilets(spot) : getToilets(spot),
            [],
          ),
          safeAdapter<PlaceAmenities>(
            'accessibleTour', '무장애 여행 정보', !!config.accessibleTourKey,
            () => getAccessibleTour(spot), { safety: {}, details: [] },
          ),
          safeAdapter<PlaceAmenities>(
            'tourismStandard', '전국관광지정보표준데이터', hasTourismStandardData(),
            () => getTourismAmenities(spot), { safety: {}, details: [] },
          ),
        ]);
        if (accessible.status.status === 'OK' && !accessible.data.details.length) accessible.status.message = '이 관광지에 등록된 무장애 상세정보가 없어요. 시설이 없다는 뜻은 아니에요.';
        if (tourismStandard.status.status === 'OK' && !tourismStandard.data.details.length) tourismStandard.status.message = '전국관광지표준데이터에서 이 장소와 확실히 연결할 편의시설 자료를 찾지 못했어요.';
        const enrichedSpot = mergeVisitFacilities(spot, [accessible.data, tourismStandard.data]);
        const placeStatuses = [weather.status, medical.status, police.status, info.status, toilets.status, accessible.status, tourismStandard.status];
        const facilities = [
          ...medical.data,
          ...police.data,
          ...info.data,
          ...toilets.data,
        ];
        return {
          checkedAt: new Date().toISOString(),
          spot: enrichedSpot,
          facilities,
          weather: weather.data,
          score: calculateScore(enrichedSpot, facilities, weather.data, [...statuses, ...placeStatuses]),
          statuses: placeStatuses,
        };
      }),
    );
  }
  recommendations.sort(recommendationOrder);
  return {
    mode,
    generatedAt: new Date().toISOString(),
    origin: { lat: options.lat, lng: options.lng },
    radiusMeters: options.radius,
    recommendations,
    statuses,
  };
}
