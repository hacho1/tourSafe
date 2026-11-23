import type { Coordinates } from '../../../shared/models.js';
import type { WalkingRoute, WalkingRoutes } from '../../../shared/walkingRoutes.js';

const endpoint = 'https://valhalla1.openstreetmap.de/route';
let busy = false;
let nextRequest = 0;

export class WalkingRouteError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function decodeShape(shape: string): WalkingRoute['coordinates'] {
  const coordinates: WalkingRoute['coordinates'] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  function delta() {
    let result = 0;
    for (let shift = 0; shift <= 25 && index < shape.length; shift += 5) {
      const byte = shape.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) break;
      result |= (byte & 31) << shift;
      if (byte < 32) return result & 1 ? ~(result >> 1) : result >> 1;
    }
    throw new Error('Invalid route geometry');
  }
  while (index < shape.length) {
    lat += delta();
    lng += delta();
    if (Math.abs(lat) > 90e6 || Math.abs(lng) > 180e6) throw new Error('Invalid route coordinate');
    coordinates.push([lng / 1e6, lat / 1e6]);
  }
  if (coordinates.length < 2) throw new Error('Empty route');
  return coordinates;
}

async function requestRoute(start: Coordinates, end: Coordinates, preferWalkways: boolean): Promise<WalkingRoute> {
  const wait = nextRequest - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  // The public FOSSGIS service permits at most one request per second.
  nextRequest = Date.now() + 1100;
  const url = new URL(endpoint);
  url.searchParams.set('json', JSON.stringify({
    locations: [start, end].map(({ lat, lng }) => ({ lat, lon: lng })),
    costing: 'pedestrian',
    costing_options: { pedestrian: preferWalkways
      ? { walkway_factor: 0.55, alley_factor: 4, driveway_factor: 4 }
      : { walkway_factor: 1, alley_factor: 1, driveway_factor: 1 } },
    units: 'kilometers',
    directions_type: 'none',
    shape_format: 'polyline6',
  }));
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'TripFit/0.1.3 (https://toursafe-hno2.onrender.com/)' },
    signal: AbortSignal.timeout(8500),
  });
  const data = await response.json();
  if (data.error_code === 442 || data.error_code === 171) {
    throw new WalkingRouteError(404, '이 출발지에서 목적지까지 도보 경로를 찾지 못했어요.');
  }
  const trip = data.trip;
  const shape = trip?.legs?.[0]?.shape;
  if (!response.ok || trip?.status !== 0 || !Number.isFinite(trip.summary?.time) ||
      !Number.isFinite(trip.summary?.length) || trip.summary.time <= 0 ||
      trip.summary.length <= 0 || typeof shape !== 'string' || shape.length > 300000) {
    throw new Error('Invalid walking route response');
  }
  return { seconds: trip.summary.time, meters: trip.summary.length * 1000, coordinates: decodeShape(shape) };
}

export async function compareWalkingRoutes(start: Coordinates, end: Coordinates): Promise<WalkingRoutes> {
  if (busy) throw new WalkingRouteError(429, '다른 경로를 조회 중이에요. 잠시 후 다시 시도해 주세요.');
  busy = true;
  try {
    const fast = await requestRoute(start, end, false);
    try {
      const comfort = await requestRoute(start, end, true);
      if (JSON.stringify(fast.coordinates) === JSON.stringify(comfort.coordinates)) {
        return { fast, comfort: null, alternative: 'same' };
      }
      if (comfort.seconds <= fast.seconds) return { fast: comfort, comfort: null, alternative: 'same' };
      return { fast, comfort, alternative: 'different' };
    } catch {
      return { fast, comfort: null, alternative: 'unavailable' };
    }
  } finally {
    busy = false;
  }
}
