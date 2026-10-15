import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CircleAlert, Clock3, Hospital, LocateFixed, LoaderCircle, MapPin, RefreshCw } from "lucide-react";
import type { Coordinates, DataSource, Recommendation, SearchResponse } from "../../../shared/models";
import { Modal } from "./Modal";
import { DEFAULT_REGION, scoreSummary } from "../config/constants";
import { searchPlaces } from "../services/api";
import { distance } from "../utils/format";
import { createLatestRequestGate, nearbyEvidenceText, NEARBY_RADIUS, selectNearbyMedical, selectNearbyPlace } from "../utils/nearby";

type LoadState = {
  key: string;
  status: "loading" | "complete" | "error" | "cancelled";
  data: SearchResponse | null;
};
export type NearbyOrigin = Coordinates & { confirmedAt: number };

export function NearbyScore({ onClose, origin, onOrigin, onOpenPlace, onOpenHospitals }: {
  onClose: () => void;
  origin: NearbyOrigin | null;
  onOrigin: (origin: NearbyOrigin | null) => void;
  onOpenPlace: (item: Recommendation) => void;
  onOpenHospitals: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [request, setRequest] = useState<LoadState | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  const searchGate = useRef(createLatestRequestGate());
  const locationGate = useRef(createLatestRequestGate());
  const actualLocation = origin !== null;
  const { lat, lng } = origin ?? DEFAULT_REGION;
  const requestKey = `${actualLocation ? "gps" : "default"}:${lat}:${lng}:${revision}`;
  const currentKey = useRef(requestKey);
  currentKey.current = requestKey;

  useEffect(() => {
    const gate = searchGate.current;
    const gpsGate = locationGate.current;
    const ticket = gate.next();
    const abort = new AbortController();
    controller.current = abort;
    gpsGate.invalidate();
    setLocating(false);
    setLocationMessage("");
    setRequest({ key: requestKey, status: "loading", data: null });
    searchPlaces({ lat, lng, radius: NEARBY_RADIUS, withKids: true }, abort.signal)
      .then((data) => {
        if (gate.isCurrent(ticket) && currentKey.current === requestKey && !abort.signal.aborted) {
          setRequest({ key: requestKey, status: "complete", data });
        }
      })
      .catch(() => {
        if (gate.isCurrent(ticket) && currentKey.current === requestKey && !abort.signal.aborted) {
          setRequest({ key: requestKey, status: "error", data: null });
        }
      });
    return () => {
      gate.invalidate();
      gpsGate.invalidate();
      abort.abort();
    };
  }, [lat, lng, requestKey]);

  // Effects run after paint. Never render data belonging to the previous key.
  const current = request?.key === requestKey ? request : null;
  const data = current?.status === "complete" ? current.data : null;
  const selection = data ? selectNearbyPlace(data, origin) : null;
  const show = !locating && selection?.state === "ready" ? selection.place : null;
  const medical = show ? selectNearbyMedical(show) : null;
  const loading = !current || current.status === "loading";
  const demo = data?.mode === "DEMO";
  const canLocate = data?.mode === "LIVE" &&
    (selection?.state === "ready" || selection?.state === "empty");

  function invalidatePending() {
    searchGate.current.invalidate();
    locationGate.current.invalidate();
    controller.current?.abort();
  }
  function close() {
    invalidatePending();
    onClose();
  }
  function refresh() {
    invalidatePending();
    setLocating(false);
    setLocationMessage("");
    setRevision((value) => value + 1);
  }
  function cancel() {
    if (locating) {
      locationGate.current.invalidate();
      setLocating(false);
      setLocationMessage("위치 확인을 취소했어요. 기존 조회 기준을 유지했어요.");
    } else {
      invalidatePending();
      setRequest({ key: requestKey, status: "cancelled", data: null });
    }
  }
  function locate() {
    if (!canLocate || locating) return;
    if (!navigator.geolocation) {
      setLocationMessage("이 환경에서는 현재 위치를 확인할 수 없어요. 기존 조회 기준을 유지했어요.");
      return;
    }
    const ticket = locationGate.current.next();
    const key = requestKey;
    const valid = () => locationGate.current.isCurrent(ticket) && currentKey.current === key;
    setLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition((position) => {
      if (!valid()) return;
      setLocating(false);
      const { latitude: nextLat, longitude: nextLng } = position.coords;
      if (!Number.isFinite(position.timestamp) || Date.now() - position.timestamp > 60000 || position.timestamp > Date.now() + 10000 || !Number.isFinite(position.coords.accuracy) || position.coords.accuracy < 0) {
        setLocationMessage("최근 위치를 확인하지 못했어요. 기존 조회 기준을 유지했어요.");
        return;
      }
      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng) ||
          nextLat < 33 || nextLat > 39.5 || nextLng < 124 || nextLng > 132) {
        setLocationMessage("현재 대한민국 지역의 정보를 지원해요. 기존 조회 기준을 유지했어요.");
        return;
      }
      // Also refresh when the browser supplies exactly the previous fix.
      refresh();
      onOrigin({ lat: nextLat, lng: nextLng, confirmedAt: position.timestamp });
    }, (failure) => {
      if (!valid()) return;
      setLocating(false);
      setLocationMessage(failure.code === 1
        ? "위치 접근이 허용되지 않았어요. 기존 조회 기준을 유지했어요."
        : failure.code === 3
          ? "위치 확인 시간이 지났어요. 다시 시도할 수 있어요."
          : "현재 위치를 찾지 못했어요. 다시 시도할 수 있어요.");
    }, { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false });
  }

  let stateTitle = "";
  let stateMessage = "";
  if (current?.status === "error") {
    stateTitle = "정보를 불러오지 못했어요";
    stateMessage = "연결을 확인한 뒤 다시 시도해 주세요.";
  } else if (current?.status === "cancelled") {
    stateTitle = "장소 조회를 취소했어요";
    stateMessage = "다시 조회하거나 지도로 돌아갈 수 있어요.";
  } else if (selection?.state === "not-configured") {
    stateTitle = "실제 장소 정보 연결 준비 중";
    stateMessage = "조회할 자료가 아직 연결되지 않았어요. 주변에 장소가 없다는 뜻은 아니에요.";
  } else if (selection?.state === "demo-blocked") {
    stateTitle = "현재 위치 조회 준비 중";
    stateMessage = "현재는 성수의 가상 예시를 제공해요. 실제 위치에 예시 결과를 적용하지 않아요.";
  } else if (selection?.state === "error") {
    stateTitle = selection.reason === "adapter-error"
      ? "장소 정보를 가져오지 못했어요"
      : "조회 결과를 확인할 수 없어요";
    stateMessage = selection.reason === "mixed-demo"
      ? "실제 조회에 예시 자료가 포함되어 결과를 표시하지 않았어요."
      : selection.reason === "origin-mismatch"
        ? "조회 기준과 결과의 위치 또는 범위가 달라 다시 확인이 필요해요."
        : "자료 조회가 완료되지 않았어요. 잠시 후 다시 시도해 주세요.";
  } else if (selection?.state === "empty") {
    stateTitle = "반경 1km 안에 표시할 장소가 없어요";
    stateMessage = "이번 조회에서 찾은 장소가 없어요. 실제로 장소가 없다는 뜻은 아니에요.";
  }

  return <Modal title="주변 장소 확인" className="safety-dialog sm-score-dialog sm-nearby-dialog" onClose={close}>
    <div className="sm-dialog-body sm-nearby-body">
      {demo && <div className="sm-nearby-disclosure">
        <span className="demo-badge">DEMO · 예시 자료</span>
        <p>장소·시설·날씨는 가상 예시예요. 실제 방문에 사용하지 마세요.</p>
      </div>}
      <div className="sm-nearby-origin"><MapPin size={16} aria-hidden="true" />
        <span>조회 기준: {actualLocation ? "마지막 확인 위치" : "서울 성수 · 기준 위치"}</span>
        <span>반경 1km</span>
      </div>
      {origin && <p className="sm-source-note">{new Date(origin.confirmedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간)에 확인했어요. 이동했다면 위치를 다시 확인해 주세요.</p>}
      <p className="sm-source-note">주변 장소의 방문 정보이며, 지역 전체의 안전 평가가 아니에요.</p>

      {(loading || locating) ? <div className="sm-score-empty" role="status">
        <LoaderCircle className="spin" aria-hidden="true" />
        <h2>{locating ? "현재 위치를 확인하고 있어요" : "주변 장소를 찾고 있어요"}</h2>
        <button type="button" className="sm-secondary" onClick={cancel}>취소</button>
      </div> : !show ? <div className="sm-score-empty" role={current?.status === "error" || selection?.state === "error" ? "alert" : "status"}>
        <CircleAlert aria-hidden="true" /><h2>{stateTitle}</h2><p>{stateMessage}</p>
        <div className="sm-nearby-actions">
          {selection?.state === "demo-blocked"
            ? <button type="button" className="sm-secondary" onClick={() => { invalidatePending(); onOrigin(null); }}>성수 예시 확인</button>
            : <button type="button" className="sm-secondary" onClick={refresh}><RefreshCw size={17} aria-hidden="true" />다시 조회</button>}
          <button type="button" className="sm-secondary" onClick={close}>지도로 돌아가기</button>
        </div>
      </div> : <>
        <section className="sm-nearby-place" aria-labelledby="nearby-place-name">
          <span className="sm-kicker">{show.spot.category}</span>
          <h2 id="nearby-place-name">{show.spot.name}</h2>
          <p>조회 기준점에서 직선거리 {distance(show.spot.distanceMeters)}</p>
          <p className="sm-source-note">조회된 장소 중 가장 가까운 곳이에요. 실제 이동 거리는 달라요.</p>
          <details className="sm-nearby-provenance">
            <summary>출처와 자료 기준 시각</summary>
            <SourceMeta source={show.spot.source} updatedAt={show.spot.updatedAt} />
            <p className="sm-nearby-meta">조회 결과 생성 시각: {timestampLabel(data!.generatedAt)}<br />조회 시각은 원자료의 기준 시각과 달라요.</p>
          </details>
        </section>
        {show.score.hardFilter.length > 0 && <p className="sm-inline-warning">{show.score.hardFilter.join(" · ")}</p>}
        <div className="sm-nearby-actions">
          <button type="button" className="sm-primary sm-wide" onClick={() => { invalidatePending(); onOpenPlace(show); }}>
            장소 자세히 보기<ArrowUpRight size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="sm-nearby-cards">
          <article className="sm-nearby-info-card">
            <h3><Clock3 size={18} aria-hidden="true" />운영 정보</h3>
            <dl>
              <div><dt>운영시간</dt><dd>{nearbyEvidenceText(show.spot.openingHours, (value) => value, "운영시간 제공 없음 확인")}</dd></div>
            </dl>
            <details className="sm-nearby-provenance">
              <summary>출처·자료 시각</summary>
              <SourceMeta source={show.spot.openingHours.source} updatedAt={show.spot.openingHours.updatedAt} />
            </details>
            <dl>
              <div><dt>운영 여부</dt><dd>{nearbyEvidenceText(show.spot.openNow,
                (value) => value ? "운영시간 기준 이용 가능" : "운영시간 기준 이용 불가", "이용 불가 확인")}</dd></div>
            </dl>
            <details className="sm-nearby-provenance">
              <summary>출처·자료 시각</summary>
              <SourceMeta source={show.spot.openNow.source} updatedAt={show.spot.openNow.updatedAt} />
            </details>
            <p className="sm-source-note">미확인은 정보가 확인되지 않았다는 뜻이에요. 실제 운영 여부는 방문 전 확인해 주세요.</p>
          </article>
          <article className="sm-nearby-info-card">
            <h3><Hospital size={18} aria-hidden="true" />이 장소 주변 의료시설</h3>
            {medical?.state === "ready" ? <>
              <strong>{medical.facility.name}</strong>
              <p>이 장소에서 직선 {distance(medical.facility.distanceMeters)}</p>
              <details className="sm-nearby-provenance">
                <summary>출처·자료 시각</summary>
                <SourceMeta source={medical.facility.source} updatedAt={medical.facility.updatedAt} />
              </details>
              <p className="sm-source-note">조회 자료에서 가장 가까운 의료시설이에요. 현재 진료·응급환자 수용 여부는 미확인이에요.</p>
            </> : <p>{medical?.state === "error"
              ? "의료시설 정보를 가져오지 못했어요."
              : medical?.state === "not-configured"
                ? "의료시설 정보가 아직 연결되지 않았어요."
                : medical?.state === "empty"
                  ? "조회된 의료시설 정보가 없어요. 주변에 시설이 없다는 뜻은 아니에요."
                  : "주변 의료시설 정보는 미확인이에요."}</p>}
            <button id="nearby-hospital-search" type="button" className="sm-secondary sm-wide" onClick={() => { invalidatePending(); onOpenHospitals(); }}>진료과·시간표 찾기<ArrowUpRight size={16} aria-hidden="true" /></button>
            <p className="sm-source-note">지역을 선택해 병·의원 정보를 따로 조회해요.</p>
          </article>
        </div>
        <p className="sm-source-note">자료 기준 시각 이후 운영·시설 상태가 달라졌을 수 있어요.</p>
        <details className="sm-nearby-calculation">
          <summary>방문 조건 계산 보기</summary>
          <p>{demo ? "예시 방문 조건 점수" : "방문 조건 점수"}: {scoreSummary(show.score).total ?? "확인 정보 부족"}{scoreSummary(show.score).total !== null && " / 100"} · 가중 확인율 {show.score.coverage}%</p>
          <p className="sm-source-note">획득 점수 ÷ 확인된 배점 × 100으로 계산해요. 확인율은 전체 배점 중 정보가 확인된 배점의 비율이며, 안전할 확률이나 모든 정보의 확인 여부가 아니에요.</p>
          <div className="sm-score-evidence">{show.score.components.map((part) => <div key={part.key}>
            <span><b>{part.label}</b><small>{["medical", "police", "tourist_info"].includes(part.key)
              ? part.detail.replace("· 직선", "· 이 장소에서 직선") : part.detail}</small></span>
            <strong>{part.earnedPoints === null ? "미확인" : `${part.earnedPoints} / ${part.maxPoints}`}</strong>
          </div>)}</div>
          <p className="sm-source-note">미확인 정보는 계산에서 제외해요. 확인된 ‘없음’은 ‘미확인’과 구분해 계산해요.</p>
        </details>
      </>}

      {!loading && !locating && demo && <p className="sm-inline-warning">현재 위치 조회 준비 중 · 지금은 성수의 가상 예시만 확인할 수 있어요.</p>}
      {canLocate && !locating && <div className="sm-nearby-actions">
        <button type="button" className="sm-secondary sm-wide" onClick={locate}><LocateFixed size={18} aria-hidden="true" />현재 위치로 조회</button>
        <p className="sm-source-note">위치를 허용하면 주변 조회를 위해 좌표를 서버로 보내요.</p>
      </div>}
      {locationMessage && <p className="sm-inline-warning" role="status">{locationMessage}</p>}
    </div>
  </Modal>;
}

function timestampLabel(value: string | null): string {
  if (!value) return "미제공";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미제공";
  // Date-only source values do not provide an observation time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

function SourceMeta({ source, updatedAt }: { source: DataSource | null; updatedAt: string | null }) {
  return <p className="sm-nearby-meta">
    출처: {source?.name || "미확인"}{source?.kind === "DEMO_DATA" && " · 가상 예시"}<br />
    자료 기준 시각: {timestampLabel(updatedAt)}
  </p>;
}
