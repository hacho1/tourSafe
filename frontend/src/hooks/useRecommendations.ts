import { useEffect, useState } from "react";
import type { SearchOptions, SearchResponse } from "../../../shared/models";
import { searchPlaces } from "../services/api";
import { useConnection } from './useConnection';
import { useAppServer } from './useAppServer';
export function useRecommendations(options: SearchOptions) {
  const online = useConnection();
  const server = useAppServer();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError(null);
    searchPlaces(options, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(
            e instanceof TypeError
              ? "서버에 연결하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
              : e instanceof DOMException && e.name === "TimeoutError"
                ? "조회 시간이 길어지고 있습니다. 잠시 후 다시 시도해 주세요."
                : e instanceof Error
                  ? e.message
                  : "정보를 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [options.lat, options.lng, options.radius, options.withKids, retry, online, server]);
  useEffect(() => {
    if (!data || data.mode === 'DEMO' || data.offlineSnapshotAt || !online) return;
    const deadline = Date.parse(data.generatedAt) + 5 * 60_000;
    const renew = () => { if (document.visibilityState === 'visible' && Date.now() >= deadline) { setData(null); setRetry(v => v + 1); } };
    const timer = window.setTimeout(renew, Math.max(0, deadline - Date.now()));
    document.addEventListener('visibilitychange', renew);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', renew); };
  }, [data, online]);
  const current = data?.origin.lat === options.lat && data.origin.lng === options.lng && data.radiusMeters === options.radius ? data : null;
  return { data: current, loading, error, refresh: () => setRetry((v) => v + 1) };
}
