import type { FacilityQualityIssue, MapFacility, PublicFacilityRecord } from '../../../shared/mapFacilities.js';

// Evidence-backed exceptions only. Keep source rows intact; never guess a replacement coordinate.
export const FACILITY_QUALITY_ISSUES: FacilityQualityIssue[] = [{
  id: 'toilet-bc57c35583dd23ad0254', sourceVersion: '2026-10-13T08-14-06-364Z',
  name: '명목보건진료소', reason: '원본의 중앙로 308 주소·24시간 표기가 안성시 공식 안내의 양성면 속말길 10 주소와 충돌해 지도와 길찾기에서 제외했어요.',
  evidenceUrl: 'https://www.anseong.go.kr/health/contents.do?mId=0103020000',
  checkedAt: '2026-10-13',
}];

export function reviewFacilities<T extends PublicFacilityRecord | MapFacility>(rows: T[], sourceVersion: string) {
  const conflicts = FACILITY_QUALITY_ISSUES.filter(issue => issue.sourceVersion === sourceVersion && rows.some(row => row.id === issue.id));
  const blocked = new Set(conflicts.map(issue => issue.id));
  return { rows: rows.filter(row => !blocked.has(row.id)), conflicts };
}
