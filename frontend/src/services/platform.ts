import { Capacitor } from '@capacitor/core';
import { APP_SERVER_CHANGED, APP_SERVER_KEY, USB_SERVER } from '../utils/appServer';

export const nativeApp = Capacitor.isNativePlatform();
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
  try { return localStorage.getItem(APP_SERVER_KEY) || USB_SERVER; } catch { return USB_SERVER; }
}
