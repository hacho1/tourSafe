import { createContext, useContext, useEffect, useState } from 'react';
import { Navigation, X } from 'lucide-react';
import type { Coordinates } from '../../../shared/models';
import type { WalkingRoutes } from '../../../shared/walkingRoutes';
import { useConnection } from '../hooks/useConnection';
import { appFetch } from '../services/appFetch';
import { distance } from '../utils/format';
import './walking-routes.css';

export type RouteDestination = Coordinates & { name: string };
export const StartWalkingRoute = createContext<((destination: RouteDestination) => void) | null>(null);

export function WalkingRouteButton({ destination, className, label = '길찾기' }: {
  destination: RouteDestination;
  className?: string;
  label?: string;
}) {
  const startRoute = useContext(StartWalkingRoute);
  if (!startRoute || !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) return null;
  return <button type="button" className={className} onClick={() => startRoute(destination)}><Navigation size={16} aria-hidden="true" />{label}</button>;
}

export function useWalkingRoute(origin: Coordinates, destination: RouteDestination | null) {
  const online = useConnection();
  const [routes, setRoutes] = useState<WalkingRoutes | null>(null);
  const [selected, setSelected] = useState<'fast' | 'comfort'>('fast');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { lat, lng } = origin;

  useEffect(() => {
    setRoutes(null);
    setSelected('fast');
    setError('');
    setLoading(Boolean(destination && online));
    if (!destination || !online) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      fromLat: lat.toFixed(5), fromLng: lng.toFixed(5),
      toLat: destination.lat.toFixed(5), toLng: destination.lng.toFixed(5),
    });
    appFetch('/api/walking-routes?' + query, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(22000)]), cache: 'no-store',
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '도보 경로를 불러오지 못했어요.');
      if (!controller.signal.aborted) setRoutes(data);
    }).catch(failure => {
      if (!controller.signal.aborted) setError(failure instanceof Error && failure.name === 'Error' ? failure.message : '도보 경로를 불러오지 못했어요. 연결을 확인해 주세요.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [lat, lng, destination, online, attempt]);

  const line = routes && (selected === 'comfort' ? routes.comfort : routes.fast);
  return { routes, line, selected, setSelected, error, loading, online, retry: () => setAttempt(value => value + 1) };
}

export function WalkingRoutePanel({ route, origin, destination, onClose }: {
  route: ReturnType<typeof useWalkingRoute>;
  origin: string;
  destination: RouteDestination;
  onClose: () => void;
}) {
  const { routes, selected, setSelected, error, loading, online, retry } = route;
  return <section className="walking-route-panel" aria-label="도보 경로 비교">
    <div className="walking-route-heading">
      <div><h2>{destination.name}</h2><p>{origin}에서 출발</p></div>
      <button type="button" className="icon-button route-close" onClick={onClose} aria-label="경로 닫기"><X size={20} aria-hidden="true" /></button>
    </div>
    {!online && <p role="status">새 경로를 찾으려면 인터넷에 연결해 주세요.</p>}
    {loading && <p role="status">두 도보 경로를 찾고 있어요.</p>}
    {error && <div className="walking-route-error"><p role="alert">{error}</p><button type="button" className="secondary" onClick={retry}>다시 조회</button></div>}
    {routes && <div className="walking-route-options" role="group" aria-label="도보 경로 선택">
      <button type="button" aria-pressed={selected === 'fast'} onClick={() => setSelected('fast')}>
        <b>빠른 길</b><small>이동 시간 우선</small><span>약 {Math.ceil(routes.fast.seconds / 60)}분 · {distance(routes.fast.meters)}</span>
      </button>
      <button type="button" aria-pressed={selected === 'comfort'} disabled={!routes.comfort} onClick={() => setSelected('comfort')}>
        <b>안심 길</b><small>등록 보행로 우선</small><span>{routes.comfort
          ? '약 ' + Math.ceil(routes.comfort.seconds / 60) + '분 · ' + distance(routes.comfort.meters)
          : routes.alternative === 'same' ? '빠른 길과 동일' : '대안 조회 불가'}</span>
      </button>
    </div>}
    {routes && <details className="walking-route-source"><summary>경로 기준과 출처</summary>
      <p>안심 길은 등록된 보행로를 우선해요. 현장 통행·조명 상태는 확인되지 않았어요. 출발지와 도착지 좌표로 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> 기반 경로를 조회해요. <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">지도 수정</a></p>
    </details>}
  </section>;
}
