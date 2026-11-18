import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, CircleAlert, Clock3, Hospital as HospitalIcon, LoaderCircle, MapPin, Phone, RefreshCw } from "lucide-react";
import { HOSPITAL_DAYS, HOSPITAL_REGIONS, type Hospital, type HospitalDay, type HospitalRegionId, type HospitalResponse } from "../../../shared/hospitals";
import { Modal } from "./Modal";
import { fetchHospitals, hospitalFetchErrorMessage } from "../services/hospitals";
import { distance, mapLink } from "../utils/format";
import { createLatestRequestGate } from "../utils/nearby";
import {
  ALL_DEPARTMENTS, UNKNOWN_DEPARTMENT, currentHospitalDay, departmentOptions, filterHospitals,
  hospitalContactLinks, hospitalDepartments, hospitalHoursLabel, hospitalResponseIssue, hospitalTimestamp,
  resolveHospitalDepartment,
} from "../utils/hospital";
import "../hospital-finder.css";
import { useConnection } from '../hooks/useConnection';
import { useAppServer } from '../hooks/useAppServer';
import { SnapshotNotice } from './OfflineNotice';

type HospitalLoad = {
  key: string;
  state: "loading" | "ready" | "error" | "cancelled";
  data: HospitalResponse | null;
  message: string;
};

