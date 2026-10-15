import type { Region } from "../../../shared/models";

export interface SearchLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

const MAX_LOCATION_AGE_MS = 60_000;
const MAX_FUTURE_SKEW_MS = 10_000;
const MANUAL_FALLBACK = "선택한 위치를 사용하거나 지역을 직접 검색해 주세요.";
const TIMEOUT_MESSAGE = `위치 확인 시간이 초과되었습니다. ${MANUAL_FALLBACK}`;

export function isFreshSearchLocation(value: SearchLocation, now = Date.now()): boolean {
  return Number.isFinite(now) &&
    Number.isFinite(value.latitude) && value.latitude >= 33 && value.latitude <= 39.5 &&
    Number.isFinite(value.longitude) && value.longitude >= 124 && value.longitude <= 132 &&
    Number.isFinite(value.accuracy) && value.accuracy >= 0 &&
    Number.isFinite(value.timestamp) && value.timestamp > 0 &&
    value.timestamp <= now + MAX_FUTURE_SKEW_MS &&
    now - value.timestamp <= MAX_LOCATION_AGE_MS;
}

export function searchLocationRegion(value: SearchLocation): Region {
  const capturedAt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date(value.timestamp));
  return {
    name: "마지막 확인 위치",
    address: `${capturedAt} (KST) 확인 · 정확도 약 ${Math.ceil(value.accuracy)}m`,
    lat: value.latitude,
    lng: value.longitude,
  };
}

/** Owns at most one GPS reading; cancellation never changes the selected region. */
export function createSearchLocationController(now: () => number = Date.now) {
  let cancelCurrent: (() => void) | undefined;
  const cancel = () => { cancelCurrent?.(); };

  function request(
    geo: Pick<Geolocation, "getCurrentPosition"> | undefined,
    onSuccess: (region: Region) => void,
    onError: (message: string) => void,
  ): () => void {
    cancel();
    let settled = false;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const settle = (): boolean => {
      if (settled) return false;
      settled = true;
      if (timer !== undefined) globalThis.clearTimeout(timer);
      timer = undefined;
      if (cancelCurrent === cancelRequest) cancelCurrent = undefined;
      return true;
    };
    const cancelRequest = () => { settle(); };
    const fail = (message: string) => { if (settle()) onError(message); };
    cancelCurrent = cancelRequest;

    if (!geo || typeof geo.getCurrentPosition !== "function") {
      fail(`위치 기능을 사용할 수 없습니다. ${MANUAL_FALLBACK}`);
      return cancelRequest;
    }

    // Browser timeout may exclude time spent waiting for a permission decision.
    timer = globalThis.setTimeout(() => fail(TIMEOUT_MESSAGE), 11_000);
    try {
      geo.getCurrentPosition((position) => {
        if (settled) return;
        const location: SearchLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        if (!isFreshSearchLocation(location, now())) {
          fail(`최신 대한민국 위치를 확인하지 못했습니다. ${MANUAL_FALLBACK}`);
          return;
        }
        if (location.accuracy > 3000) {
          fail(`위치 오차가 약 ${Math.ceil(location.accuracy / 1000)}km여서 주변 거리 안내가 어려워요. ${MANUAL_FALLBACK}`);
          return;
        }
        if (settle()) onSuccess(searchLocationRegion(location));
      }, (error) => {
        fail(error.code === 1
          ? `위치 권한이 허용되지 않았습니다. ${MANUAL_FALLBACK}`
          : error.code === 3 ? TIMEOUT_MESSAGE
            : `현재 위치를 찾지 못했습니다. ${MANUAL_FALLBACK}`);
      }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 });
    } catch {
      fail(`위치 확인을 시작하지 못했습니다. ${MANUAL_FALLBACK}`);
    }
    return cancelRequest;
  }

  return { request, cancel };
}
