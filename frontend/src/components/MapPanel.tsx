import { useEffect, useRef, useState } from "react";
import { MapPin, Map, ArrowUpRight, LoaderCircle } from "lucide-react";
import type { Coordinates, FacilityType } from "../../../shared/models";
import { loadKakaoMap } from "../services/kakaoMapApi";
import { mapLink } from "../utils/format";

export interface MapPoint extends Coordinates {
  id: string;
  name: string;
  type: FacilityType | "SPOT";
}
const color: Record<MapPoint["type"], string> = {
  SPOT: "#146451",
  MEDICAL: "#d76653",
  POLICE: "#5081bc",
  TOURIST_INFO: "#b28339",
  TOILET: "#8b76b3",
};
const label: Record<MapPoint["type"], string> = {
  SPOT: "관광지",
  MEDICAL: "의료",
  POLICE: "경찰",
  TOURIST_INFO: "안내소",
  TOILET: "화장실",
};
export function MapPanel({
  points,
  selected,
  onSelect,
  demo,
}: {
  points: MapPoint[];
  selected?: string;
  onSelect?: (id: string) => void;
  demo: boolean;
}) {
  const container = useRef<HTMLDivElement>(null),
    onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState<"LOADING" | "READY" | "FALLBACK">(
    "LOADING",
  );
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    let cancelled = false,
      cleanup = () => {};
    setStatus("LOADING");
    if (!points.length) {
      setStatus("FALLBACK");
      return;
    }
    loadKakaoMap()
      .then((maps) => {
        if (cancelled || !container.current) return;
        const map = new maps.Map(container.current, {
          center: new maps.LatLng(points[0]!.lat, points[0]!.lng),
          level: 5,
        });
        const bounds = new maps.LatLngBounds();
        const markers = points.map((point) => {
          const position = new maps.LatLng(point.lat, point.lng);
          bounds.extend(position);
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><path fill="${color[point.type]}" stroke="white" stroke-width="2" d="M18 1a17 17 0 0 0-17 17c0 11 17 25 17 25s17-14 17-25A17 17 0 0 0 18 1Z"/><circle cx="18" cy="18" r="6" fill="white"/></svg>`;
          const marker = new maps.Marker({
            map,
            position,
            title: point.name,
            image: new maps.MarkerImage(
              `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
              new maps.Size(36, 44),
            ),
          });
          const select = () => onSelectRef.current?.(point.id);
          maps.event.addListener(marker, "click", select);
          return { marker, select };
        });
        map.setBounds(bounds);
        const observer = new ResizeObserver(() => {
          map.relayout();
          map.setBounds(bounds);
        });
        observer.observe(container.current);
        cleanup = () => {
          observer.disconnect();
          for (const { marker, select } of markers) {
            maps.event.removeListener(marker, "click", select);
            marker.setMap(null);
          }
        };
        setStatus("READY");
      })
      .catch(() => {
        if (!cancelled) setStatus("FALLBACK");
      });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [points]);
  const selectedPoint = points.find((p) => p.id === selected) || points[0];
  const latMin = Math.min(...points.map((p) => p.lat)),
    latMax = Math.max(...points.map((p) => p.lat));
  const lngMin = Math.min(...points.map((p) => p.lng)),
    lngMax = Math.max(...points.map((p) => p.lng));
  return (
    <div className="map-block">
      <div className="map-canvas-wrap">
        <div
          ref={container}
          className="map-canvas"
          hidden={status !== "READY"}
          aria-label="Kakao 지도"
        />
        {status === "LOADING" && (
          <div className="map-loading">
            <LoaderCircle className="spin" />
            <p>지도를 불러오는 중…</p>
          </div>
        )}
        {status === "FALLBACK" && (
          <div className="map-fallback">
            <div className="map-fallback-label">
              <Map size={15} />
              위치 관계도 · 실제 지도 아님
            </div>
            <span className="compass">N ↑</span>
            {points.map((p, i) => (
              <button
                key={p.id}
                className={`plot-marker ${p.id === selected ? "selected" : ""}`}
                aria-label={`${p.name} 위치 선택`}
                title={p.name}
                onClick={() => onSelect?.(p.id)}
                style={{
                  left: `${15 + ((p.lng - lngMin) / (lngMax - lngMin || 1)) * 68}%`,
                  top: `${32 + (1 - (p.lat - latMin) / (latMax - latMin || 1)) * 45}%`,
                  background: color[p.type],
                  zIndex: p.id === selected ? 10 : i + 1,
                }}
              >
                <MapPin size={17} />
              </button>
            ))}
            <p className="fallback-caption">
              지도 연결 후 상세 지형을 볼 수 있어요.
            </p>
          </div>
        )}
        {demo && <span className="map-demo-label">DEMO 가상 위치</span>}
      </div>
      <div className="map-legend">
        {Object.entries(label).map(([type, name]) => (
          <span key={type}>
            <i style={{ background: color[type as MapPoint["type"]] }} />
            {name}
          </span>
        ))}
      </div>
      {selectedPoint && (
        <div className="map-selected">
          <span>
            <MapPin size={16} />
            <b>{selectedPoint.name}</b>
          </span>
          {!demo && (
            <a
              href={mapLink(selectedPoint.name, selectedPoint)}
              target="_blank"
              rel="noreferrer"
            >
              Kakao 길찾기
              <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
