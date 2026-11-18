import { Geolocation, type GeolocationPlugin } from '@capacitor/geolocation';
import { nativeApp } from './platform';

export function deviceLocation(): Pick<globalThis.Geolocation, 'getCurrentPosition'> | undefined {
  if (!nativeApp) return navigator.geolocation;
  return nativeDeviceLocation();
}

export function nativeDeviceLocation(provider: Pick<GeolocationPlugin, 'checkPermissions' | 'requestPermissions' | 'getCurrentPosition'> = Geolocation): Pick<globalThis.Geolocation, 'getCurrentPosition'> {
  return { getCurrentPosition(success, failure, options) {
    void (async () => {
      let permission = await provider.checkPermissions();
      if (permission.location !== 'granted' && permission.coarseLocation !== 'granted' &&
        (permission.location === 'prompt' || permission.location === 'prompt-with-rationale' || permission.coarseLocation === 'prompt' || permission.coarseLocation === 'prompt-with-rationale')) {
        permission = await provider.requestPermissions({ permissions: ['location'] });
      }
      if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
        failure?.({ code: 1, message: '위치 권한이 거부됐어요.', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); return;
      }
      const position = await provider.getCurrentPosition({ enableHighAccuracy: permission.location === 'granted' && (options?.enableHighAccuracy ?? true), timeout: options?.timeout ?? 10000, maximumAge: options?.maximumAge ?? 0 });
      success(position as unknown as GeolocationPosition);
    })().catch(error => {
      const code = error?.code === 'OS-PLUG-GLOC-0003' ? 1 : error?.code === 'OS-PLUG-GLOC-0010' ? 3 : 2;
      failure?.({ code, message: '기기 위치를 확인하지 못했어요.', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    });
  } };
}
