import type { FacilityLocation } from '../utils/facilityLocation';
import { isAddressReference } from '../utils/facilityLocation';
import { distance } from '../utils/format';

export function FacilityLocationEvidence({ facility, origin }: { facility: FacilityLocation; origin: string }) {
  if (!isAddressReference(facility)) return null;
  return <details className="facility-location-evidence"><summary>거리·위치 근거</summary>
    <p>{origin} → 시설 자료의 주소 좌표 기준이에요.</p>
    <p>자료 좌표 사이의 직선 계산값: {Number.isFinite(facility.distanceMeters) && facility.distanceMeters >= 0 ? distance(facility.distanceMeters) : '미확인'}</p>
    <p>실제 입구까지의 거리·이동 경로는 미확인이에요. 같은 주소를 쓰는 다른 시설도 같은 좌표에 표시될 수 있어요.</p>
  </details>;
}
