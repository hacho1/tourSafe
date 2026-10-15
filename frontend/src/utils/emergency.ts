export type EmergencyLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

const MAX_LOCATION_AGE_MS = 120_000;
const MAX_FUTURE_SKEW_MS = 10_000;
const MANUAL_LOCATION_FALLBACK = "주소나 주변 표지를 직접 입력해 주세요.";
const LOCATION_TIMEOUT_MESSAGE = `위치 확인 시간이 초과되었습니다. ${MANUAL_LOCATION_FALLBACK}`;

export function isFreshEmergencyLocation(value: EmergencyLocation, now = Date.now()): boolean {
  return Number.isFinite(now) &&
    Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 &&
    Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180 &&
    Number.isFinite(value.accuracy) && value.accuracy >= 0 &&
    Number.isFinite(value.timestamp) && value.timestamp > 0 &&
    value.timestamp <= now + MAX_FUTURE_SKEW_MS &&
    now - value.timestamp <= MAX_LOCATION_AGE_MS;
}

export function formatEmergencyLocation(value: EmergencyLocation): string {
  const capturedAt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date(value.timestamp));
  return `위도 ${value.latitude.toFixed(5)}, 경도 ${value.longitude.toFixed(5)} · 정확도 약 ${Math.ceil(value.accuracy)}m · 확인 ${capturedAt}`;
}

export function buildEmergencyMessage(landmark: string, location: EmergencyLocation | null, now = Date.now()): string {
  const lines = ["도움이 필요합니다."];
  const manualLocation = landmark.trim();
  const hasFreshLocation = location !== null && isFreshEmergencyLocation(location, now);
  if (manualLocation) lines.push(`현재 위치/주변 표지: ${manualLocation}`);
  if (hasFreshLocation) lines.push(`GPS 위치: ${formatEmergencyLocation(location)}`);
  if (!manualLocation && !hasFreshLocation) lines.push("현재 위치는 아직 확인하지 못했습니다.");
  return lines.join("\n");
}

function locationErrorMessage(code: number): string {
  if (code === 1) return `위치 권한이 거부되었습니다. 브라우저의 위치 권한을 확인하거나 ${MANUAL_LOCATION_FALLBACK}`;
  if (code === 3) return LOCATION_TIMEOUT_MESSAGE;
  return `현재 위치를 확인하지 못했습니다. ${MANUAL_LOCATION_FALLBACK}`;
}

/** Requests one reading only; cancellation ignores browser callbacks and clears the watchdog. */
export function requestEmergencyLocation(
  geo: Pick<Geolocation, "getCurrentPosition"> | undefined,
  onSuccess: (location: EmergencyLocation) => void,
  onError: (message: string) => void,
  now: () => number = Date.now,
): () => void {
  let settled = false;
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const settle = (): boolean => {
    if (settled) return false;
    settled = true;
    if (timer !== undefined) globalThis.clearTimeout(timer);
    timer = undefined;
    return true;
  };
  const fail = (message: string): void => {
    if (settle()) onError(message);
  };
  const cancel = (): void => { settle(); };

  if (!geo || typeof geo.getCurrentPosition !== "function") {
    fail(`이 브라우저에서는 위치 확인을 사용할 수 없습니다. ${MANUAL_LOCATION_FALLBACK}`);
    return cancel;
  }

  // Some browsers keep permission prompts pending beyond the geolocation timeout.
  timer = globalThis.setTimeout(() => fail(LOCATION_TIMEOUT_MESSAGE), 11_000);
  try {
    geo.getCurrentPosition((position) => {
      if (settled) return;
      const location: EmergencyLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      };
      if (!isFreshEmergencyLocation(location, now())) {
        fail(`최신 위치를 확인하지 못했습니다. 다시 시도하거나 ${MANUAL_LOCATION_FALLBACK}`);
        return;
      }
      if (settle()) onSuccess(location);
    }, (error) => fail(locationErrorMessage(error.code)), {
      maximumAge: 0, timeout: 10_000, enableHighAccuracy: true,
    });
  } catch {
    fail(`위치 확인을 시작하지 못했습니다. 브라우저의 위치 권한을 확인하거나 ${MANUAL_LOCATION_FALLBACK}`);
  }
  return cancel;
}
