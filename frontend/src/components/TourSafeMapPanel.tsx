import { useEffect, useRef, useState, type ReactNode } from "react";
import { Map, Marker, LngLatBounds, AttributionControl, ScaleControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { Building2, LocateFixed, Minus, Moon, Plus, Sun, SlidersHorizontal } from "lucide-react";
import { Modal } from './Modal';
import type { Coordinates } from "../../../shared/models";
import type { MapPoint } from "./MapPanel";
import { tourSafeMapStyle, type MapTheme } from "../config/tourSafeMapStyle";
import { WalkingRouteButton } from './WalkingRoute';
import type { WalkingRoute } from '../../../shared/walkingRoutes';
import { canExpandMapCluster, groupMapPins, isCctvOnly, originSafeOffsets, mapPointKind } from '../utils/mapLayers';

setWorkerUrl(workerUrl);
const validPoint = (p: Coordinates) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
const iconPaths = {
  camera: ["M3 6h12v12H3V6Z", "m15 10 6-4v12l-6-4"],
  info: ["M12 11v6m0-10v1", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"],
  nature: ["M12 3 5 12h4l-5 6h16l-5-6h4L12 3Z", "M12 18v3"],
  culture: ["m3 9 9-6 9 6H3Z", "M5 10v8m7-8v8m7-8v8M3 21h18"],
  sports: ["m3 17 6-9 4 6 3-4 5 7H3Z"],
  medical: ["M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"],
  hospital: ["M4 21V5h16v16M2 21h20M9 21v-5h6v5M9 9h6m-3-3v6"],
  police: ["m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z", "m8 12 3 3 5-6"],
  toilet: ["M3 3h6v9H3V3Z", "M3 12h18v2a7 7 0 0 1-7 7h-3a7 7 0 0 1-7-7", "M11 21v1h6v-2", "M6 6v2"],
  other: ["M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12Z", "M12 7v5"],
};
function markerIcon(point: MapPoint) {
  const kind = point.type === "CCTV" ? "camera" : point.type === "TOURIST_INFO" ? "info" : point.type === "MEDICAL" ? "medical" : point.type === 'HOSPITAL' ? 'hospital' : point.type === "POLICE" ? "police" : point.type === 'TOILET' ? 'toilet' : point.type !== "SPOT" ? "other" : point.category === "문화시설" ? "culture" : point.category === "레포츠" ? "sports" : "nature";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", width: "19", height: "19", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
  iconPaths[kind].forEach(d => { const path = document.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", d); svg.append(path); });
  return { svg, kind };
}

export default function TourSafeMapPanel({ points, selected, onSelect, center, immersive = false, children, originLabel, onViewCenter, settingsContent, visible = true, walkingRoute, routeKind = "fast" }: {
  points: MapPoint[]; selected?: string; onSelect?: (id: string) => void;
  center?: Coordinates; immersive?: boolean; children?: ReactNode;
  originLabel?: string; onViewCenter?: (center: Coordinates) => void;
  settingsContent?: (close: () => void) => ReactNode;
  visible?: boolean;
  walkingRoute?: WalkingRoute;
  routeKind?: "fast" | "comfort";
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const latest = useRef({ points, center, onSelect, onViewCenter });
  latest.current = { points, center, onSelect, onViewCenter };
  const [theme, setTheme] = useState<MapTheme>("dark");
  const [detail, setDetail] = useState(false);
  const styleRef = useRef({ theme, detail });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const [clusterMessage, setClusterMessage] = useState('');
  const clusterTrigger = useRef<HTMLButtonElement | null>(null);
  const focusedMarker = useRef<string | undefined>(undefined);
  const clusterPoints = points.filter(point => clusterIds.includes(point.id));
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!visible) { setSettingsOpen(false); setClusterIds([]); } }, [visible]);
  useEffect(() => setClusterIds([]), [center?.lat, center?.lng]);
  function closeCluster() { setClusterIds([]); requestAnimationFrame(() => { if (clusterTrigger.current?.isConnected) clusterTrigger.current.focus(); else mapRef.current?.getCanvas().focus(); }); }
  function closeSettings() { setSettingsOpen(false); requestAnimationFrame(() => settingsTrigger.current?.focus({ preventScroll: true })); }
  useEffect(() => {
    styleRef.current = { theme, detail };
    mapRef.current?.setStyle(tourSafeMapStyle(theme, detail));
  }, [theme, detail]);
  useEffect(() => {
    if (!container.current) return;
    const origin = latest.current.center ?? latest.current.points.find(validPoint) ?? { lat: 37.5445, lng: 127.0374 };
    setLoaded(false); setFailed(false);
    let map: Map;
    try {
      map = new Map({
        container: container.current, style: tourSafeMapStyle(styleRef.current.theme, styleRef.current.detail),
        center: [origin.lng, origin.lat], zoom: immersive ? container.current.clientWidth > 600 ? 15.5 : 14 : 14,
        attributionControl: false, scrollZoom: false, dragRotate: false,
        pitchWithRotate: false, touchPitch: false, maxZoom: 19, minZoom: 5,
        localIdeographFontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif',
      });
    } catch { setFailed(true); return; }
    mapRef.current = map;
    map.on('moveend', () => { const point = map.getCenter(); latest.current.onViewCenter?.({ lat: point.lat, lng: point.lng }); });
    map.touchZoomRotate.disableRotation();
    map.getCanvas().setAttribute("aria-label", "실제 도로 지도 · 화살표 키로 이동, 더하기·빼기 키로 확대·축소");
    map.addControl(new AttributionControl({ compact: false }), "bottom-right");
    map.addControl(new ScaleControl({ maxWidth: 80, unit: "metric" }), "bottom-left");
    fitRef.current = () => {
      const valid = latest.current.points.filter(validPoint);
      if (!valid.length) return;
      const bounds = new LngLatBounds();
      valid.forEach(p => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: { top: immersive ? 170 : 74, right: 65, bottom: immersive ? 210 : 60, left: 55 }, maxZoom: 16, duration: 0 });
    };
    let disposed = false;
    const watchdog = window.setTimeout(() => { if (!disposed) setFailed(true); }, 15000);
    // A source error can still be followed by load. Only retry clears failures.
    map.on("load", () => { if (!disposed) { window.clearTimeout(watchdog); setLoaded(true); } });
    map.on("error", event => {
      if (!disposed) setFailed(true);
      if (import.meta.env.DEV) console.warn("TripFit basemap:", event.error.message);
    });
    const observer = new ResizeObserver(() => {
      if (container.current?.clientWidth && container.current.clientHeight) map.resize();
    });
    observer.observe(container.current);
    return () => { disposed = true; window.clearTimeout(watchdog); observer.disconnect(); mapRef.current = null; fitRef.current = () => {}; map.remove(); };
  }, [retry, immersive]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !walkingRoute) return;
    const id = 'tripfit-walking-route';
    function draw() {
      if (!map || map.getSource(id)) return;
      map.addSource(id, { type:'geojson', data: { type:'Feature', properties:{},
        geometry:{ type:'LineString', coordinates:walkingRoute!.coordinates } } });
      map.addLayer({ id: id + '-border', type: 'line', source:id,
        layout:{ 'line-join':'round','line-cap':'round' },
        paint:{ 'line-color':'#193b38','line-width':8 } });
      map.addLayer({ id, type:'line', source:id,
        layout:{ 'line-join':'round','line-cap':'round' },
        paint:{ 'line-color':routeKind === 'comfort' ? '#8eeab0' : '#7bccff','line-width':5 } });
      const bounds = new LngLatBounds();
      walkingRoute!.coordinates.forEach(point => bounds.extend(point));
      map.fitBounds(bounds, { padding:32, maxZoom:17, duration:0 });
    }
    map.on('style.load', draw);
    map.on('load', draw);
    if (map.isStyleLoaded()) draw();
    return () => {
      map.off('style.load', draw);
      map.off('load', draw);
      if (mapRef.current !== map) return;
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getLayer(id + '-border')) map.removeLayer(id + '-border');
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [walkingRoute, routeKind, retry]);
  // Marker updates must not recreate the map or reset its camera when filtering.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let markers: Marker[] = [];
    const drawMarkers = () => {
      const focused = document.activeElement instanceof HTMLButtonElement && container.current?.contains(document.activeElement) ? document.activeElement.dataset.pointId : focusedMarker.current;
      focusedMarker.current = undefined;
      markers.forEach(marker => marker.remove());
      const valid = points.filter(validPoint);
      const groups = immersive ? groupMapPins(valid.map(point => { const projected = map.project([point.lng, point.lat]); return { point, x: projected.x, y: projected.y }; })) : valid.map(point => [point]);
      const anchors = groups.map(group => map.project([group[0]!.lng, group[0]!.lat]));
      const origin = latest.current.center;
      const offsets = originSafeOffsets(anchors, immersive && origin ? map.project([origin.lng, origin.lat]) : undefined);
      markers = groups.map((group, index) => {
      const point = group.find(item => item.id === selected) || group.find(item => item.type === 'POLICE') || group.find(item => item.emergency || item.type === 'MEDICAL') || group.find(item => item.type === 'HOSPITAL') || group[0]!;
      const button = document.createElement("button");
      const { svg, kind } = markerIcon(point);
      button.type = "button";
      const cctvOnly = isCctvOnly(group);
      button.className = `ts-map-pin ${group.length > 1 ? 'pin-cluster' : `pin-${point.type.toLowerCase()} pin-${kind}`}${cctvOnly ? ' pin-cctv-reference' : ''}${group.some(item => item.id === selected) ? ' selected' : ''}`;
      button.dataset.pointId = point.id;
      button.setAttribute('aria-pressed', String(group.some(item => item.id === selected)));
      const kinds = [...new Set(group.map(item => mapPointKind(item)))];
      const expand = group.length > 1 && canExpandMapCluster(group, map.getZoom());
      const groupLabel = `조회된 시설 ${group.length}곳 · ${expand ? '확대해서 보기' : '목록 보기'}`;
      button.setAttribute("aria-label", group.length > 1 ? `${groupLabel}: ${kinds.join(', ')}` : `${mapPointKind(point)} · ${point.name} 위치 선택`);
      button.title = group.length > 1 ? `${groupLabel} (지도에 불러온 자료 기준)` : point.name;
      if (group.length > 1) {
        const count = document.createElement('span'); count.className = 'ts-cluster-count'; count.textContent = String(group.length); count.setAttribute('aria-hidden', 'true'); button.append(svg, count);
      } else {
        button.append(svg);
        if (point.emergency || point.type === 'MEDICAL') { const badge = document.createElement('span'); badge.className = 'ts-emergency-badge'; badge.textContent = '응급'; button.append(badge); }
      }
      if (group.length === 1) { const label = document.createElement("span"); label.className = "ts-pin-label"; label.textContent = point.name; button.append(label); }
      button.addEventListener("click", () => {
        if (group.length > 1 && expand) {
          const bounds = new LngLatBounds(); group.forEach(item => bounds.extend([item.lng, item.lat]));
          map.fitBounds(bounds, { padding: { top: 150, bottom: 140, left: 60, right: 60 }, maxZoom: Math.min(map.getZoom() + 2, 18.5), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400 });
          setClusterMessage(`조회된 시설 ${group.length}곳을 확대했어요. 더 겹친 시설은 숫자를 눌러 확인하세요.`);
          map.getCanvas().focus({ preventScroll: true });
        } else if (group.length > 1) { clusterTrigger.current = button; setClusterIds(group.map(item => item.id)); }
        else latest.current.onSelect?.(point.id);
      });
      const anchor = group.length > 1 ? group[0]! : point;
      const offset = offsets[index]!;
      if (offset.x || offset.y) {
        const leader = document.createElement('i'); leader.className = 'ts-marker-leader';
        leader.style.width = Math.hypot(offset.x, offset.y) + 'px';
        leader.style.transform = 'rotate(' + Math.atan2(-offset.y, -offset.x) + 'rad)';
        button.append(leader); button.title += ' · 연결선 끝이 자료의 위치예요';
      }
      return new Marker({ element: button, anchor: "center", offset: [offset.x, offset.y] }).setLngLat([anchor.lng, anchor.lat]).addTo(map);
      });
      if (focused) markers.find(marker => marker.getElement().dataset.pointId === focused)?.getElement().focus({ preventScroll: true });
    };
    drawMarkers();
    map.on('moveend', drawMarkers);
    map.on('resize', drawMarkers);
    if (!immersive) fitRef.current();
    return () => { map.off('moveend', drawMarkers); map.off('resize', drawMarkers); if (document.activeElement instanceof HTMLButtonElement && container.current?.contains(document.activeElement)) focusedMarker.current = document.activeElement.dataset.pointId; markers.forEach(marker => marker.remove()); };
  }, [points, selected, retry, immersive]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center || !originLabel || !validPoint(center)) return;
    const element = document.createElement('div');
    element.className = 'tour-origin-marker';
    element.setAttribute('role', 'img'); element.setAttribute('aria-label', originLabel);
    const dot = document.createElement('i'); element.append(dot);
    const label = document.createElement('span'); label.textContent = originLabel; element.append(label);
    const marker = new Marker({ element, anchor: 'center' }).setLngLat([center.lng, center.lat]).addTo(map);
    return () => { marker.remove(); };
  }, [center?.lat, center?.lng, originLabel, retry]);
  useEffect(() => {
    if (center && validPoint(center)) mapRef.current?.jumpTo({ center: [center.lng, center.lat], zoom: immersive && (container.current?.clientWidth ?? 0) <= 600 ? 14 : 15.5, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
  }, [center?.lat, center?.lng, retry]);
  useEffect(() => {
    container.current?.querySelectorAll<HTMLButtonElement>(".ts-map-pin").forEach(button => {
      const active = button.dataset.pointId === selected;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const current = points.find(point => point.id === selected);
    if (immersive && current && validPoint(current)) mapRef.current?.easeTo({
      center: [current.lng, current.lat], zoom: Math.max(15.5, mapRef.current.getZoom()),
      offset: [-5, -20],
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450,
    });
  }, [selected, points, retry, immersive]);
  const current = points.find(point => point.id === selected);
  return <div className={`map-block ts-map-block ${theme} ${immersive ? "ts-immersive" : ""}`}>
    <div className="map-canvas-wrap">
      <div ref={container} className="map-canvas ts-map-canvas" role="region" aria-label="TripFit 실제 장소 지도" />
      {!immersive && <div className="ts-map-brand"><i /><span>TOURSAFE MAP</span><small>실제 지도</small></div>}
      {children}
      {immersive && <button className="calm-map-settings" ref={settingsTrigger} type="button" aria-label="지도 설정" onClick={() => setSettingsOpen(true)}><SlidersHorizontal size={19} /></button>}
      {(!immersive || settingsOpen) && <div className={!immersive ? 'ts-map-tools' : 'calm-settings-host'} aria-label="지도 조작">
      {immersive ? <Modal title="지도 설정" className="map-settings-dialog" onClose={closeSettings}>
        <div className="calm-settings-body">
          <div className="calm-settings-controls">
            <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}{theme === 'dark' ? '밝은 지도' : '어두운 지도'}</button>
            <button type="button" aria-pressed={detail} onClick={() => setDetail(!detail)}><Building2 size={20} />건물·작은 길 {detail ? '숨기기' : '표시'}</button>
            <button type="button" onClick={() => { mapRef.current?.zoomIn(); }}><Plus size={20} />지도 확대</button>
            <button type="button" onClick={() => { mapRef.current?.zoomOut(); }}><Minus size={20} />지도 축소</button>
            <button type="button" disabled={!points.length} onClick={() => { fitRef.current(); closeSettings(); }}><LocateFixed size={20} />표시된 시설 모두 보기</button>
          </div>{settingsContent?.(closeSettings)}
        </div>
      </Modal> : <>
        <button type="button" title={theme === "dark" ? "밝은 지도" : "어두운 지도"} aria-label={theme === "dark" ? "밝은 지도" : "어두운 지도"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button type="button" title="건물·작은 길 표시" aria-label="건물·작은 길 표시" aria-pressed={detail} onClick={() => setDetail(!detail)}><Building2 size={18} /></button>
        <div><button type="button" aria-label="지도 확대" onClick={() => mapRef.current?.zoomIn()}><Plus size={19} /></button><button type="button" aria-label="지도 축소" onClick={() => mapRef.current?.zoomOut()}><Minus size={19} /></button></div>
        <button type="button" title="모든 장소 보기" aria-label="모든 장소 보기" disabled={!points.length} onClick={() => fitRef.current()}><LocateFixed size={18} /></button>
      </>}
      </div>}
      {!loaded && !failed && <div className="ts-map-status" role="status">지도를 불러오는 중…</div>}
      {failed && <div className="ts-map-error" role="alert">지도를 불러오지 못했어요. 장소 목록은 계속 이용할 수 있어요.<button type="button" onClick={() => setRetry(n => n + 1)}>지도 다시 불러오기</button></div>}
    </div>
    <span className="map-cluster-announcement" role="status">{clusterMessage}</span>
    {clusterPoints.length > 0 && <Modal title={`모여 있는 시설 ${clusterPoints.length}곳`} className="nearby-facilities-dialog" onClose={closeCluster}><div className="nearby-sheet-body"><p className="nearby-range">같은 위치이거나 가까워 한 표식으로 묶었어요. 숫자는 현재 지도에 불러온 자료 수이며, 주변 전체 시설 수는 아니에요.</p><div className="nearby-result-list">{clusterPoints.map(point => <button key={point.id} onClick={() => { setClusterIds([]); onSelect?.(point.id); }}><span><b>{point.name}</b><small>{mapPointKind(point)}</small></span></button>)}</div></div></Modal>}
    {!immersive && !walkingRoute && current && <div className="map-selected"><b>{current.name}</b><WalkingRouteButton destination={current} className="secondary" /></div>}
  </div>;
}
