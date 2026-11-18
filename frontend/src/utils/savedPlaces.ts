import type { TouristSpot } from '../../../shared/models';
import { removeVisitPlan } from './visitPlans';
export type SavedPlaceIdentity = Pick<TouristSpot, 'id' | 'name' | 'address' | 'phone' | 'lat' | 'lng' | 'source'>;
export type SavedPlace = SavedPlaceIdentity & { savedAt: string };
export const SAVED_PLACES_KEY = "toursafe-saved";
export const SAVED_PLACES_LIMIT = 100;
export const SAVED_PLACES_READ_ERROR =
  "저장한 장소를 불러오지 못해 저장 목록과 개수를 확인할 수 없습니다. 브라우저 저장소 설정을 확인한 뒤 다시 시도해 주세요.";
export const SAVED_PLACES_SAVE_ERROR =
  "장소를 저장하지 못했습니다. 브라우저 저장 공간과 설정을 확인한 뒤 다시 시도해 주세요.";
export const SAVED_PLACES_REMOVE_ERROR =
  "장소 저장을 해제하지 못했습니다. 브라우저 저장소 설정을 확인한 뒤 다시 시도해 주세요.";
export const SAVED_PLACES_PLAN_REMOVE_ERROR =
  "장소 저장은 해제했지만 방문 확인 질문을 지우지 못해 질문이 남아 있습니다. 브라우저 저장소 설정을 확인해 주세요.";

export interface SavedPlacesSnapshot {
  ids: string[];
  error: string;
  places?: Record<string, SavedPlace>;
}

export interface SavedPlacesStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface StorageChange {
  key: string | null;
  storageArea?: SavedPlacesStorage | null;
}

type ObserveStorage = (listener: (event: StorageChange) => void) => () => void;

function parseSaved(raw: string | null): { ids: string[]; places: Record<string, SavedPlace> } {
  if (raw === null) return { ids: [], places: {} };
  const value = JSON.parse(raw);
  const ids: unknown = Array.isArray(value) ? value : value?.version === 2 ? value.ids : null;
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id.trim())) throw new Error('Invalid saved places');
  const unique: string[] = [...new Set(ids as string[])].slice(0, SAVED_PLACES_LIMIT);
  const places: Record<string, SavedPlace> = {};
  if (!Array.isArray(value)) for (const id of unique) {
    const p = value.places?.[id];
    if (p && p.id === id && typeof p.name === 'string' && p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng) && typeof p.savedAt === 'string' && ['PUBLIC_DATA','KAKAO_MAP','DEMO_DATA'].includes(p.source?.kind)) {
      places[id] = { id, name:p.name, lat:p.lat, lng:p.lng, address:typeof p.address === 'string' ? p.address : null, phone:typeof p.phone === 'string' ? p.phone : null, source:p.source, savedAt:p.savedAt };
    }
  }
  return { ids: unique, places };
}

/** Minimal place snapshots and legacy IDs. Publish only after an atomic storage write succeeds. */
export function createSavedPlacesStore(
  getStorage: () => SavedPlacesStorage | null,
  observeStorage?: ObserveStorage,
) {
  let snapshot: SavedPlacesSnapshot = { ids: [], error: "" };
  const listeners = new Set<() => void>();
  let stopObserving: (() => void) | undefined;

  function read() {
    const storage = getStorage();
    if (!storage) throw new Error("Storage unavailable");
    return { storage, ...parseSaved(storage.getItem(SAVED_PLACES_KEY)) };
  }

  function publish(ids: string[], error: string, places = snapshot.places || {}) {
    const sameIds = ids.length === snapshot.ids.length && ids.every((id, index) => id === snapshot.ids[index]);
    if (sameIds && error === snapshot.error && JSON.stringify(places) === JSON.stringify(snapshot.places || {})) return;
    snapshot = { ids: sameIds ? snapshot.ids : ids, error, ...(Object.keys(places).length ? { places } : {}) };
    listeners.forEach((listener) => listener());
  }

  function refresh() {
    let current: ReturnType<typeof read>;
    try {
      current = read();
    } catch {
      publish(snapshot.ids, SAVED_PLACES_READ_ERROR);
      return;
    }
    publish(current.ids, "", current.places);
  }

  function onStorage(event: StorageChange) {
    if (event.key !== null && event.key !== SAVED_PLACES_KEY) return;
    try {
      if (event.storageArea && event.storageArea !== getStorage()) return;
    } catch {
      publish(snapshot.ids, SAVED_PLACES_READ_ERROR);
      return;
    }
    refresh();
  }

  refresh();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        stopObserving = observeStorage?.(onStorage);
        // Catch changes while every consumer was unmounted or before subscribing.
        refresh();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopObserving?.();
          stopObserving = undefined;
        }
      };
    },
    toggle(place: string | SavedPlaceIdentity, mode: 'toggle' | 'refresh' = 'toggle'): boolean {
      if (typeof place !== 'string' && (!place || typeof place.name !== 'string' || !Number.isFinite(place.lat) || !Number.isFinite(place.lng) || !['PUBLIC_DATA', 'KAKAO_MAP', 'DEMO_DATA'].includes(place.source?.kind))) return false;
      const id = typeof place === 'string' ? place : place.id;
      if (typeof id !== "string" || !id.trim()) return false;
      let current: ReturnType<typeof read>;
      try {
        // Read before writing so an intervening cross-tab change is preserved.
        current = read();
      } catch {
        publish(snapshot.ids, SAVED_PLACES_READ_ERROR);
        return false;
      }
      if (mode === 'refresh' && !current.ids.includes(id)) return false;
      const removing = mode === 'toggle' && current.ids.includes(id);
      const next = mode === 'refresh' ? current.ids : removing
        ? current.ids.filter((savedId) => savedId !== id)
        : [...current.ids, id].slice(-SAVED_PLACES_LIMIT);
      const places = { ...current.places };
      if (!removing && typeof place !== 'string') {
        const { id, name, address, phone, lat, lng, source } = place;
        places[id] = { id, name, address, phone, lat, lng, source, savedAt: current.places[id]?.savedAt || new Date().toISOString() };
      }
      for (const key of Object.keys(places)) if (!next.includes(key)) delete places[key];
      try {
        current.storage.setItem(SAVED_PLACES_KEY, JSON.stringify(Object.keys(places).length ? { version: 2, ids: next, places } : next));
      } catch {
        publish(snapshot.ids, removing ? SAVED_PLACES_REMOVE_ERROR : SAVED_PLACES_SAVE_ERROR);
        return false;
      }
      let planRemovalFailed = false;
      for (const removedId of current.ids.filter(savedId => !next.includes(savedId))) {
        try {
          removeVisitPlan(current.storage, removedId);
        } catch {
          planRemovalFailed = true;
        }
      }
      if (planRemovalFailed) {
        publish(next, SAVED_PLACES_PLAN_REMOVE_ERROR, places);
        return false;
      }
      publish(next, "", places);
      return true;
    },
    clearError() {
      publish(snapshot.ids, "");
    },
  };
}
