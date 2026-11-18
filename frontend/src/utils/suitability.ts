import type { DataSource, Recommendation, TouristSpot } from '../../../shared/models';

export const NEEDS = [
  ['stepFree', '계단 없는 출입', '이동 접근성', 'accessible-exit'],
  ['wheelchair', '휠체어 이용 가능 정보', '이동 접근성', 'accessible-wheelchair'],
  ['strollerAccess', '유모차 이동 가능 정보', '이동 접근성', ''],
  ['route', '접근로 및 경사로', '이동 접근성', 'accessible-route'],
  ['elevator', '엘리베이터', '이동 접근성', 'accessible-elevator'],
  ['accessibleToilet', '장애인 화장실', '편의·휴식', 'accessible-restroom'],
  ['toilet', '일반 공중화장실', '편의·휴식', ''],
  ['nursing', '수유실', '편의·휴식', 'accessible-lactationroom'],
  ['strollerRental', '유모차 대여', '편의·휴식', 'accessible-stroller'],
  ['rest', '휴식 공간 (벤치 정보)', '편의·휴식', ''],
  ['visual', '시각장애인용 안내정보', '정보 및 지원', 'accessible-blindhandicapetc'],
  ['hearing', '청각장애인용 안내정보', '정보 및 지원', 'accessible-hearinghandicapetc'],
  ['emergency', '응급의료시설 정보', '정보 및 지원', ''],
  ['tourInfo', '주변 관광안내 지원', '정보 및 지원', ''],
] as const;
export type Need = typeof NEEDS[number][0];
export type Preference = 'required' | 'preferred';
export type Preferences = Partial<Record<Need, Preference>>;
export type State = 'met' | 'unmet' | 'unknown';
export interface NeedResult { id: Need; label: string; preference: Preference; state: State; explanation: string; source: DataSource | null; updatedAt: string | null; reason?: 'missing' | 'ambiguous' | 'conflict' | 'invalid' }
const empty = (explanation = '관련 정보를 확인하지 못했어요. 시설이 없다는 뜻은 아니에요.', reason: NeedResult['reason'] = 'missing'): Omit<NeedResult,'id'|'label'|'preference'> => ({ state: 'unknown', explanation, source: null, updatedAt: null, reason });
// Runtime data can be malformed even when TypeScript declares a complete response.
function validSource(value: unknown): value is DataSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  if (!['PUBLIC_DATA', 'KAKAO_MAP', 'DEMO_DATA'].includes(String(source.kind)) || typeof source.name !== 'string' || !source.name.trim()) return false;
  if (source.url === null) return true;
  if (typeof source.url !== 'string') return false;
  try { return ['http:', 'https:'].includes(new URL(source.url).protocol); } catch { return false; }
}
function validDate(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value)));
}
function validFacility(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const f = value as Record<string, unknown>;
  return ['MEDICAL', 'POLICE', 'TOURIST_INFO', 'TOILET'].includes(String(f.type)) &&
    typeof f.name === 'string' && f.name.trim().length > 0 && validSource(f.source) && validDate(f.updatedAt) &&
    f.distanceType === 'STRAIGHT_LINE' && typeof f.distanceMeters === 'number' && Number.isFinite(f.distanceMeters) && f.distanceMeters >= 0 &&
    typeof f.lat === 'number' && Number.isFinite(f.lat) && f.lat >= 33 && f.lat <= 39.5 &&
    typeof f.lng === 'number' && Number.isFinite(f.lng) && f.lng >= 124 && f.lng <= 132;
}

