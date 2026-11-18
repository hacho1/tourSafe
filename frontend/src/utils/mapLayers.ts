import type { Hospital } from '../../../shared/hospitals';
import type { MapFacility } from '../../../shared/mapFacilities';
import type { MapPoint } from '../components/MapPanel';

export type MapLayer = 'CCTV' | 'POLICE' | 'MEDICAL' | 'TOILET';
export type MapLayers = Record<MapLayer, boolean>;
export const MAP_LAYER_STORAGE = 'toursafe:map-layers:v1';
export const DEFAULT_MAP_LAYERS: MapLayers = { CCTV: false, POLICE: true, MEDICAL: true, TOILET: false };
export function parseMapLayers(value: string | null): MapLayers {
  try {
    const parsed: unknown = value ? JSON.parse(value) : null;
    if (parsed && typeof parsed === 'object') {
      const row = parsed as Record<string, unknown>;
      if (['CCTV', 'POLICE', 'MEDICAL'].every(key => typeof row[key] === 'boolean')) {
        return { CCTV: row.CCTV as boolean, POLICE: row.POLICE as boolean, MEDICAL: row.MEDICAL as boolean, TOILET: typeof row.TOILET === 'boolean' ? row.TOILET : false };
      }
    }
  } catch { /* Unavailable or old preferences fall back to the defaults. */ }
  return { ...DEFAULT_MAP_LAYERS };
}
export function mapLayerFor(type: MapPoint['type']): MapLayer | null {
  return type === 'HOSPITAL' || type === 'MEDICAL' ? 'MEDICAL' : type === 'CCTV' || type === 'POLICE' || type === 'TOILET' ? type : null;
}
export function isCctvOnly(points: Pick<MapPoint, 'type'>[]): boolean {
  return points.length > 0 && points.every(point => point.type === 'CCTV');
}
export interface MapOverlayFacility extends Omit<MapFacility, 'type'> {
  type: MapFacility['type'] | 'HOSPITAL';
  hospital?: Hospital;
  emergency?: boolean;
  emergencyFacility?: MapFacility;
}
/** Both NEMC APIs use HPID. Never merge by similar names or nearby coordinates. */
export function mergeMapMedical(facilities: MapFacility[], hospitals: Hospital[]): MapOverlayFacility[] {
  const remaining = new Map(facilities.map(item => [item.id, item]));
  const combined: MapOverlayFacility[] = [];
  for (const hospital of hospitals) {
    if (!Number.isFinite(hospital.lat) || !Number.isFinite(hospital.lng) || Math.abs(hospital.lat) > 90 || Math.abs(hospital.lng) > 180 || hospital.source.kind !== 'PUBLIC_DATA') continue;
    const candidate = remaining.get(`medical-${hospital.id}`);
    const emergency = candidate?.type === 'MEDICAL' ? candidate : undefined;
    if (emergency) remaining.delete(emergency.id);
    combined.push({
      ...hospital, id: `hospital-${hospital.id}`, type: 'HOSPITAL', openingHours: null,
      phone: hospital.phone || emergency?.phone || null, hospital,
      emergency: Boolean(emergency), emergencyFacility: emergency,
    });
  }
  const unmerged: MapOverlayFacility[] = [...remaining.values()].map(item => ({ ...item, emergency: item.type === 'MEDICAL' }));
  return [...unmerged, ...combined].sort((a, b) => a.distanceMeters - b.distanceMeters);
}
export const mapPointKind = (point: MapPoint) => point.type === 'HOSPITAL'
  ? point.emergency ? '병원·의원 · 응급의료기관' : '병원·의원'
  : ({ CCTV: 'CCTV 설치 지점', POLICE: '경찰시설', MEDICAL: '응급의료기관', TOURIST_INFO: '관광안내소', TOILET: '화장실', SPOT: '여행지' } as const)[point.type];

/** Group around fixed anchors. Chebyshev distance keeps square marker hitboxes apart. */
export function groupMapPins<T>(items: { point: T; x: number; y: number }[], spacing = 56): T[][] {
  const groups: { point: T; x: number; y: number }[][] = [];
  for (const item of items) {
    // Bound each group to its anchor: a chain of CCTV sites must not collapse an entire street.
    const hit = groups.find(group => Math.max(Math.abs(item.x - group[0]!.x), Math.abs(item.y - group[0]!.y)) < spacing);
    if (hit) hit.push(item);
    else groups.push([item]);
  }
  return groups.map(group => group.map(item => item.point));
}

export function canExpandMapCluster(points: { lat: number; lng: number }[], zoom: number): boolean {
  return zoom < 18.5 && points.some(point => Math.abs(point.lat - points[0]!.lat) > 0.000001 || Math.abs(point.lng - points[0]!.lng) > 0.000001);
}

/** Reserve the origin dot AND its label. Shift only conflicting hitboxes, retaining a leader to the true coordinate. */
export function originSafeOffsets(anchors: { x: number; y: number }[], origin?: { x: number; y: number }) {
  const offsets = anchors.map(() => ({ x: 0, y: 0 }));
  if (!origin) return offsets;
  const hitsOrigin = (p: { x: number; y: number }) => Math.abs(p.x - origin.x) < 62 && p.y > origin.y - 42 && p.y < origin.y + 76;
  const occupied = anchors.filter(p => !hitsOrigin(p));
  anchors.forEach((anchor, index) => {
    if (!hitsOrigin(anchor)) return;
    for (let radius = 56; radius <= 560; radius += 28) {
      for (const [dx, dy] of [[-radius, 0], [radius, 0], [0, -radius], [0, radius], [-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]]) {
        const candidate = { x: anchor.x + dx!, y: anchor.y + dy! };
        if (hitsOrigin(candidate) || occupied.some(p => Math.max(Math.abs(p.x-candidate.x), Math.abs(p.y-candidate.y)) < 56)) continue;
        offsets[index] = { x: dx!, y: dy! }; occupied.push(candidate); return;
      }
    }
  });
  return offsets;
}
