import type { AddressLocation, PublicFacilityRecord } from '../../../shared/mapFacilities.js';
import { list, num, record, str } from './data.js';
import { validCoordinates } from './geo.js';

export const TOILET_GEOCODING_AREA = '서울특별시 성동구';
export const TOILET_GEOCODING_FILE = 'geocoded-toilets-seongdong.json';
export const NATIONAL_TOILET_DIRECTORY = 'toilet-geocoding';
export interface NationalToiletManifest {
  schemaVersion: 2;
  sourceVersion: string;
  version: string;
  generatedAt: string;
  tiles: string[];
  areas: string[];
  total: number;
  located: number;
  addressOnly: number;
}
export interface ToiletGeocodingFile {
  schemaVersion: 1;
  sourceVersion: string;
  area: string;
  generatedAt: string;
  results: { id: string; address: string; location: AddressLocation | null }[];
}

/** Strip only building/floor annotations; do not invent or repair street numbers. */
export function toiletAddressQuery(address: string): string {
  return address.replace(/\([^)]*\)/g, '').split(',')[0]!.trim().replace(/\s+/g, ' ');
}
const provinces = [
  ['서울', '서울특별시'], ['부산', '부산광역시'], ['대구', '대구광역시'], ['인천', '인천광역시'],
  ['광주', '광주광역시'], ['대전', '대전광역시'], ['울산', '울산광역시'], ['세종', '세종특별자치시'],
  ['경기', '경기도'], ['강원', '강원도', '강원특별자치도'], ['충북', '충청북도'], ['충남', '충청남도'],
  ['전북', '전라북도', '전북특별자치도'], ['전남', '전라남도'], ['경북', '경상북도'], ['경남', '경상남도'],
  ['제주', '제주도', '제주특별자치도'], ['전남광주통합특별시'],
];
/** Province spelling aliases only; never infer a missing province or a district. */
export function normalizedProvinceAddress(address: string): string {
  const clean = toiletAddressQuery(address), [first, ...rest] = clean.split(' ');
  const province = provinces.find(names => names.includes(first!))?.[0];
  return province ? [province, ...rest].join(' ') : clean;
}
export function hasProvince(address: string): boolean {
  return provinces.some(names => names.includes(toiletAddressQuery(address).split(' ')[0]!));
}
export function toiletAreaKey(address: string): string {
  const parts = normalizedProvinceAddress(address).split(' ');
  return parts[0] === '세종' ? '세종' : parts.slice(0, 2).join(' ');
}
const comparableAddress = (address: string) => normalizedProvinceAddress(address).replace(/\s+/g, '');

export function matchToiletAddress(data: unknown, query: string, checkedAt: string): AddressLocation | null {
  const root = record(data), documents = list(root.documents);
  if (num(record(root.meta).total_count) !== 1 || documents.length !== 1) return null;
  const item = documents[0]!;
  if (item.address_type !== 'ROAD_ADDR' && item.address_type !== 'REGION_ADDR') return null;
  const address = record(item.address_type === 'ROAD_ADDR' ? item.road_address : item.address);
  const province = str(address.region_1depth_name);
  if (!province || !hasProvince(query) || normalizedProvinceAddress(query).split(' ')[0] !== normalizedProvinceAddress(province)) return null;
  const district = str(address.region_2depth_name);
  if (district && !normalizedProvinceAddress(query).startsWith(`${normalizedProvinceAddress(province)} ${district} `)) return null;
  const matchedAddress = str(item.address_name), lat = num(item.y), lng = num(item.x);
  if (!matchedAddress || comparableAddress(query) !== comparableAddress(matchedAddress) || !validCoordinates(lat, lng) || lng === null) return null;
  return { lat, lng, precision: 'ADDRESS', provider: 'KAKAO', matchedAddress, checkedAt };
}

/** Only enrich matching records from the exact import used for geocoding. */
export function applyToiletGeocoding(rows: PublicFacilityRecord[], data: unknown, version: string): PublicFacilityRecord[] {
  const file = record(data);
  if (file.schemaVersion !== 1 || file.sourceVersion !== version || typeof file.area !== 'string' || !Array.isArray(file.results)) return rows;
  const matches = new Map(list(file.results).map(item => [str(item.id), item]));
  return rows.map(row => {
    const match = matches.get(row.id), location = record(match?.location);
    if (row.type !== 'TOILET' || row.lat !== null || row.lng !== null || !row.address || match?.address !== row.address ||
      location.precision !== 'ADDRESS' || location.provider !== 'KAKAO' || typeof location.lat !== 'number' || typeof location.lng !== 'number' ||
      !validCoordinates(location.lat, location.lng) || !str(location.checkedAt) || !str(location.matchedAddress) ||
      comparableAddress(row.address) !== comparableAddress(String(location.matchedAddress))) return row;
    const addressLocation = location as unknown as AddressLocation;
    return { ...row, lat: addressLocation.lat, lng: addressLocation.lng, addressLocation };
  });
}
