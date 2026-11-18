import { useEffect, useState } from 'react';
import type { MapWeatherResponse } from '../../../shared/mapFacilities';
import type { Coordinates } from '../../../shared/models';
import { useConnection } from './useConnection';
import { useAppServer } from './useAppServer';
import { appFetch } from '../services/appFetch';

export function useMapWeather(center: Coordinates) {
  const online = useConnection();
  const server = useAppServer();
  const [data, setData] = useState<MapWeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false); setData(null);
    if (!online) { setLoading(false); setError(true); return () => controller.abort(); }
    appFetch(`/api/map-weather?${new URLSearchParams({ lat: String(center.lat), lng: String(center.lng) })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('날씨 조회 실패'); return response.json() as Promise<MapWeatherResponse>; })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [center.lat, center.lng, retry, online, server]);
  const current = data?.origin.lat === center.lat && data.origin.lng === center.lng ? data : null;
  return { data: current, loading, error, refresh: () => setRetry(n => n + 1) };
}
