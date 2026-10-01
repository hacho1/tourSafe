export interface LatLng {}
export interface KakaoMap {
  setBounds: (bounds: LatLngBounds) => void;
  relayout: () => void;
  setCenter: (center: LatLng) => void;
}
export interface LatLngBounds {
  extend: (position: LatLng) => void;
}
export interface Marker {
  setMap: (map: KakaoMap | null) => void;
}
interface MarkerImage {}
interface Size {}
export interface KakaoMaps {
  load: (callback: () => void) => void;
  LatLng: new (lat: number, lng: number) => LatLng;
  Map: new (
    container: HTMLElement,
    options: { center: LatLng; level: number },
  ) => KakaoMap;
  LatLngBounds: new () => LatLngBounds;
  Marker: new (options: {
    map: KakaoMap;
    position: LatLng;
    title: string;
    image: MarkerImage;
  }) => Marker;
  MarkerImage: new (src: string, size: Size) => MarkerImage;
  Size: new (width: number, height: number) => Size;
  event: {
    addListener: (target: Marker, event: string, handler: () => void) => void;
    removeListener: (
      target: Marker,
      event: string,
      handler: () => void,
    ) => void;
  };
}
declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}
let loading: Promise<KakaoMaps> | null = null;
export function loadKakaoMap(): Promise<KakaoMaps> {
  if (loading) return loading;
  const key = import.meta.env.VITE_KAKAO_MAP_KEY;
  if (!key) return Promise.reject(new Error("MAP_NOT_CONFIGURED"));
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      script.remove();
      reject(new Error("MAP_TIMEOUT"));
    }, 12_000);
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps) {
        clearTimeout(timeout);
        reject(new Error("MAP_UNAVAILABLE"));
        return;
      }
      window.kakao.maps.load(() => {
        clearTimeout(timeout);
        resolve(window.kakao!.maps);
      });
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      reject(new Error("MAP_LOAD_FAILED"));
    };
    document.head.appendChild(script);
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
