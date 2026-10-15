import { Cctv, Cross, Navigation, ShieldCheck, Store, TriangleAlert, X } from "lucide-react";
import { facilityNames, mapFacilities, type DemoDestination, type FacilityKind, type RouteKind } from "../config/mapDemo";

export const facilityIcons = { cctv: Cctv, police: ShieldCheck, medical: Cross, store: Store, caution: TriangleAlert };
export function SafetyDiagram({ destination, route, layers, selected, onSelect, zoom, onScore, onRoute, onDestination }: {
  destination: DemoDestination; route: RouteKind; layers: FacilityKind[]; selected: string | null;
  onSelect: (id: string | null) => void; zoom: number; onScore: () => void; onRoute: (route: RouteKind) => void; onDestination: () => void;
}) {
  const facility = mapFacilities.find(f => f.id === selected && layers.includes(f.kind));
  return <>
    <div className="sm-map-viewport">
      <div className="sm-map-plane" style={{ transform: `scale(${zoom})` }}>
        <svg className="sm-streets" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          <defs><pattern id="map-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 H 0 V 32" fill="none" stroke="#86a48c" strokeOpacity="0.12" strokeWidth="0.5" /></pattern></defs>
          <rect width="1000" height="1000" fill="url(#map-grid)" className="sm-map-grid" />
          <path className="sm-park-shape" d="M0 690H180V745H260V1000H0Z" />
          {[85, 205, 330, 455, 600, 775].flatMap((x, i) => [95, 255, 415, 655, 835].map((y, j) =>
            <rect key={`${i}-${j}`} className="sm-building" x={x} y={y} width={i === 4 ? 143 : i === 5 ? 130 : 94} height={j === 2 ? 198 : 125} rx="9" />
          ))}
          <g className="sm-minor-roads" fill="none" strokeWidth="3">
            <path d="M 440 80 V 930 M 690 260 V 930 M 80 520 H 930 M 80 710 H 920 M 95 160 H 920" />
          </g>
          <g className="sm-major-roads" fill="none" strokeWidth="13">
            {[70, 190, 310, 580, 760, 920].map(x => <path key={x} d={`M ${x} 35 V 970`} />)}
            {[240, 400, 640, 820].map(y => <path key={y} d={`M 25 ${y} H 980`} />)}
          </g>
          <path d="M 20 240 H 980" className="sm-subway-line" strokeWidth="3" strokeDasharray="7 6" fill="none" />
          <path d={destination.fastPath} className={`sm-route-fast ${route === "fast" ? "is-active" : ""}`} />
          <path d={destination.safePath} className={`sm-route-glow ${route === "safe" ? "is-active" : ""}`} />
          <path d={destination.safePath} className={`sm-route-safe ${route === "safe" ? "is-active" : ""}`} />
        </svg>
        <span className="sm-street-label" style={{ left: "79%", top: "21%" }}>성수이로</span>
        <span className="sm-street-label" style={{ left: "16%", top: "37%" }}>아차산로</span>
        <span className="sm-street-label" style={{ left: "68%", top: "85%" }}>연무장길</span>
        <span className="sm-park-label">서울숲</span>
        <span className="sm-station" style={{ left: "31%", top: "24%" }}><b>2</b> 성수역</span>
        {mapFacilities.filter(f => layers.includes(f.kind)).map(f => {
          const Icon = facilityIcons[f.kind];
          return <button key={f.id} className={`sm-map-marker ${f.kind} ${f.id === selected ? "selected" : ""}`} style={{ left: `${f.x}%`, top: `${f.y}%` }} aria-label={`${f.name} · ${facilityNames[f.kind]} 예시`} aria-pressed={f.id === selected} onClick={() => onSelect(f.id === selected ? null : f.id)}><Icon size={18} /></button>;
        })}
        <button className="sm-origin" style={{ left: "31%", top: "64%" }} onClick={onScore} aria-label="예시 출발지 주변 장소 확인"><span className="sm-origin-dot"><Navigation size={13} fill="currentColor" /></span><span className="sm-origin-label">예시 내 위치</span></button>
        <button className="sm-destination" style={{ left: `${destination.x}%`, top: `${destination.y}%` }} aria-label={`예시 목적지 변경 · ${destination.name}`} onClick={onDestination}><b>{destination.name}</b><span /></button>
        <button className={`sm-route-tag safe ${route === "safe" ? "is-active" : ""}`} aria-pressed={route === "safe"} onClick={() => onRoute("safe")} style={{ left: destination.id === "forest" ? "39%" : "48%", top: destination.id === "forest" ? "78%" : "29%" }}>안심 길 {destination.safeMinutes}분</button>
        <button className={`sm-route-tag fast ${route === "fast" ? "is-active" : ""}`} aria-pressed={route === "fast"} onClick={() => onRoute("fast")} style={{ left: destination.id === "forest" ? "13%" : "54%", top: destination.id === "forest" ? "56%" : "73%" }}>빠른 길 {destination.fastMinutes}분</button>
      </div>
      <span className="sm-north">N<Navigation size={19} /></span>
      <span className="sm-diagram-note">성수 모티프 개념도 · 실제 도로와 다름</span>
    </div>
    {facility && <div className="sm-facility-popover" role="status">
      <span className={`sm-facility-icon ${facility.kind}`}>{(() => { const Icon = facilityIcons[facility.kind]; return <Icon size={20} />; })()}</span>
      <div><b>{facility.name} <small>예시</small></b><p>{facility.detail}</p></div>
      <button className="sm-icon-button" aria-label="시설 설명 닫기" onClick={() => onSelect(null)}><X size={18} /></button>
    </div>}
  </>;
}
