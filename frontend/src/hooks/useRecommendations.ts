import { useEffect, useState } from "react";
import type { SearchOptions, SearchResponse } from "../../../shared/models";
import { searchPlaces } from "../services/api";
export function useRecommendations(options: SearchOptions) {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
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
  }, [options.lat, options.lng, options.radius, options.withKids, retry]);
  return { data, loading, error, refresh: () => setRetry((v) => v + 1) };
}
