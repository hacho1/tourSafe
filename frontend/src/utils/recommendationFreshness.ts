import type { Recommendation } from '../../../shared/models';
export const RECOMMENDATION_TTL = 5 * 60_000;
export function currentRecommendation(item: Recommendation, now: number): Recommendation {
  if (item.spot.source.kind === 'DEMO_DATA') return item;
  const checked = Date.parse(item.checkedAt || '');
  if (Number.isFinite(checked) && checked <= now + 10000 && now - checked < RECOMMENDATION_TTL) return item;
  const hardFilter = item.score.hardFilter.filter(reason => !reason.includes('운영시간 외'));
  return { ...item,
    spot: { ...item.spot, openNow: { value:null, status:'UNKNOWN', source:null, updatedAt:null } },
    score: { ...item.score, total:null, confidence:'LOW', grade:hardFilter.length ? 'HOLD' : 'UNKNOWN', hardFilter },
    statuses: [...item.statuses, { key:'freshness',name:'조회 시각',status:'ERROR',message:'이전 조회 자료예요. 현재 운영 여부와 추천 조건을 다시 조회해 주세요.' }],
  };
}