export function HospitalFinder({ onClose, origin }: { onClose: () => void; origin?: import('../../../shared/models').Region }) {
  const online = useConnection();
  const server = useAppServer();
  const [regionId, setRegionId] = useState<HospitalRegionId>("seongsu");
  const [department, setDepartment] = useState(ALL_DEPARTMENTS);
  const [departmentNotice, setDepartmentNotice] = useState("");
  const [day, setDay] = useState<HospitalDay>(() => currentHospitalDay());
  const [revision, setRevision] = useState(0);
  const [load, setLoad] = useState<HospitalLoad | null>(null);
  const gate = useRef(createLatestRequestGate());
  const controller = useRef<AbortController | null>(null);
  const requestKey = `${origin ? `${origin.lat}:${origin.lng}` : regionId}:${revision}:${online}:${server}`;
  const latestKey = useRef(requestKey);
  latestKey.current = requestKey;
  const region = origin ? { ...origin, originName: origin.name } : HOSPITAL_REGIONS.find((item) => item.id === regionId)!;
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const requests = gate.current;
    const ticket = requests.next();
    const abort = new AbortController();
    controller.current = abort;
    setLoad({ key: requestKey, state: "loading", data: null, message: "" });
    fetchHospitals(origin ?? regionId, abort.signal).then((data) => {
      if (!abort.signal.aborted && requests.isCurrent(ticket) && latestKey.current === requestKey) {
        setLoad({ key: requestKey, state: "ready", data, message: "" });
      }
    }).catch((error: unknown) => {
      if (!abort.signal.aborted && requests.isCurrent(ticket) && latestKey.current === requestKey) {
        setLoad({ key: requestKey, state: "error", data: null,
          message: hospitalFetchErrorMessage(error) });
      }
    });
    return () => { requests.invalidate(); abort.abort(); };
  }, [regionId, requestKey]);

  const current = load?.key === requestKey ? load : null;
  const loading = !current || current.state === "loading";
  const response = current?.state === "ready" ? current.data : null;
  const issue = response ? hospitalResponseIssue(response, origin ?? regionId) : null;
  const data = issue ? null : response;
  const hospitals = data?.status === "OK" ? data.hospitals : [];
  const departments = departmentOptions(hospitals);
  const selectedDepartment = data?.status === "OK" ? resolveHospitalDepartment(hospitals, department) : department;
  const pendingDepartment = selectedDepartment.startsWith("department:") &&
    !departments.includes(selectedDepartment.slice("department:".length));
  const filtered = filterHospitals(hospitals, selectedDepartment);
  useEffect(() => setShowAll(false), [requestKey, selectedDepartment]);
  const hasResults = hospitals.length > 0;
  const demo = data?.mode === "DEMO";

  useEffect(() => {
    if (data?.status === "OK" && selectedDepartment !== department) {
      setDepartment(selectedDepartment);
      setDepartmentNotice("새로 조회한 목록에 선택한 진료과가 없어 전체 진료과를 표시했어요.");
    }
  }, [data, department, selectedDepartment]);

  function stopPending() { gate.current.invalidate(); controller.current?.abort(); }
  function close() { stopPending(); onClose(); }
  function chooseRegion(next: HospitalRegionId) {
    if (next === regionId) return;
    stopPending();
    setDepartment(ALL_DEPARTMENTS);
    setDepartmentNotice("");
    setRegionId(next);
  }
  function retry() { stopPending(); setDepartmentNotice(""); setRevision((value) => value + 1); }
  function cancel() {
    stopPending();
    setLoad({ key: requestKey, state: "cancelled", data: null, message: "" });
  }

  return <Modal title="병원·진료과·운영시간" onClose={close} className="safety-dialog hf-dialog">
    <div className="hf-scroll">
      {demo && <aside className="hf-demo">
        <span className="hf-demo-badge">DEMO · 예시 자료</span>
        <p>실제 병원이 아닌 가상 예시예요. 전화·지도 연결은 제공하지 않아요.</p>
      </aside>}
      {data?.mode === "LIVE" && data.status === "OK" && !data.offlineSnapshotAt && <div className="hf-live"><span>LIVE · 공공데이터</span></div>}
      <SnapshotNotice at={data?.offlineSnapshotAt} label="의료기관" />
      <div className={`hf-controls ${origin ? 'hf-nearby-controls' : ''}`}>
        {!origin && <label className="hf-region-label">조회 지역
          <select value={regionId} onChange={(event) => chooseRegion(event.target.value as HospitalRegionId)}>
            {HOSPITAL_REGIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        <label>진료과
          <select value={selectedDepartment} disabled={!hasResults || loading}
            onChange={(event) => { setDepartment(event.target.value); setDepartmentNotice(""); }}>
            <option value={ALL_DEPARTMENTS}>전체 진료과</option>
            {pendingDepartment && <option value={selectedDepartment}>{selectedDepartment.slice("department:".length)}</option>}
            {departments.map((name) => <option value={`department:${name}`} key={name}>{name}</option>)}
            <option value={UNKNOWN_DEPARTMENT}>진료과 정보 없음</option>
          </select>
        </label>
        <label>확인할 요일
          <select value={day} onChange={(event) => setDay(Number(event.target.value) as HospitalDay)}>
            {HOSPITAL_DAYS.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}
          </select>
        </label>
      </div>
      <p className="hf-help">한국 시간 기준 · 공휴일은 직접 선택</p>
      {departmentNotice && <p className="hf-notice" role="status">{departmentNotice}</p>}
      <div className="hf-origin"><MapPin size={16} aria-hidden="true" /><p>
        <b>{region.originName} 기준 직선거리</b>
        <span>{origin ? origin.address : '현재 위치 기준이 아니며, 실제 이동 거리는 달라요.'}</span>
      </p></div>

      {loading ? <div className="hf-state" role="status">
        <LoaderCircle className="spin" size={27} aria-hidden="true" />
        <h2>{region.name} 병원을 조회하고 있어요</h2>
        <p>진료과와 시간표를 함께 확인하고 있어요.</p>
        <button type="button" className="sm-secondary" onClick={cancel}>조회 취소</button>
      </div> : current?.state === "cancelled" ? <div className="hf-state" role="status">
        <h2>병원 조회를 취소했어요</h2><p>원할 때 다시 조회할 수 있어요.</p>
        <button type="button" className="sm-secondary" onClick={retry}><RefreshCw size={16} aria-hidden="true" />다시 조회</button>
      </div> : current?.state === "error" || issue ? <div className="hf-state" role="alert">
        <CircleAlert size={26} aria-hidden="true" /><h2>병원 정보를 불러오지 못했어요</h2>
        <p>{issue || current?.message}</p>
        <button type="button" className="sm-secondary" onClick={retry}><RefreshCw size={16} aria-hidden="true" />다시 조회</button>
      </div> : data?.status === "NOT_CONFIGURED" ? <div className="hf-state" role="status">
        <HospitalIcon size={28} aria-hidden="true" /><h2>병원 정보 연결 준비 중이에요</h2>
        <p>아직 조회할 자료가 연결되지 않았어요. 해당 지역에 병원이 없다는 뜻은 아니에요.</p>
        <button type="button" className="sm-secondary" onClick={retry}>다시 조회</button>
      </div> : data ? <>
        {(data.partial || data.detailFailures > 0) && <aside className="hf-notice" role="status">
          {data.partial && <p>{origin ? '선택 위치의 시군구 · 직선 5km 이내 일부 병원이에요. 인접 시군구는 포함하지 않아요.' : '이 지역의 일부 병원만 조회했어요. 전체 병원 목록이 아니에요.'}</p>}
          {data.detailFailures > 0 && <>
            <p>{data.detailFailures}곳의 상세정보를 가져오지 못했어요. 진료과·시간표에 빠진 정보가 있을 수 있어요.</p>
            <button type="button" className="hf-text-button" onClick={retry}><RefreshCw size={15} aria-hidden="true" />상세정보 다시 조회</button>
          </>}
        </aside>}
        <div className="hf-results-heading">
          <p className="hf-count" role="status" aria-atomic="true">이번 조회 <b>{hospitals.length}곳</b> 중 <b>{origin && !showAll ? Math.min(3, filtered.length) : filtered.length}곳</b> 표시</p>
          <button type="button" className="hf-refresh" onClick={retry} aria-label="병원 목록 다시 조회"><RefreshCw size={17} aria-hidden="true" /></button>
        </div>
        <p className="hf-help">진료과는 이번 조회 목록 안에서만 필터링해요.</p>
        {!hasResults ? <div className="hf-state" role="status">
          <HospitalIcon size={28} aria-hidden="true" />
          <h2>{demo && regionId !== "seongsu" ? "성동구 예시를 확인해 주세요" : "이번 조회에서 표시할 병원이 없어요"}</h2>
          <p>{demo && regionId !== "seongsu"
            ? "지금은 서울 성동구의 가상 병원 예시만 제공해요."
            : "검색 결과가 비어 있어요. 실제로 이 지역에 병원이 없다는 뜻은 아니에요."}</p>
          {demo && regionId !== "seongsu" && <button type="button" className="sm-secondary" onClick={() => chooseRegion("seongsu")}>성동구 예시 보기</button>}
        </div> : filtered.length === 0 ? <div className="hf-state" role="status">
          <h2>이 조건에 맞는 조회 결과가 없어요</h2>
          <p>선택한 진료과 조건에 해당하는 병원이 이번 목록에 없어요.</p>
          <button type="button" className="sm-secondary" onClick={() => setDepartment(ALL_DEPARTMENTS)}>전체 진료과 보기</button>
        </div> : <div className="hf-list">
          {(origin && !showAll ? filtered.slice(0, 3) : filtered).map((hospital) => <HospitalCard key={hospital.id} hospital={hospital} day={day} mode={data.mode} originName={region.originName} />)}
          {origin && !showAll && filtered.length > 3 && <button type="button" className="sm-secondary sm-wide" onClick={() => setShowAll(true)}>나머지 후보 {filtered.length - 3}곳 보기</button>}
        </div>}
        <details className="hf-data-info">
          <summary>조회 시각과 자료 범위<ChevronDown size={15} aria-hidden="true" /></summary>
          <p>조회 결과 생성 시각: {hospitalTimestamp(data.fetchedAt)}</p>
          <p>조회 시각은 병원이 등록한 자료의 갱신 시각과 달라요. 원자료 갱신 시각은 각 병원의 출처에서 확인하세요.</p>
          <p>목록은 최대 10분 전, 상세정보는 최대 1시간 전 조회 자료일 수 있어요.</p>
          <p>{origin ? '선택한 위치의 시군구 목록 중 직선 5km 이내의 최대 12곳을 조회해요. 인접 시군구는 포함하지 않으며, 전체 지역에서 가장 가까운 병원을 보장하지 않아요.' : '지역 목록 중 최대 300곳을 확인하고, 기준점과 가까운 최대 12곳의 상세정보를 조회해요. 전체 지역에서 가장 가까운 병원을 보장하지 않아요.'}</p>
        </details>
      </> : null}
    </div>
    <div className="hf-verification"><CircleAlert size={17} aria-hidden="true" /><p>휴게시간·접수 마감·공휴일 변동은 방문 전 전화 확인이 필요해요.</p></div>
  </Modal>;
}

function HospitalCard({ hospital, day, mode, originName }: {
  hospital: Hospital;
  day: HospitalDay;
  mode: HospitalResponse["mode"];
  originName: string;
}) {
  const departments = hospitalDepartments(hospital);
  const contacts = hospitalContactLinks(hospital, mode);
  const hours = hospital.hours.find((item) => item.day === day);
  const distanceLabel = Number.isFinite(hospital.distanceMeters) && hospital.distanceMeters >= 0
    ? `직선 ${distance(hospital.distanceMeters)}` : "직선거리 정보 없음";
  return <article className="hf-card">
    <div className="hf-card-heading"><h3>{hospital.name}</h3><span>{distanceLabel}</span></div>
    <p className="hf-card-origin">{originName} 기준</p>
    <p className="hf-departments"><span>진료과</span>{departments.length ? departments.join(" · ") : "정보 없음"}</p>
    {hospital.detailStatus !== "OK" && <p className="hf-detail-status">{hospital.detailStatus === "ERROR"
      ? "상세정보를 불러오지 못한 항목이 있어요."
      : "상세정보가 제공되지 않은 항목이 있어요."}</p>}
    <div className="hf-selected-hours"><Clock3 size={17} aria-hidden="true" /><span>{HOSPITAL_DAYS[day - 1]} 등록시간</span><strong>{hospitalHoursLabel(hours)}</strong></div>
    <div className="hf-call-check"><b>현재 접수 여부는 전화 확인이 필요해요</b><p>“오늘 해당 진료과 진료를 하나요? 지금 접수할 수 있나요? 몇 시까지 도착해야 하나요?”</p></div>
    <details className="hf-hours">
      <summary>요일별 시간표<ChevronDown size={16} aria-hidden="true" /></summary>
      <table>
        <caption className="hf-sr-only">{hospital.name} 요일별 등록시간</caption>
        <thead><tr><th scope="col">요일</th><th scope="col">등록시간</th></tr></thead>
        <tbody>{HOSPITAL_DAYS.map((name, index) => <tr key={name} className={index + 1 === day ? "hf-selected-day" : ""}>
          <th scope="row">{name}{index + 1 === day && <span className="hf-sr-only"> · 선택한 요일</span>}</th>
          <td>{hospitalHoursLabel(hospital.hours.find((item) => item.day === index + 1))}</td>
        </tr>)}</tbody>
      </table>
      <p className="hf-help">‘정보 없음’은 등록된 시간을 확인할 수 없다는 뜻이며, 휴진을 뜻하지 않아요.</p>
    </details>
    <p className="hf-address"><MapPin size={15} aria-hidden="true" /><span>{hospital.address || "주소 정보 없음"}</span></p>
    {(contacts.phone || contacts.map) && <div className="hf-card-actions">
      {contacts.phone && <a href={contacts.phone}><Phone size={16} aria-hidden="true" /><span>전화 문의<small>{hospital.phone}</small></span></a>}
      {contacts.map && <a href={mapLink(hospital.name, hospital)} target="_blank" rel="noopener noreferrer"><MapPin size={16} aria-hidden="true" />길찾기<ArrowUpRight size={14} aria-hidden="true" /><span className="hf-sr-only"> · 새 창</span></a>}
    </div>}
    {mode === "LIVE" && !contacts.phone && <p className="hf-help">전화 연결에 사용할 수 있는 번호가 없어요.</p>}
    <details className="hf-source">
      <summary>출처·자료 갱신 시각<ChevronDown size={14} aria-hidden="true" /></summary>
      <p>출처: {hospital.source.name || "미확인"}{hospital.source.kind === "DEMO_DATA" && " · 가상 예시"}</p>
      <p>원자료 갱신 시각: {hospitalTimestamp(hospital.updatedAt)}</p>
      <p>운영시간은 등록된 정보이며, 현재 진료 여부를 뜻하지 않아요.</p>
    </details>
  </article>;
}
