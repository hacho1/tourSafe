import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';
import type { Region } from '../../../shared/models';
import type { WalkingRoutes } from '../../../shared/walkingRoutes';
import { useConnection } from '../hooks/useConnection';
import { appFetch } from '../services/appFetch';
import { distance } from '../utils/format';
import { helpLocationLabel, type HelpLocation } from '../utils/helpLocation';
import { HelpLocationPicker } from './HelpLocationPicker';
import { Modal } from './Modal';
import { MapErrorBoundary } from './MapErrorBoundary';
import './walking-routes.css';

const RouteMap = lazy(() => import('./TourSafeMapPanel'));
export const WalkingRouteOrigin = createContext<HelpLocation | null>(null);

export function WalkingRouteButton({ destination, className, label = '길찾기' }: {
  destination: Pick<Region, 'name' | 'lat' | 'lng'>;
  className?: string;
  label?: string;
}) {
  const origin = useContext(WalkingRouteOrigin);
  const [open, setOpen] = useState(false);
  if (!origin || !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) return null;
  return <>
    <button type="button" className={className} onClick={() => setOpen(true)}><Navigation size={16} aria-hidden="true" />{label}</button>
    {open && <WalkingRouteDialog origin={origin} destination={destination} onClose={() => setOpen(false)} />}
  </>;
}

function WalkingRouteDialog({ origin, destination, onClose }: {
  origin: HelpLocation;
  destination: Pick<Region, 'name' | 'lat' | 'lng'>;
  onClose: () => void;
}) {
  const [start, setStart] = useState<Region>({ ...origin, name: helpLocationLabel(origin) });
  const [picker, setPicker] = useState(false);
  const [routes, setRoutes] = useState<WalkingRoutes | null>(null);
  const [selected, setSelected] = useState<'fast' | 'comfort'>('fast');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const online = useConnection();
  const request = useRef<AbortController | null>(null);
  const pickerTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  function closePicker() {
    setPicker(false);
    requestAnimationFrame(() => pickerTrigger.current?.focus({ preventScroll: true }));
  }
  async function findRoutes() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    setRoutes(null);
    setSelected('fast');
    const query = new URLSearchParams({
      fromLat: start.lat.toFixed(5), fromLng: start.lng.toFixed(5),
      toLat: destination.lat.toFixed(5), toLng: destination.lng.toFixed(5),
    });
    try {
      const response = await appFetch('/api/walking-routes?' + query, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(22000)]), cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '도보 경로를 불러오지 못했어요.');
      if (!controller.signal.aborted) setRoutes(data);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error && failure.name === 'Error' ? failure.message : '도보 경로를 불러오지 못했어요. 연결을 확인해 주세요.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  const line = routes && (selected === 'comfort' ? routes.comfort : routes.fast);
  return <>
    <Modal title="도보 경로 비교" className="walking-route-dialog centered-dialog" onClose={onClose}>
      <div className="walking-route-body">
        <dl className="walking-route-places">
          <div><dt>출발</dt><dd>{start.name}</dd></div>
          <div><dt>도착</dt><dd>{destination.name}</dd></div>
        </dl>
        <div className="walking-route-actions">
          <button type="button" ref={pickerTrigger} className="secondary" disabled={loading} onClick={() => setPicker(true)}>출발지 변경</button>
          <button type="button" className="primary" disabled={loading || !online} onClick={findRoutes}>{loading ? '조회 중…' : routes ? '다시 조회' : '경로 찾기'}</button>
        </div>
        {!online ? <p role="status">새 도보 경로를 찾으려면 인터넷에 연결해 주세요.</p>
          : !routes && !loading && !error && <p>경로를 찾을 때 출발지와 도착지 좌표를 OpenStreetMap 경로 서버에 보내요.</p>}
        {loading && <p role="status">두 도보 경로를 찾고 있어요.</p>}
        {error && <p role="alert" className="walking-route-error">{error}</p>}
        {routes && <div className="walking-route-options" role="group" aria-label="도보 경로 선택">
          <button type="button" aria-pressed={selected === 'fast'} onClick={() => setSelected('fast')}>
            <b>빠른 길</b><small>이동 시간 우선</small><span>약 {Math.ceil(routes.fast.seconds / 60)}분 · {distance(routes.fast.meters)}</span>
          </button>
          <button type="button" aria-pressed={selected === 'comfort'} disabled={!routes.comfort} onClick={() => setSelected('comfort')}>
            <b>안심 길</b><small>등록된 보행로 우선</small><span>{routes.comfort
              ? '약 ' + Math.ceil(routes.comfort.seconds / 60) + '분 · ' + distance(routes.comfort.meters)
              : routes.alternative === 'same' ? '빠른 길과 동일' : '대안 조회 불가'}</span>
          </button>
        </div>}
        {line && <div className="walking-route-map">
          <MapErrorBoundary fallback={<p role="status">지도를 표시하지 못했어요. 위에서 예상 거리와 시간을 확인할 수 있어요.</p>}>
            <Suspense fallback={<p role="status">지도를 불러오는 중…</p>}>
              <RouteMap center={start} originLabel="출발지" points={[{ ...destination, id: 'route-destination', type: 'SPOT' }]} walkingRoute={line} routeKind={selected} />
            </Suspense>
          </MapErrorBoundary>
        </div>}
        {routes && <p className="walking-route-source">안심 길은 지도에 등록된 보행로를 우선해요. 현장 통행·조명 상태는 확인되지 않았어요. 경로 자료 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">지도 수정</a></p>}
      </div>
    </Modal>
    {picker && <HelpLocationPicker title="출발지 선택" onClose={closePicker} onChoose={place => {
      setStart(place);
      setRoutes(null);
      setError('');
      closePicker();
    }} />}
  </>;
}
