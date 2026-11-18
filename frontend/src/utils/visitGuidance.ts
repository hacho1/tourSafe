export const GUIDE_SEEN_KEY = 'toursafe:guide-seen:v1';
export const NIGHT_DISMISSED_KEY = 'toursafe:night-dismissed:v1';
type GuidanceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function guidanceStorage(kind: 'localStorage' | 'sessionStorage'): GuidanceStorage | undefined {
  try { return window[kind]; } catch { return undefined; }
}

export function readGuidanceValue(storage: GuidanceStorage | undefined, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

export function saveGuidanceValue(storage: GuidanceStorage | undefined, key: string, value: string): void {
  try { storage?.setItem(key, value); } catch { /* Optional guidance still works in memory. */ }
}

/** Korean travel information uses KST. A night spans 20:00 through 05:59 the next day. */
export function koreanNightKey(now: Date): string | null {
  if (!Number.isFinite(now.getTime())) return null;
  const korea = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hour = korea.getUTCHours();
  if (hour >= 6 && hour < 20) return null;
  if (hour < 6) korea.setUTCDate(korea.getUTCDate() - 1);
  return korea.toISOString().slice(0, 10);
}
