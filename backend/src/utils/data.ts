import type {
  DataSource,
  Evidence,
  SafetyEnvironment,
  WeatherInfo,
} from "../../../shared/models.js";

export const unknown = <T>(): Evidence<T> => ({
  value: null,
  status: "UNKNOWN",
  source: null,
  updatedAt: null,
});
export const confirmed = <T>(
  value: T,
  source: DataSource,
  updatedAt: string | null = null,
): Evidence<T> => ({ value, status: "CONFIRMED", source, updatedAt });
export const unavailable = (
  source: DataSource,
  updatedAt: string | null = null,
): Evidence<boolean> => ({
  value: false,
  status: "NOT_AVAILABLE",
  source,
  updatedAt,
});
export const emptySafety = (): SafetyEnvironment => ({
  strollerAccessible: unknown(),
  railing: unknown(),
  watersideProtection: unknown(),
  shade: unknown(),
  benches: unknown(),
  drinkingWater: unknown(),
  lighting: unknown(),
  pedestrianSeparation: unknown(),
  toilet: unknown(),
  nursingRoom: unknown(),
});
export const emptyWeather = (): WeatherInfo => ({
  temperature: unknown(),
  precipitation: unknown(),
  precipitationProbability: unknown(),
  windSpeed: unknown(),
  condition: unknown(),
  severeAlert: unknown(),
});
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function list(value: unknown): Record<string, unknown>[] {
  return (
    Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? [value]
        : []
  ).map(record);
}
export function str(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : typeof value === "number"
      ? String(value)
      : null;
}
export function num(value: unknown): number | null {
  const text = str(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
export function plain(value: unknown): string | null {
  return (
    str(value)
      ?.replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .trim() || null
  );
}
export function safeImage(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  try {
    const u = new URL(s);
    return ["http:", "https:"].includes(u.protocol)
      ? u.href.replace(/^http:/, "https:")
      : null;
  } catch {
    return null;
  }
}
export function isoDate(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  if (/^\d{14}$/.test(s))
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}+09:00`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
