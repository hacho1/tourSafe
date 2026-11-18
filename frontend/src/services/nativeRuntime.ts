import { App as AndroidApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { nativeApp, updateNativeConnection } from './platform';

export function initializeNativeApp() {
  if (!nativeApp) return;
  document.documentElement.classList.add('native-app');
  void Network.getStatus().then(status => updateNativeConnection(status.connected)).catch(() => {});
  void Network.addListener('networkStatusChange', status => updateNativeConnection(status.connected));
  void AndroidApp.addListener('appStateChange', state => {
    if (state.isActive) {
      void Network.getStatus().then(status => updateNativeConnection(status.connected)).catch(() => {});
      window.dispatchEvent(new Event('focus'));
    }
  });
  void AndroidApp.addListener('backButton', ({ canGoBack }) => {
    const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'));
    const dialog = dialogs.at(-1);
    if (dialog) dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    else if (canGoBack) window.history.back();
    else void AndroidApp.minimizeApp();
  });
}
