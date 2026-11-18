import type { HelpLocation } from './helpLocation';
import type { SavedPlaceIdentity } from './savedPlaces';

export type NearbyHelpCategory = 'TOILET' | 'MEDICAL';
export interface NearbyHelpRequest {
  requestId: number;
  category: NearbyHelpCategory;
  origin: HelpLocation | null;
}
export type NearbyHelpAction = (place: (SavedPlaceIdentity & { savedAt?: string }) | null, category: NearbyHelpCategory) => void;

/** Carry the saved coordinates verbatim. Never resolve a saved place by its name. */
export function savedHelpOrigin(place: (SavedPlaceIdentity & { savedAt?: string }) | null): HelpLocation | null {
  if (!place || place.source.kind === 'DEMO_DATA' || !['PUBLIC_DATA', 'KAKAO_MAP'].includes(place.source.kind) ||
    !place.name.trim() || !Number.isFinite(place.lat) || !Number.isFinite(place.lng) ||
    place.lat < 33 || place.lat > 39.5 || place.lng < 124 || place.lng > 132) return null;
  return { lat: place.lat, lng: place.lng, name: place.name, address: place.address,
    kind: 'saved', sourceName: place.source.name, savedAt: place.savedAt };
}
