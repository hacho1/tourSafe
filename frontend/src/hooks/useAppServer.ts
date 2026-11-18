import { useSyncExternalStore } from 'react';
import { appServerVersion } from '../services/platform';
import { APP_SERVER_CHANGED } from '../utils/appServer';
function subscribe(onChange: () => void) {
  window.addEventListener(APP_SERVER_CHANGED, onChange);
  return () => window.removeEventListener(APP_SERVER_CHANGED, onChange);
}
export function useAppServer() { return useSyncExternalStore(subscribe, appServerVersion, () => ''); }
