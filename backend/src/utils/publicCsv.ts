import { createHash } from 'node:crypto';
import type { PublicFacilityRecord } from '../../../shared/mapFacilities.js';
import { validCoordinates } from './geo.js';

type Row = Record<string, string>;
export const district = (address: string | null) => address?.trim().split(/\s+/).slice(0, 2).join(' ') || '';
export const districtFile = (area: string) => createHash('sha256').update(area).digest('hex').slice(0, 16);
export const tileKey = (lat: number, lng: number) => `${Math.floor(lat * 20)}_${Math.floor(lng * 20)}`;
const value = (row: Row, key: string) => row[key]?.trim() || null;
const number = (text: string | null) => text && Number.isFinite(Number(text)) ? Number(text) : null;

export function normalizePublicRow(row: Row, type: PublicFacilityRecord['type']): PublicFacilityRecord | null {
  const address = value(row, '소재지도로명주소') || value(row, '소재지지번주소');
  const name = type === 'CCTV' ? `${value(row, '설치목적구분') || '공공'} CCTV` : value(row, type === 'TOILET' ? '화장실명' : '관광안내소명');
  if (!name || !address) return null;
  const lat = number(value(row, type === 'CCTV' ? 'WGS84위도' : '위도'));
  const lng = number(value(row, type === 'CCTV' ? 'WGS84경도' : '경도'));
  const located = validCoordinates(lat, lng);
  const identity = value(row, '관리번호') ? `${value(row, '개방자치단체코드')}:${value(row, '관리번호')}` : `${name}:${address}:${lat}:${lng}`;
  const hours = type === 'TOILET' ? [value(row, '개방시간'), value(row, '개방시간상세')].filter(Boolean).join(' · ')
    : type === 'TOURIST_INFO' ? [
      ['하절기', '운영시작시각(하절기)', '운영종료시각(하절기)'],
      ['동절기', '운영시작시각(동절기)', '운영종료시각(동절기)'],
    ].flatMap(([label, start, end]) => value(row, start!) && value(row, end!) ? [`${label} ${value(row, start!)}–${value(row, end!)}`] : []).concat(value(row, '휴무일') ? [`휴무: ${value(row, '휴무일')}`] : []).join(' · ') : '';
  return {
    id: `${type.toLowerCase()}-${createHash('sha256').update(identity).digest('hex').slice(0, 20)}`,
    type, name, address, phone: value(row, type === 'CCTV' ? '관리기관전화번호' : type === 'TOURIST_INFO' ? '안내소전화번호' : '전화번호'),
    openingHours: hours || null, updatedAt: value(row, '데이터기준일자'),
    lat: located ? lat : null, lng: located ? lng : null,
    cameraCount: type === 'CCTV' ? number(value(row, '카메라대수')) : null,
  };
}
