import type { HospitalRegionId, HospitalResponse } from "../../../shared/hospitals";
import type { Coordinates } from '../../../shared/models';
import { offlineFetch } from './offline';

export type HospitalFetchErrorCode = "NETWORK" | "TIMEOUT" | "UPSTREAM" | "ACCESS" | "HTTP" | "RESPONSE" | "UNKNOWN";

const errorMessages: Record<HospitalFetchErrorCode, string> = {
  NETWORK: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  TIMEOUT: "조회 시간이 길어졌어요. 잠시 후 다시 시도해 주세요.",
  UPSTREAM: "병원 정보 제공 서비스의 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요. 문제가 계속되면 서비스 연결 설정을 확인해 주세요.",
  ACCESS: "병원 정보 서비스에 접근할 수 없어요. 서비스의 접근 권한이나 연결 설정을 확인해 주세요.",
  HTTP: "병원 정보 서비스에서 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요. 문제가 계속되면 서비스 연결 설정을 확인해 주세요.",
  RESPONSE: "병원 정보 서비스의 응답을 읽을 수 없어요. 잠시 후 다시 시도해 주세요.",
  UNKNOWN: "병원 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
};

export class HospitalFetchError extends Error {
  readonly code: HospitalFetchErrorCode;
  readonly status: number | undefined;

  constructor(code: HospitalFetchErrorCode, status?: number) {
    super(errorMessages[code]);
    this.name = "HospitalFetchError";
    this.code = code;
    this.status = status;
  }
}

export function hospitalFetchErrorMessage(error: unknown): string {
  return error instanceof HospitalFetchError ? errorMessages[error.code] : errorMessages.UNKNOWN;
}

function requestError(error: unknown, signal: AbortSignal, readingBody = false): unknown {
  const reason: unknown = signal.aborted ? signal.reason : error;
  if (reason instanceof Error && reason.name === "TimeoutError") return new HospitalFetchError("TIMEOUT");
  if (signal.aborted || (reason instanceof Error && reason.name === "AbortError")) return reason;
  if (readingBody) return new HospitalFetchError("RESPONSE");
  return new HospitalFetchError(error instanceof TypeError ? "NETWORK" : "UNKNOWN");
}

export async function fetchHospitals(
  region: HospitalRegionId | Coordinates,
  signal: AbortSignal,
  fetchImpl: typeof fetch = offlineFetch,
): Promise<HospitalResponse> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(90_000)]);
  let response: Response;
  try {
    const query: Record<string, string> = typeof region === 'string' ? { region } : { lat: String(region.lat), lng: String(region.lng) };
    response = await fetchImpl(`/api/hospitals?${new URLSearchParams(query)}`, {
      signal: requestSignal,
      cache: "no-store",
    });
  } catch (error: unknown) {
    throw requestError(error, requestSignal);
  }
  if (!response.ok) {
    const code = [502, 503, 504].includes(response.status) ? "UPSTREAM"
      : [401, 403].includes(response.status) ? "ACCESS" : "HTTP";
    throw new HospitalFetchError(code, response.status);
  }
  try {
    return await response.json() as HospitalResponse;
  } catch (error: unknown) {
    throw requestError(error, requestSignal, true);
  }
}
