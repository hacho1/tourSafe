import type { Coordinates } from '../../../shared/models.js';
import type { MapFacilitiesResponse, MapFacilityType } from '../../../shared/mapFacilities.js';
import { config } from '../config.js';
import { getPublicFacilities, hasPublicFacilities, summarizeCctv } from '../adapters/publicFacilities.js';
import { getMedical } from '../adapters/medicalApi.js';
import { getPolice } from '../adapters/policeApi.js';
import { getWeather } from '../adapters/weatherApi.js';
import { emptyWeather } from '../utils/data.js';
import { safeAdapter } from './recommendations.js';
import { haversine } from '../utils/geo.js';
import { regionAtCoordinates } from '../adapters/kakaoMapApi.js';

export async function getMapFacilities(origin: Coordinates, area: string): Promise<MapFacilitiesResponse> {
  const [local, medical, police] = await Promise.all([
    safeAdapter('publicFiles', '공공시설 자료', hasPublicFacilities(), async () => {
      const resolvedArea = area || await regionAtCoordinates(origin).then(region => region.area).catch(() => '');
      return getPublicFacilities(origin, 3000, resolvedArea);
    }, { facilities: [], qualityIssues: [], toiletCoordinates: 'PARTIAL' as const, unlocatedToilets: { area, total: 0, items: [] } }),
    safeAdapter('medical', '주변 응급의료', !!config.medicalKey, () => getMedical(origin), []),
    safeAdapter('police', '경찰시설', !!config.kakaoKey, () => getPolice(origin), []),
  ]);
  const totals: Partial<Record<MapFacilityType, number>> = {};
  const all = [...local.data.facilities, ...medical.data, ...police.data].filter(item => item.distanceMeters <= 3000);
  for (const item of all) totals[item.type] = (totals[item.type] || 0) + 1;
  const counts: Partial<Record<MapFacilityType, number>> = {};
  // Keep the map legible. Counts describe the imported/query result, not total coverage.
  const selectedCctv: Coordinates[] = [];
  const toiletLocations = new Set<string>();
  const facilities = all.filter(item => {
    if (item.type === 'TOILET') {
      const key = item.lat.toFixed(6) + ',' + item.lng.toFixed(6);
      if (!toiletLocations.has(key) && toiletLocations.size >= 20) return false;
      toiletLocations.add(key); return true;
    }
    if (item.type === 'CCTV') {
      if (selectedCctv.length >= 40 || selectedCctv.some(point => haversine(point, item) < 140)) return false;
      selectedCctv.push(item);
      return true;
    }
    return (counts[item.type] = (counts[item.type] || 0) + 1) <= 20;
  });
  return { origin, facilities, totals, cctvSummary: local.status.status === 'OK' ? summarizeCctv(local.data.facilities) : undefined, unlocatedToilets: local.data.unlocatedToilets, qualityIssues: local.data.qualityIssues, toiletCoordinates: local.data.toiletCoordinates, statuses: [local.status, medical.status, police.status] };
}

export async function getMapWeather(origin: Coordinates) {
  const result = await safeAdapter('weather', '날씨', !!config.weatherKey, () => getWeather(origin), emptyWeather());
  return { origin, weather: result.data, status: result.status };
}
