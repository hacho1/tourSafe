import type {
  Region,
  SearchOptions,
  SearchResponse,
} from "../../../shared/models";
async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(90_000)])
      : AbortSignal.timeout(90_000),
    cache: "no-store",
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(
      error.message || "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
    );
  }
  return response.json() as Promise<T>;
}
export const searchPlaces = (options: SearchOptions, signal?: AbortSignal) =>
  request<SearchResponse>(
    `/api/recommendations?${new URLSearchParams({ lat: String(options.lat), lng: String(options.lng), radius: String(options.radius), withKids: String(options.withKids) })}`,
    signal,
  );
export const searchRegions = (query: string, signal?: AbortSignal) =>
  request<{ regions: Region[]; preset: boolean }>(
    `/api/regions?q=${encodeURIComponent(query)}`,
    signal,
  );
