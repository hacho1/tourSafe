import { useSyncExternalStore } from 'react';
import { connected } from '../services/platform';
function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => { window.removeEventListener('online', onChange); window.removeEventListener('offline', onChange); };
}
export function useConnection() {
  return useSyncExternalStore(subscribe, connected, () => true);
}
