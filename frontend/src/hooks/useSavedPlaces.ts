import { useSyncExternalStore } from "react";
import { createSavedPlacesStore, type SavedPlacesSnapshot } from "../utils/savedPlaces";

const serverSnapshot: SavedPlacesSnapshot = { ids: [], error: "" };
const store = createSavedPlacesStore(
  () => (typeof window === "undefined" ? null : window.localStorage),
  (listener) => {
    if (typeof window === "undefined") return () => {};
    const onStorage = (event: StorageEvent) => listener(event);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },
);

export function useSavedPlaces() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => serverSnapshot);
  return { ...snapshot, toggle: store.toggle, clearError: store.clearError };
}
