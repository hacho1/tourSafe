import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Heart,
  Hospital,
  Info,
  MapPin,
  Navigation,
  Phone,
  Shield,
  ShieldCheck,
  Sun,
  Clock3,
  Wind,
  Droplets,
  Baby,
  Trees,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import type { Recommendation, SupportFacility } from "../../../shared/models";
import { Modal } from "../components/Modal";
import { useCurrentRecommendation } from '../hooks/useCurrentRecommendation';
import { useEmergency } from "../components/EmergencyContext";
import { SpotImage } from "../components/SpotCard";
import { MapPanel, type MapPoint } from "../components/MapPanel";
import {
  CONFIDENCE,
  FACILITY_LABEL,
  scoreSummary,
  SAFETY_LABEL,
} from "../config/constants";
import {
  dateLabel,
  distance,
  evidenceLabel,
  mapLink,
  phoneLink,
  sourceLabel,
  timeLabel,
} from "../utils/format";

type Tab = "info" | "safety" | "facilities" | "map";
export function SpotDetail({
  item,
  saved,
  onSave,
  onClose,
  initialTab = "safety",
}: {
  item: Recommendation;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
  initialTab?: Tab;
}) {
  const { spot, score, weather, facilities, statuses } = useCurrentRecommendation(item);
  const summary = scoreSummary(score);
  const openEmergency = useEmergency();
  const [tab, setTab] = useState<Tab>(initialTab),
    [selected, setSelected] = useState(spot.id);
  const demo = spot.source.kind === "DEMO_DATA",
    call = phoneLink(spot.phone);
  const mapPoints = useMemo<MapPoint[]>(
    () => [
      {
        id: spot.id,
        name: spot.name,
        lat: spot.lat,
        lng: spot.lng,
        type: "SPOT",
      },
      ...facilities,
    ],
    [spot, facilities],
  );
  const selectFacility = (id: string) => {
    setSelected(id);
    setTab("map");
  };
  const unknownItems = Object.entries(spot.safety).filter(
    ([, value]) => value.status === "UNKNOWN",
  );
  const nearbyHighlights = (["MEDICAL", "POLICE", "TOURIST_INFO"] as const).flatMap(
    (type) => facilities.filter((facility) => facility.type === type)
      .sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 1),
  );
  return (
    <Modal
      title="관광지 자세히 보기"
      onClose={onClose}
      className="detail-dialog"
    >
      <div className="detail-scroll">
        <div className="detail-cover">
          <SpotImage
            src={spot.imageUrl}
            name={demo ? `${spot.name} AI 시연 이미지` : spot.name}
          />
          <div className="detail-cover-gradient" />
          <span className="detail-category">
            {spot.category}
            {demo && " · DEMO"}
          </span>
          <button
            className={`save-button ${saved ? "saved" : ""}`}
            aria-label={`${spot.name} ${saved ? "저장 취소" : "저장"}`}
            aria-pressed={saved}
            onClick={onSave}
          >
            <Heart size={21} fill={saved ? "currentColor" : "none"} />
          </button>
          {demo && spot.imageUrl && (
            <small className="detail-image-label">AI 생성 시연 이미지</small>
          )}
        </div>
        <div className="detail-heading">
          <div>
            <h2>{spot.name}</h2>
            <p>
              <MapPin size={14} />
              {distance(spot.distanceMeters)} · 출발 위치에서 직선거리
            </p>
          </div>
          <span
            className={`grade-pill ${score.grade === "HOLD" ? "hold" : ""}`}
          >
            <ShieldCheck size={16} />
            {summary.label}
          </span>
        </div>
        <div className="detail-tabs" role="tablist" aria-label="관광지 정보">
          {(
            [
              ["info", "정보"],
              ["safety", "안전정보"],
              ["facilities", "편의시설"],
              ["map", "지도"],
            ] as const
          ).map(([value, label], i) => (
            <button
              role="tab"
              aria-selected={tab === value}
              aria-controls={`detail-panel-${value}`}
              id={`detail-tab-${value}`}
              tabIndex={tab === value ? 0 : -1}
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const next = (i + (e.key === "ArrowRight" ? 1 : 3)) % 4;
                  const value = (
                    ["info", "safety", "facilities", "map"] as const
                  )[next]!;
                  setTab(value);
                  document.getElementById(`detail-tab-${value}`)?.focus();
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="detail-body"
          role="tabpanel"
          id={`detail-panel-${tab}`}
          aria-labelledby={`detail-tab-${tab}`}
          tabIndex={0}
        >
          {tab === "info" && (
            <>
              <p className="detail-description">
                {spot.description || "관광지 설명이 제공되지 않았습니다."}
              </p>
              <div className="info-rows">
                <div>
                  <MapPin size={18} />
                  <span>
                    <small>주소</small>
                    {spot.address || "주소 미제공"}
                  </span>
                </div>
                <div>
                  <Clock3 size={18} />
                  <span>
                    <small>운영시간</small>
                    {spot.openingHours.value || "운영시간 미확인"}
                  </span>
                </div>
                <div>
                  <CalendarDays size={18} />
                  <span>
                    <small>휴무일</small>
                    {spot.holidays.value || "휴무일 미확인"}
                  </span>
                </div>
                <div>
                  <Phone size={18} />
                  <span>
                    <small>문의</small>
                    {call && !demo ? (
                      <a href={call}>{spot.phone}</a>
                    ) : (
                      "전화번호 미제공"
                    )}
                  </span>
                </div>
              </div>
              <div className="weather-detail">
                <h3>
                  <Sun size={19} />
                  방문지 날씨 {demo && <span className="demo-badge">DEMO</span>}
                </h3>
                <div className="weather-values">
                  <div>
                    <strong>
                      {weather.temperature.value ?? "—"}
                      <small>°C</small>
                    </strong>
                    <span>{weather.condition.value || "날씨 미확인"}</span>
                  </div>
                  <div>
                    <Droplets size={18} />
                    <b>{weather.precipitation.value ?? "—"} mm</b>
                    <span>시간당 강수</span>
                  </div>
                  <div>
                    <Wind size={18} />
                    <b>{weather.windSpeed.value ?? "—"} m/s</b>
                    <span>풍속</span>
                  </div>
                </div>
                <p className="small muted">
                  관측 {timeLabel(weather.temperature.updatedAt)} ·{" "}
                  {sourceLabel(weather.temperature.source)}
                </p>
                <p className="small muted">
                  강수확률{" "}
                  {weather.precipitationProbability.value === null
                    ? "미확인"
                    : `${weather.precipitationProbability.value}%`}{" "}
                  · 예보시각{" "}
                  {timeLabel(weather.precipitationProbability.updatedAt)}
                </p>
              </div>
              <SourceMeta
                name={sourceLabel(spot.source)}
                updatedAt={spot.updatedAt}
                url={spot.source.url}
              />
            </>
          )}
          {tab === "safety" && (
            <>
              <div className="score-summary">
                <div
                  className="score-ring"
                  style={
                    { "--score": `${summary.total ?? 0}%` } as React.CSSProperties
                  }
                >
                  <div>
                    <strong>{summary.total ?? "—"}</strong>
                    <span>/ 100</span>
                  </div>
                </div>
                <div>
                  <span className="eyebrow">TOURSAFE 방문 조건 점수</span>
                  <h3>{summary.label}</h3>
                  <p>현재 확인 가능한 정보 기준</p>
                  <span
                    className={`confidence ${score.confidence.toLowerCase()}`}
                  >
                    정보 신뢰도 {CONFIDENCE[score.confidence]} · 확인율{" "}
                    {score.coverage}%
                  </span>
                </div>
              </div>
              {score.hardFilter.length > 0 && (
                <div className="notice warning">
                  <AlertTriangle size={18} />
                  <span>{score.hardFilter.join(" · ")}</span>
                </div>
              )}
              {score.coverage < 60 && (
                <p className="notice">
                  비교할 정보가 부족해 종합 점수는 표시하지 않아요. 방문 전 운영·시설 정보를 확인해 주세요.
                </p>
              )}
              <section className="detail-section">
                <h3>
                  <ShieldCheck size={19} />
                  추천 근거를 확인해 보세요
                </h3>
                <div className="score-parts">
                  {score.components.map((p) => (
                    <div className="score-part" key={p.key}>
                      <div>
                        <span>{p.label}</span>
                        <b>
                          {p.earnedPoints === null
                            ? "미확인"
                            : `${p.earnedPoints} / ${p.maxPoints}`}
                        </b>
                      </div>
                      <div className="score-track">
                        <span
                          style={{
                            width: `${((p.earnedPoints ?? 0) / p.maxPoints) * 100}%`,
                          }}
                        />
                      </div>
                      <small>
                        {p.detail}
                        {p.knownWeight < p.maxPoints &&
                          ` · 미확인 배점 ${p.maxPoints - p.knownWeight} 제외`}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="small muted">
                  획득 점수 ÷ 확인된 배점 × 100. 확인율은 배점 기준이며 실제
                  안전성을 보증하지 않습니다.
                </p>
              </section>
              <section className="detail-section check-section">
                <h3>
                  <CircleHelp size={19} />
                  방문 전 확인해 주세요
                </h3>
                <div className="unknown-chips">
                  {unknownItems.map(([key]) => (
                    <span key={key}>
                      {SAFETY_LABEL[key as keyof typeof SAFETY_LABEL]} 미확인
                    </span>
                  ))}
                </div>
                <p className="small">
                  기상특보·현장 통제·사고 이력은 자동 확인되지 않습니다.
                  미확인은 시설이 없다는 뜻이 아닙니다.
                </p>
              </section>
              <section className="detail-section">
                <h3>
                  <Hospital size={19} />
                  주변 도움받을 곳
                </h3>
                <p className="small muted">
                  관광지 기준 직선거리 · 실제 이동 경로는 지도에서 확인
                </p>
                {nearbyHighlights.map((f) => (
                    <button
                      className="nearby-row"
                      key={f.id}
                      onClick={() => selectFacility(f.id)}
                    >
                      <FacilityIcon type={f.type} />
                      <span>
                        <b>{f.name}</b>
                        <small>{sourceLabel(f.source)}</small>
                      </span>
                      <strong>{distance(f.distanceMeters)}</strong>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                {!facilities.length && (
                  <p className="notice">
                    주변 지원시설 정보가 확인되지 않았습니다.
                  </p>
                )}
              </section>
              <details className="data-status">
                <summary>데이터 조회 상태와 한계</summary>
                {statuses.map((s) => (
                  <p key={s.key}>
                    <span className={s.status === "OK" ? "positive" : "muted"}>
                      {s.status === "OK" ? (
                        <Check size={14} />
                      ) : (
                        <CircleHelp size={14} />
                      )}
                    </span>
                    {s.message}
                  </p>
                ))}
                <p>
                  기관에서 제공하지 않는 갱신일과 운영 정보는 미확인으로
                  유지합니다.
                </p>
              </details>
            </>
          )}
          {tab === "facilities" && (
            <>
              <section className="detail-section">
                <h3>
                  <Baby size={19} />
                  가족 편의·안전환경
                </h3>
                <div className="evidence-grid">
                  {Object.entries(spot.safety).map(([key, value]) => (
                    <div
                      key={key}
                      className={`evidence-item ${value.status.toLowerCase()}`}
                    >
                      <div>
                        <span>
                          {SAFETY_LABEL[key as keyof typeof SAFETY_LABEL]}
                        </span>
                        <b>{evidenceLabel(value)}</b>
                      </div>
                      <small>
                        {sourceLabel(value.source)} ·{" "}
                        {dateLabel(value.updatedAt)}
                      </small>
                    </div>
                  ))}
                </div>
              </section>
              <section className="detail-section">
                <h3>
                  <MapPin size={19} />
                  주변 공공지원시설
                </h3>
                {facilities.length ? (
                  facilities.map((facility) => (
                    <FacilityCard
                      key={facility.id}
                      facility={facility}
                      onMap={() => selectFacility(facility.id)}
                    />
                  ))
                ) : (
                  <p className="notice">주변 시설 정보 미확인</p>
                )}
              </section>
            </>
          )}
          {tab === "map" && (
            <>
              <MapPanel
                points={mapPoints}
                selected={selected}
                onSelect={setSelected}
                demo={demo}
              />
              <p className="small muted">
                관광지와 시설 간 직선거리입니다. 도보경로와 예상 이동시간은
                제공하지 않습니다.
              </p>
              {demo && (
                <p className="notice">
                  가상의 장소와 시설 위치입니다. 실제 길찾기와 전화 연결은
                  제공하지 않습니다.
                </p>
              )}
              <button
                className={`map-place-row ${selected === spot.id ? "active" : ""}`}
                onClick={() => setSelected(spot.id)}
              >
                <Trees size={18} />
                {spot.name}
                <span>관광지</span>
              </button>
              {facilities.map((f) => (
                <FacilityCard
                  key={f.id}
                  facility={f}
                  selected={selected === f.id}
                  onMap={() => setSelected(f.id)}
                />
              ))}
            </>
          )}
          {demo && (
            <p className="demo-disclosure">
              <Info size={15} />
              일부 안전환경 정보는 프로토타입 시연용 데이터입니다. 현재 DEMO의
              장소·시설·날씨·운영정보도 가상 예시입니다.
            </p>
          )}
        </div>
      </div>
      <div className="detail-bottom">
        <button
          type="button"
          className="emergency-link"
          onClick={openEmergency ?? undefined}
          disabled={!openEmergency}
          aria-label="긴급 도움 열기"
        >
          <Phone size={16} />
          <span>
            긴급 도움<strong>112 · 119</strong>
          </span>
        </button>
        {demo ? (
          <button className="primary" onClick={() => setTab("map")}>
            <MapPin size={17} />
            예시 위치 확인
          </button>
        ) : (
          <a
            className="primary"
            href={mapLink(spot.name, spot)}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation size={17} />
            Kakao 길찾기
            <ArrowUpRight size={17} />
          </a>
        )}
      </div>
    </Modal>
  );
}
function FacilityIcon({ type }: { type: SupportFacility["type"] }) {
  const Icon =
    type === "MEDICAL"
      ? Hospital
      : type === "POLICE"
        ? Shield
        : type === "TOURIST_INFO"
          ? Info
          : Baby;
  return (
    <span className={`facility-icon ${type.toLowerCase()}`}>
      <Icon size={18} />
    </span>
  );
}
function FacilityCard({
  facility: f,
  onMap,
  selected = false,
}: {
  facility: SupportFacility;
  onMap: () => void;
  selected?: boolean;
}) {
  const call = phoneLink(f.phone),
    demo = f.source.kind === "DEMO_DATA";
  return (
    <article className={`facility-card ${selected ? "selected" : ""}`}>
      <div className="facility-card-top">
        <FacilityIcon type={f.type} />
        <div>
          <small>
            {FACILITY_LABEL[f.type]}
            {demo && " · DEMO"}
          </small>
          <h4>{f.name}</h4>
        </div>
        <b>{distance(f.distanceMeters)}</b>
      </div>
      <p>{f.address || "주소 미제공"} · 직선거리</p>
      {f.openingHours && <p>운영정보 {f.openingHours}</p>}
      {f.holidays && <p>휴무 {f.holidays}</p>}
      {f.languages && <p>외국어 {f.languages}</p>}
      {f.emergency && (
        <p className="small">응급의료기관 · 현재 진료·수용 여부는 별도 확인</p>
      )}
      <div className="facility-actions">
        <button onClick={onMap}>
          <MapPin size={14} />
          위치
        </button>
        {call && !demo && (
          <a href={call}>
            <Phone size={14} />
            전화
          </a>
        )}
        {!demo && (
          <a href={mapLink(f.name, f)} target="_blank" rel="noreferrer">
            <Navigation size={14} />
            길찾기
          </a>
        )}
      </div>
      <SourceMeta
        name={sourceLabel(f.source)}
        updatedAt={f.updatedAt}
        url={f.source.url}
      />
    </article>
  );
}
function SourceMeta({
  name,
  updatedAt,
  url,
}: {
  name: string;
  updatedAt: string | null;
  url: string | null;
}) {
  return (
    <p className="source-meta">
      <CircleAlert size={12} />
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {name}
        </a>
      ) : (
        name
      )}
      <span>· {dateLabel(updatedAt)}</span>
    </p>
  );
}
