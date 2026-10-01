import type { Coordinates, DataSource, Evidence } from "../../../shared/models";
export function distance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)}m`
    : `${(meters / 1000).toFixed(1)}km`;
}
export const sourceLabel = (source: DataSource | null) =>
  source?.kind === "DEMO_DATA" ? "시연 데이터" : source?.name || "출처 미확인";
export const evidenceLabel = (e: Evidence<boolean>) =>
  e.status === "UNKNOWN" || e.value === null
    ? "미확인"
    : e.value
      ? "확인됨"
      : "없음 확인";
export function dateLabel(value: string | null): string {
  if (!value) return "갱신일 미제공";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "갱신일 미제공"
    : new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
}
export function timeLabel(value: string | null): string {
  if (!value) return "관측시각 미확인";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "관측시각 미확인"
    : new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
}
export function mapLink(name: string, coords: Coordinates) {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${coords.lat},${coords.lng}`;
}
export function phoneLink(phone: string | null): string | null {
  if (!phone || !/^\+?\d[\d\s().-]{6,22}\d$/.test(phone.trim())) return null;
  const clean = phone?.replace(/[^+\d]/g, "");
  return clean && clean.length >= 8 && clean.length <= 16 ? `tel:${clean}` : null;
}