function boolFact(spot: TouristSpot, key: 'toilet'|'nursingRoom'|'strollerAccessible'|'benches'): Omit<NeedResult,'id'|'label'|'preference'> | null {
  const fact = spot.safety?.[key];
  if (!fact || !validSource(fact.source) || !validDate(fact.updatedAt) || (fact.status !== 'CONFIRMED' && fact.status !== 'NOT_AVAILABLE') || (fact.status === 'NOT_AVAILABLE' && fact.value === true)) return null;
  if (typeof fact.value !== 'boolean') return null;
  const value = fact.status === 'NOT_AVAILABLE' ? false : fact.value;
  if (typeof value !== 'boolean') return null;
  return { state: value ? 'met' : 'unmet', explanation: value ? '제공 자료에 해당 시설이 있다고 명시되어 있어요.' : '제공 자료에 해당 시설을 이용할 수 없다고 명시되어 있어요.', source: fact.source, updatedAt: fact.updatedAt };
}
function validDistanceFromSpot(spot: TouristSpot, facility: Recommendation['facilities'][number]): boolean {
  if (typeof spot.lat !== 'number' || !Number.isFinite(spot.lat) || spot.lat < 33 || spot.lat > 39.5 ||
      typeof spot.lng !== 'number' || !Number.isFinite(spot.lng) || spot.lng < 124 || spot.lng > 132) return false;
  const rad = (n: number) => n * Math.PI / 180;
  const x = Math.sin(rad(facility.lat - spot.lat) / 2) ** 2 + Math.cos(rad(spot.lat)) * Math.cos(rad(facility.lat)) * Math.sin(rad(facility.lng - spot.lng) / 2) ** 2;
  const expected = 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
  return Math.abs(facility.distanceMeters - expected) <= 100;
}
function evaluateNeed(item: Recommendation, id: Need, field: string): Omit<NeedResult,'id'|'label'|'preference'> {
  const spot = item.spot;
  if (id === 'nursing' || id === 'strollerAccess') {
    const fact = boolFact(spot, id === 'nursing' ? 'nursingRoom' : 'strollerAccessible');
    if (fact) return fact;
    if (id === 'strollerAccess') return empty();
  }
  if (id === 'rest') {
    const bench = boolFact(spot, 'benches');
    return bench?.state === 'met' ? { ...bench, explanation: '제공 자료에 벤치가 명시되어 있어요. 휴식 공간 전체의 접근성과 이용 가능 여부는 확인해 주세요.' } : empty('벤치 부재는 다른 휴식 공간이 없다는 뜻이 아니에요.');
  }
  if (id === 'toilet' || id === 'emergency' || id === 'tourInfo') {
    if (!Array.isArray(item.facilities) || !item.facilities.every(f => validFacility(f) && validDistanceFromSpot(spot, f))) return empty('주변 시설 자료의 형식을 확인할 수 없어 다시 조회가 필요해요.', 'invalid');
  }
  if (id === 'toilet') {
    // A nearby public toilet is not a toilet inside the attraction; this condition is about nearby information.
    const f = item.facilities.find(x => x.type === 'TOILET');
    return f ? { state:'met', explanation:`주변 공중화장실 ${f.name}의 위치 정보가 있어요. 관광지 내부 시설은 아니며 이용 가능 여부는 별도 확인해 주세요.`, source:f.source, updatedAt:f.updatedAt } : empty('주변 공중화장실 정보를 확인하지 못했어요.');
  }
  if (id === 'emergency' || id === 'tourInfo') {
    const f = item.facilities.find(x => id === 'emergency' ? x.type === 'MEDICAL' && x.emergency === true : x.type === 'TOURIST_INFO');
    return f ? { state:'met', explanation:`주변 ${id === 'emergency' ? '응급의료기관' : '관광안내소'} ${f.name}의 위치 정보가 있어요. 현재 운영·수용 여부는 별도 확인해 주세요.`, source:f.source, updatedAt:f.updatedAt } : empty(`주변 ${id === 'emergency' ? '응급의료기관' : '관광안내소'} 정보를 확인하지 못했어요.`);
  }
  if (!Array.isArray(spot.visitDetails)) return spot.visitDetails === undefined ? empty() : empty('제공 자료의 형식을 확인할 수 없어 직접 확인이 필요해요.', 'invalid');
  if (spot.visitDetails.some(d => !d || typeof d !== 'object' || typeof d.id !== 'string' || typeof d.text !== 'string' || !validSource(d.source) || !validDate(d.updatedAt))) return empty('제공 자료의 형식을 확인할 수 없어 직접 확인이 필요해요.', 'invalid');
  const details = spot.visitDetails.filter(d => d.id === field);
  if (!details.length) return empty();
  if (details.length > 1 && details.some(d => d.text.trim() !== details[0]!.text.trim())) return empty('제공 자료가 서로 달라 직접 확인이 필요해요.', 'conflict');
  const detail = details[0]!;
  // Free text is not a structured boolean. Only unambiguous, condition-specific statements qualify.
  const text = detail.text.trim();
  const patterns: Partial<Record<Need, [RegExp, RegExp]>> = {
    stepFree: [/^(?:계단\s*(?:이|은)?\s*없음|계단\s*없는\s*출입구|주출입구는\s*단차가\s*없어\s*휠체어\s*접근\s*가능함)[.!]?$/, /^(?:계단 없는 출입구 없음|무단차 출입 불가)[.!]?$/],
    wheelchair: [/^(?:휠체어\s*(?:이용|출입)\s*가능)[.!]?$/, /^(?:휠체어\s*(?:이용|출입)\s*불가(?:능)?)[.!]?$/],
    route: [/^(?:접근로\s*및\s*경사로\s*(?:있음|설치))[.!]?$/, /^(?:접근로\s*및\s*경사로\s*(?:없음|미설치))[.!]?$/],
    elevator: [/^(?:엘리베이터\s*)?(?:있음|설치|이용가능)[.!]?$/, /^(?:엘리베이터\s*)?(?:없음|미설치|이용불가)[.!]?$/],
    accessibleToilet: [/^(?:장애인\s*(?:전용\s*)?화장실\s*(?:있음|설치|이용가능))[.!]?$/, /^(?:장애인\s*(?:전용\s*)?화장실\s*(?:없음|미설치|이용불가))[.!]?$/],
    strollerRental: [/^(?:유모차\s*대여\s*(?:가능|제공))[.!]?$/, /^(?:유모차\s*대여\s*(?:불가|미제공))[.!]?$/],
    nursing: [/^수유실\s*(?:있음|설치|이용가능)[.!]?$/, /^수유실\s*(?:없음|미설치|이용불가)[.!]?$/],
  };
  const p = patterns[id];
  const state: State = p?.[0].test(text) ? 'met' : p?.[1].test(text) ? 'unmet' : 'unknown';
  return { state, explanation: `기관 원문: ${text}${state === 'unknown' ? ' · 문장의 의미를 자동 판정하기 어려워 직접 확인이 필요해요.' : ''}`, source:detail.source, updatedAt:detail.updatedAt, ...(state === 'unknown' ? { reason: 'ambiguous' as const } : {}) };
}
export function assess(item: Recommendation, preferences: Preferences) {
  const results = NEEDS.flatMap(([id,label,,field]) => {
    const preference = preferences[id];
    return preference === 'required' || preference === 'preferred' ? [{ id, label, preference, ...evaluateNeed(item,id,field) }] : [];
  });
  const required = results.filter(r => r.preference === 'required');
  const status = !required.length ? 'unset' : required.some(r => r.state === 'unmet') ? 'unmet' : required.some(r => r.state === 'unknown') ? 'unknown' : 'met';
  return { status, results } as const;
}
export const STATUS = { unset:'필수조건 미설정', met:'자료상 필수조건 확인', unmet:'필수조건 미충족 자료 있음', unknown:'방문 전 확인 필요' } as const;
export function needEvidenceLabel(result: NeedResult): string {
  if (result.state === 'met') return result.source?.kind === 'DEMO_DATA' ? '시연 자료상 확인' : '자료상 확인';
  if (result.state === 'unmet') return '미충족 자료 있음';
  if (result.reason === 'conflict') return '자료 상충';
  if (result.reason === 'invalid') return '자료 형식 확인 필요';
  return result.reason === 'ambiguous' || result.source ? '원문 있음 · 해석 보류' : '자료 없음';
}
const QUESTIONS: Record<Need, string> = {
  stepFree:'이용할 입구에 계단이나 단차 없이 출입할 수 있나요?',
  wheelchair:'휠체어로 이용할 수 있는 구역과 제한되는 구역은 어디인가요?',
  strollerAccess:'입구부터 관람·화장실까지 유모차로 이동할 수 있나요?',
  route:'실제로 이용할 접근로와 경사로의 위치·경사·통행 제한을 확인할 수 있나요?',
  elevator:'이동할 층을 연결하는 엘리베이터를 방문일에 이용할 수 있나요?',
  accessibleToilet:'장애인 화장실의 위치와 방문일 이용 가능 여부는 어떻게 되나요?',
  toilet:'이용할 공중화장실의 실제 입구와 개방시간은 어떻게 되나요?',
  nursing:'수유실의 위치와 이용 시간·조건은 어떻게 되나요?',
  strollerRental:'유모차 대여 위치와 이용 시간·예약 조건은 어떻게 되나요?',
  rest:'앉아서 쉴 수 있는 장소의 위치와 이용 가능 여부는 어떻게 되나요?',
  visual:'필요한 시각장애인 안내 방식과 제공 구역을 확인할 수 있나요?',
  hearing:'필요한 청각장애인 안내 방식과 제공 구역을 확인할 수 있나요?',
  emergency:'주변 응급의료기관의 연락처와 이동 방법을 확인했나요? 현재 수용 여부는 별도 확인이 필요해요.',
  tourInfo:'관광안내소의 운영시간과 제공하는 안내·통역 범위를 확인했나요?',
};
export function buildVisitQuestions(preferences: Preferences): string[] {
  return ['방문 예정일의 운영시간과 출입 가능 여부는 어떻게 되나요?', ...NEEDS.flatMap(([id,label]) => {
    const value = preferences[id];
    return value === 'required' || value === 'preferred' ? [`${value === 'required' ? '필수' : '선호'} · ${label}: ${QUESTIONS[id]}`] : [];
  })];
}
export function suitabilityOrder(a: Recommendation, b: Recommendation, preferences: Preferences) {
  const rank = {met:0, unknown:1, unset:1, unmet:2};
  const aa=assess(a,preferences), bb=assess(b,preferences);
  const knownRequired = (rows: typeof aa.results) => rows.filter(r => r.preference === 'required' && r.state === 'met').length;
  const relatedRequired = (rows: typeof aa.results) => rows.filter(r => r.preference === 'required' && r.source).length;
  const hasWarning = (item: Recommendation) => Array.isArray(item.score.hardFilter) && item.score.hardFilter.length > 0 ? 1 : 0;
  return hasWarning(a)-hasWarning(b) || rank[aa.status]-rank[bb.status] || knownRequired(bb.results)-knownRequired(aa.results) || relatedRequired(bb.results)-relatedRequired(aa.results) || a.spot.distanceMeters-b.spot.distanceMeters;
}
