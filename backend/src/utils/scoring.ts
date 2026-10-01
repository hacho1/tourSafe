import type {
  Evidence,
  SafetyScore,
  ScoreComponent,
  SupportFacility,
  TouristSpot,
  WeatherInfo,
} from "../../../shared/models.js";

const isKnown = (e: Evidence<unknown>) =>
  e.status !== "UNKNOWN" && e.value !== null;
const proximity = (meters: number) =>
  meters <= 500
    ? 1
    : meters <= 1000
      ? 0.85
      : meters <= 2000
        ? 0.65
        : meters <= 3000
          ? 0.4
          : 0.2;
export function calculateScore(
  spot: TouristSpot,
  facilities: SupportFacility[],
  weather: WeatherInfo,
): SafetyScore {
  const parts: ScoreComponent[] = [];
  const operation = [spot.openingHours, spot.holidays, spot.openNow];
  const opWeights = [8, 5, 12];
  const knownOp = operation.reduce(
    (sum, e, i) => sum + (isKnown(e) ? opWeights[i]! : 0),
    0,
  );
  const earnedOp =
    (isKnown(spot.openingHours) ? 8 : 0) +
    (isKnown(spot.holidays) ? 5 : 0) +
    (isKnown(spot.openNow) && spot.openNow.value ? 12 : 0);
  parts.push({
    key: "operation",
    label: "운영·정보 신뢰성",
    maxPoints: 25,
    knownWeight: knownOp,
    earnedPoints: knownOp ? earnedOp : null,
    detail:
      spot.openNow.value === true
        ? "운영시간 기준 이용 가능"
        : spot.openNow.value === false
          ? "현재 운영시간 외"
          : "현재 운영 여부 확인 필요",
  });
  for (const [type, label, weight] of [
    ["MEDICAL", "의료시설 접근성", 20],
    ["POLICE", "경찰시설 접근성", 15],
    ["TOURIST_INFO", "관광안내소 접근성", 10],
  ] as const) {
    const nearest = facilities
      .filter((f) => f.type === type)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
    parts.push({
      key: type.toLowerCase(),
      label,
      maxPoints: weight,
      knownWeight: nearest ? weight : 0,
      earnedPoints: nearest
        ? Math.round(weight * proximity(nearest.distanceMeters) * 10) / 10
        : null,
      detail: nearest
        ? `${nearest.name} · 직선 ${nearest.distanceMeters}m`
        : "주변 시설 정보 미확인",
    });
  }
  const weatherFacts: [Evidence<number>, number, (v: number) => number][] = [
    [
      weather.temperature,
      6,
      (v) =>
        v >= 5 && v <= 30
          ? 1
          : (v > 30 && v < 35) || (v >= 0 && v < 5)
            ? 0.5
            : 0.1,
    ],
    [weather.precipitation, 7, (v) => (v === 0 ? 1 : v < 3 ? 0.5 : 0.1)],
    [weather.windSpeed, 5, (v) => (v < 5 ? 1 : v < 9 ? 0.5 : 0.1)],
    [
      weather.precipitationProbability,
      2,
      (v) => (v < 40 ? 1 : v < 70 ? 0.5 : 0.2),
    ],
  ];
  let knownWeather = 0,
    earnedWeather = 0;
  for (const [fact, weight, rate] of weatherFacts)
    if (isKnown(fact)) {
      knownWeather += weight;
      earnedWeather += weight * rate(fact.value!);
    }
  parts.push({
    key: "weather",
    label: "현재 기상 적합성",
    maxPoints: 20,
    knownWeight: knownWeather,
    earnedPoints: knownWeather ? Math.round(earnedWeather * 10) / 10 : null,
    detail: knownWeather ? "기온·강수·바람·강수확률 기준" : "날씨 정보 미확인",
  });
  const familyFacts = [
    spot.safety.toilet,
    spot.safety.strollerAccessible,
    spot.safety.shade,
    spot.safety.benches,
    spot.safety.nursingRoom,
  ];
  const knownFamily = familyFacts.filter(isKnown).length * 2;
  const earnedFamily =
    familyFacts.filter((f) => isKnown(f) && f.value === true).length * 2;
  parts.push({
    key: "family",
    label: "가족 편의시설",
    maxPoints: 10,
    knownWeight: knownFamily,
    earnedPoints: knownFamily ? earnedFamily : null,
    detail: `5개 항목 중 ${knownFamily / 2}개 정보 확인`,
  });
  const coverage = parts.reduce((sum, p) => sum + p.knownWeight, 0);
  const earned = parts.reduce((sum, p) => sum + (p.earnedPoints ?? 0), 0);
  const total = coverage ? Math.round((earned / coverage) * 100) : null;
  const hardFilter: string[] = [];
  if (spot.closure.status === "CONFIRMED" && spot.closure.value)
    hardFilter.push("공식 폐쇄 또는 출입통제 확인");
  if (weather.severeAlert.status === "CONFIRMED" && weather.severeAlert.value)
    hardFilter.push("위험 기상특보 확인");
  if (spot.openNow.status === "CONFIRMED" && spot.openNow.value === false)
    hardFilter.push("현재 운영시간 외");
  return {
    total,
    coverage,
    confidence: coverage >= 90 ? "HIGH" : coverage >= 60 ? "MEDIUM" : "LOW",
    grade: hardFilter.length
      ? "HOLD"
      : total === null
        ? "UNKNOWN"
        : total >= 85
          ? "PRIORITY"
          : total >= 70
            ? "RECOMMENDED"
            : total >= 55
              ? "CHECK"
              : "HOLD",
    hardFilter,
    components: parts,
  };
}
