import { Capacitor } from '@capacitor/core';
import { APP_SERVER_CHANGED, APP_SERVER_KEY, normalizeAppServer, USB_SERVER } from '../utils/appServer';

export const APP_BACKGROUNDED = 'toursafe:app-backgrounded';
export const nativeApp = Capacitor.isNativePlatform();
export const defaultAppServer = import.meta.env?.VITE_TOURSAFE_APP_SERVER
  ? normalizeAppServer(import.meta.env.VITE_TOURSAFE_APP_SERVER)
  : USB_SERVER;
// Do not start online lookups until the OS has reported the native network state.
let nativeConnected: boolean | undefined = nativeApp ? false : undefined;
let serverRevision = 0;
export function appServerVersion(): string { return `${appServer()}:${serverRevision}`; }
export function refreshAppServer() {
  serverRevision++;
  window.dispatchEvent(new Event(APP_SERVER_CHANGED));
}
export function connected(): boolean {
  return nativeApp && nativeConnected !== undefined ? nativeConnected : typeof navigator === 'undefined' || navigator.onLine;
}
export function updateNativeConnection(value: boolean) {
  nativeConnected = value;
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}
export function appServer(): string {
  if (!nativeApp) return '';
  try { return localStorage.getItem(APP_SERVER_KEY) || defaultAppServer; } catch { return defaultAppServer; }
}
