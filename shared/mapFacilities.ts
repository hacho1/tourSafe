import type { AdapterStatus, Coordinates, DataSource, FacilityType, WeatherInfo } from './models.js';

export type MapFacilityType = FacilityType | 'CCTV';
export interface FacilityQualityIssue {
  id: string;
  sourceVersion: string;
  name: string;
  reason: string;
  evidenceUrl: string;
  checkedAt: string;
}
/** Address geocoding locates a building/parcel, not a verified restroom entrance. */
export interface AddressLocation extends Coordinates {
  precision: 'ADDRESS';
  provider: 'KAKAO';
  matchedAddress: string;
  checkedAt: string;
}
export interface PublicFacilityRecord {
  id: string;
  type: 'CCTV' | 'TOURIST_INFO' | 'TOILET';
  name: string;
  address: string | null;
  phone: string | null;
  openingHours: string | null;
  updatedAt: string | null;
  lat: number | null;
  lng: number | null;
  cameraCount: number | null;
  addressLocation?: AddressLocation;
}
export interface MapFacility extends Coordinates {
  id: string;
  type: MapFacilityType;
  name: string;
  address: string | null;
  phone: string | null;
  openingHours: string | null;
  updatedAt: string | null;
  source: DataSource;
  distanceMeters: number;
  cameraCount?: number | null;
  addressLocation?: AddressLocation;
}
export interface MapFacilitiesResponse {
  origin: Coordinates;
  facilities: MapFacility[];
  totals: Partial<Record<MapFacilityType, number>>;
  /** Imported installation sites, before display thinning; never camera units. */
  cctvSummary?: { within500m: number; within3000m: number };
  unlocatedToilets: { area: string; total: number; items: PublicFacilityRecord[] };
  statuses: AdapterStatus[];
  qualityIssues?: FacilityQualityIssue[];
  toiletCoordinates?: 'NATIONAL' | 'PARTIAL';
}
export interface MapWeatherResponse {
  origin: Coordinates;
  weather: WeatherInfo;
  status: AdapterStatus;
}
