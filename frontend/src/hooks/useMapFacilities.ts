import { useEffect, useState } from 'react';
import type { MapFacilitiesResponse } from '../../../shared/mapFacilities';
import type { Coordinates } from '../../../shared/models';
import { offlineFetch } from '../services/offline';
import { useConnection } from './useConnection';
import { useAppServer } from './useAppServer';

export function useMapFacilities(center: Coordinates, area: string) {
  const online = useConnection();
  const server = useAppServer();
  const [data, setData] = useState<MapFacilitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false); setData(null);
    offlineFetch(`/api/map-facilities?${new URLSearchParams({ lat: String(center.lat), lng: String(center.lng), area })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('시설 조회 실패'); return response.json() as Promise<MapFacilitiesResponse>; })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [center.lat, center.lng, area, retry, online, server]);
  const current = data?.origin.lat === center.lat && data.origin.lng === center.lng ? data : null;
  return { data: current, loading, error, refresh: () => setRetry(n => n + 1) };
}
