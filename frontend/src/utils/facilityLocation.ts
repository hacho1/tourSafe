import type { AddressLocation } from '../../../shared/mapFacilities';
import { distance } from './format';

export interface FacilityLocation {
  distanceMeters: number;
  addressLocation?: Pick<AddressLocation, 'precision'>;
  locationNote?: string;
}

/** Address matches locate parcels/buildings; they do not verify a facility entrance. */
export function isAddressReference(facility: FacilityLocation): boolean {
  return facility.addressLocation?.precision === 'ADDRESS' || Boolean(facility.locationNote?.includes('주소 기준'));
}

export function facilityDistanceLabel(facility: FacilityLocation): string {
  if (isAddressReference(facility)) return '주소 참고 위치 · 실제 입구 미확인';
  return Number.isFinite(facility.distanceMeters) && facility.distanceMeters >= 0
    ? `직선 ${distance(facility.distanceMeters)}` : '거리 미확인';
}
