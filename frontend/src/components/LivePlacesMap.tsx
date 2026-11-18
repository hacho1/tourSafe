import { deviceLocation } from '../services/deviceLocation';
import { ToiletAddressSearch } from './ToiletAddressSearch';
import { useMapWeather } from '../hooks/useMapWeather';
import { MapErrorBoundary, MapFailureNotice } from './MapErrorBoundary';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronLeft, Hospital, Info, List, LocateFixed, MapPin, Phone, Search, Shield, Toilet, Trees, Video, X } from 'lucide-react';
import type { Coordinates, Recommendation, Region } from '../../../shared/models';
import type { MapFacilityType } from '../../../shared/mapFacilities';
import { createSearchLocationController } from '../utils/searchLocation';
import { helpLocationContext, helpLocationLabel, type HelpLocation } from '../utils/helpLocation';
import type { NearbyHelpCategory, NearbyHelpRequest } from '../utils/nearbyHelp';
import { facilityDistanceLabel, isAddressReference } from '../utils/facilityLocation';
import { HelpLocationPicker } from './HelpLocationPicker';
import { useConnection } from '../hooks/useConnection';
import { SnapshotNotice } from './OfflineNotice';
import { Modal } from './Modal';
import { useRecommendations } from '../hooks/useRecommendations';
import { useMapFacilities } from '../hooks/useMapFacilities';
import { useMapHospitals } from '../hooks/useMapHospitals';
import { MAP_LAYER_STORAGE, mapLayerFor, mapPointKind, mergeMapMedical, parseMapLayers, type MapLayer } from '../utils/mapLayers';
import { currentHospitalDay, hospitalHoursLabel } from '../utils/hospital';
import type { MapPoint } from './MapPanel';
import { dateLabel, distance, mapLink, phoneLink, timeLabel } from '../utils/format';
const TourSafeMapPanel = lazy(() => import('./TourSafeMapPanel'));
type Category = MapFacilityType | 'SPOT';
const categories = [
  { type: 'MEDICAL', name: '병원·응급의료', note: '병원·의원과 응급기관 구분', group: '의료·경찰 지원', Icon: Hospital },
  { type: 'POLICE', name: '경찰시설', note: '가까운 검색 후보', group: '의료·경찰 지원', Icon: Shield },
  { type: 'TOURIST_INFO', name: '관광안내소', note: '비긴급 관광·길 안내', group: '관광·편의 지원', Icon: Info },
  { type: 'TOILET', name: '화장실', note: '지도 위치·개방시간', group: '관광·편의 지원', Icon: Toilet },
  { type: 'CCTV', name: 'CCTV 설치 위치', note: '작동 여부 미확인', group: '여행·참고 정보', Icon: Video },
  { type: 'SPOT', name: '여행지', note: '주변 관광지 둘러보기', group: '여행·참고 정보', Icon: Trees },
] as const;
const labels: Record<Category, string> = { CCTV: 'CCTV 설치 지점', MEDICAL: '병원·응급의료', TOURIST_INFO: '관광안내소', POLICE: '경찰시설', TOILET: '화장실', SPOT: '여행지' };
const layerButtons = [{ type: 'MEDICAL', label: '의료', Icon: Hospital }, { type: 'POLICE', label: '경찰', Icon: Shield }, { type: 'TOILET', label: '화장실', Icon: Toilet }, { type: 'CCTV', label: 'CCTV', Icon: Video }] as const;
export function LivePlacesMap({ onExplore, onAbout, onOpenPlace, location, onLocation, onHospitals, active, visible, nearbyHelpRequest }: {
  onExplore: () => void; onAbout: () => void; onOpenPlace: (item: Recommendation) => void;
  location: HelpLocation; onLocation: (location: HelpLocation) => void; onHospitals: () => void; active: boolean; visible: boolean; nearbyHelpRequest?: NearbyHelpRequest | null;
}) {
  const online = useConnection();
  const [category, setCategory] = useState<Category | null>(null);
  const [layers, setLayers] = useState(() => { try { return parseMapLayers(localStorage.getItem(MAP_LAYER_STORAGE)); } catch { return parseMapLayers(null); } });
  const [medicalFilter, setMedicalFilter] = useState<'ALL' | 'HOSPITAL' | 'EMERGENCY'>('ALL');
  const [extraCategory, setExtraCategory] = useState<Category | null>(null);
  const [selected, setSelected] = useState<string>();
  const [facilitiesOpen, setFacilitiesOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [locationRequest] = useState(() => createSearchLocationController());
  const [viewCenter, setViewCenter] = useState<Coordinates>(location);
  const [showAll, setShowAll] = useState(false);
  const locationTrigger = useRef<HTMLButtonElement>(null);
  const facilityTrigger = useRef<HTMLButtonElement>(null);
  const facilitySheet = useRef<HTMLDivElement>(null);
  const facilityHeading = useRef<HTMLHeadingElement>(null);
  const facilityReturnFocus = useRef<HTMLElement | null>(null);
  const listPosition = useRef<{ scrollTop: number; focusId?: string }>({ scrollTop: 0 });
  const selectedOrigin = useRef<{ fromList: boolean; markerId?: string }>({ fromList: false });
  const originLabel = helpLocationLabel(location);
  const handledNearbyRequest = useRef<number | null>(null);
  const pendingCategory = useRef<NearbyHelpCategory | null>(null);
  useEffect(() => { try { localStorage.setItem(MAP_LAYER_STORAGE, JSON.stringify(layers)); } catch { /* Session selection still works. */ } }, [layers]);
  useEffect(() => {
    if (!active) { locationRequest.cancel(); setLocating(false); }
    return () => locationRequest.cancel();
  }, [active, locationRequest]);
  useEffect(() => { if (!visible) { setPicker(false); setFacilitiesOpen(false); } }, [visible]);
  useEffect(() => { setSelected(undefined); setExtraCategory(null); setViewCenter(location); setShowAll(false); listPosition.current = { scrollTop: 0 }; }, [location.lat, location.lng]);
  useEffect(() => {
    if (!visible || !nearbyHelpRequest || handledNearbyRequest.current === nearbyHelpRequest.requestId) return;
    handledNearbyRequest.current = nearbyHelpRequest.requestId;
    locationRequest.cancel(); setLocating(false); setSelected(undefined); setExtraCategory(null);
    setCategory(nearbyHelpRequest.category); setMedicalFilter('ALL'); setShowAll(false);
    setLayers(previous => ({ ...previous, [nearbyHelpRequest.category]: true }));
    listPosition.current = { scrollTop: 0 };
    facilityReturnFocus.current = null;
    pendingCategory.current = nearbyHelpRequest.origin ? null : nearbyHelpRequest.category;
    setFacilitiesOpen(Boolean(nearbyHelpRequest.origin));
    setPicker(!nearbyHelpRequest.origin);
    setLocationMessage(nearbyHelpRequest.origin ? '' : '이전 저장에는 좌표가 없어요. 도움을 찾을 기준 장소를 선택해 주세요.');
    const frame = requestAnimationFrame(() => document.getElementById('live-safety-map')?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [nearbyHelpRequest, visible, locationRequest]);
  useEffect(() => {
    if (!facilitiesOpen) return;
    const frame = requestAnimationFrame(() => {
      const sheet = facilitySheet.current;
      if (!sheet) return;
      const row = Array.from(sheet.querySelectorAll<HTMLButtonElement>('[data-facility-id]')).find(button => button.dataset.facilityId === listPosition.current.focusId);
      (row || facilityHeading.current)?.focus({ preventScroll: true });
      sheet.scrollTop = listPosition.current.scrollTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [facilitiesOpen, category]);
  function chooseLocation(next: Region, kind: HelpLocation['kind'] = 'manual') {
    if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng) || next.lat < 33 || next.lat > 39.5 || next.lng < 124 || next.lng > 132) {
      setLocationMessage('대한민국 내의 위치를 선택해 주세요.'); return;
    }
    locationRequest.cancel(); setLocating(false); setLocationMessage(''); setPicker(false);
    onLocation({ ...next, kind });
    if (pendingCategory.current) {
      setCategory(pendingCategory.current); pendingCategory.current = null; setFacilitiesOpen(true);
    }
    requestAnimationFrame(() => locationTrigger.current?.focus({ preventScroll: true }));
  }
  function locate() {
    setLocating(true); setLocationMessage('');
    locationRequest.request(deviceLocation(), next => chooseLocation(next, 'gps'), message => { setLocating(false); setLocationMessage(message); setPicker(true); });
  }
  function openFacilities(trigger: HTMLButtonElement) {
    facilityReturnFocus.current = trigger;
    setFacilitiesOpen(true);
  }
  function closeFacilities() {
    setFacilitiesOpen(false);
    requestAnimationFrame(() => {
      const trigger = facilityReturnFocus.current?.isConnected ? facilityReturnFocus.current : facilityTrigger.current;
      trigger?.focus({ preventScroll: true });
    });
  }
  function chooseCategory(next: Category | null) {
    listPosition.current = { scrollTop: 0 };
    setCategory(next); setShowAll(false);
  }
  function closePlace() {
    const origin = selectedOrigin.current;
    setSelected(undefined);
    requestAnimationFrame(() => {
      const marker = !origin.fromList && Array.from(document.querySelectorAll<HTMLButtonElement>('#live-safety-map .ts-map-pin[data-point-id]')).find(button => button.dataset.pointId === origin.markerId);
      (marker || facilityTrigger.current)?.focus({ preventScroll: true });
    });
  }
  function toggleLayer(layer: MapLayer) {
    setLayers(previous => ({ ...previous, [layer]: !previous[layer] }));
    if (currentFacility && mapLayerFor(currentFacility.type) === layer && layers[layer]) setSelected(undefined);
  }
  function selectPlace(id: string) {
    if (facilitiesOpen) {
      listPosition.current = { scrollTop: facilitySheet.current?.scrollTop ?? listPosition.current.scrollTop, focusId: id };
      selectedOrigin.current = { fromList: true };
    } else {
      selectedOrigin.current = { fromList: false, markerId: document.activeElement instanceof HTMLElement ? document.activeElement.dataset.pointId || id : id };
    }
    const item = allFacilities.find(point => point.id === id) || rows.find(row => row.spot.id === id)?.spot;
    const type = item && 'type' in item ? item.type : 'SPOT';
    const layer = mapLayerFor(type);
    if (layer) setLayers(previous => ({ ...previous, [layer]: true }));
    else setExtraCategory(type as Category);
    setSelected(id); setFacilitiesOpen(false);
    requestAnimationFrame(() => document.getElementById('calm-selected-title')?.focus({ preventScroll: true }));
  }
  const { data, loading, error, refresh } = useRecommendations({ ...location, radius: 3000, withKids: true });
  const facilities = useMapFacilities(location, '');
  const weatherQuery = useMapWeather(location);
  const [addressLimit, setAddressLimit] = useState(30);
  useEffect(() => setAddressLimit(30), [location.lat, location.lng]);
  const hospitals = useMapHospitals(location);
  const currentData = data?.origin.lat === location.lat && data.origin.lng === location.lng ? data : null;
  const rows = useMemo(() => !loading && currentData?.mode === 'LIVE' ? currentData.recommendations : [], [currentData, loading]);
  const allFacilities = useMemo(() => mergeMapMedical(facilities.data?.facilities || [], hospitals.data?.status === 'OK' ? hospitals.data.hospitals : []), [facilities.data, hospitals.data]);
  const visiblePlaces = useMemo(() => extraCategory === 'SPOT' ? rows : [], [rows, extraCategory]);
  const visibleFacilities = useMemo(() => allFacilities.filter(item => { const layer = mapLayerFor(item.type); return layer ? layers[layer] : item.type === extraCategory; }), [allFacilities, layers, extraCategory]);
  const points = useMemo<MapPoint[]>(() => [
    ...visiblePlaces.map(({ spot }) => ({ id: spot.id, name: spot.name, lat: spot.lat, lng: spot.lng, type: 'SPOT' as const, category: spot.category })),
    ...visibleFacilities,
  ], [visiblePlaces, visibleFacilities]);
  const currentPlace = visiblePlaces.find(item => item.spot.id === selected);
  const currentFacility = visibleFacilities.find(item => item.id === selected);
  const current = currentPlace?.spot || currentFacility;
  const currentPhone = phoneLink(currentFacility?.phone || null);
  const listedFacilities = allFacilities.filter(item => category === 'MEDICAL'
    ? mapLayerFor(item.type) === 'MEDICAL' && (medicalFilter === 'ALL' || (medicalFilter === 'HOSPITAL' ? Boolean(item.hospital) : item.emergency))
    : item.type === category);
  const listPoints: MapPoint[] = category === 'SPOT' ? rows.map(({ spot }) => ({ ...spot, type: 'SPOT' })) : listedFacilities;
  const categoryLoading = category === 'SPOT' ? loading : facilities.loading;
  const status = facilities.data?.statuses.find(item => item.key === (category === 'POLICE' ? 'police' : category === 'MEDICAL' ? 'medical' : 'publicFiles'));
  const categoryFailed = category === 'SPOT' ? Boolean(error || currentData?.mode === 'DEMO' || currentData?.statuses.find(s => s.key === 'tour')?.status !== 'OK') : facilities.error || status?.status !== 'OK';
  const toilets = facilities.data?.unlocatedToilets;
  const weather = weatherQuery.data?.weather;
  const publicStatus = facilities.data?.statuses.find(item => item.key === 'publicFiles');
  const policeStatus = facilities.data?.statuses.find(item => item.key === 'police');
  const medicalStatus = facilities.data?.statuses.find(item => item.key === 'medical');
  const layerIssues = [
    layers.CCTV && !facilities.loading && (facilities.error || publicStatus?.status !== 'OK') ? 'CCTV' : '',
    layers.TOILET && !facilities.loading && (facilities.error || publicStatus?.status !== 'OK') ? '화장실' : '',
    layers.POLICE && !facilities.loading && (facilities.error || policeStatus?.status !== 'OK') ? '경찰' : '',
    layers.MEDICAL && !hospitals.loading && hospitals.error ? '병원' : '',
    layers.MEDICAL && !facilities.loading && (facilities.error || medicalStatus?.status !== 'OK') ? '응급의료' : '',
  ].filter(Boolean);
  const layerLoading = (facilities.loading && Object.values(layers).some(Boolean)) || (layers.MEDICAL && hospitals.loading);
  function refreshAll() { facilities.refresh(); hospitals.refresh(); weatherQuery.refresh(); }
  const moved = Math.hypot(viewCenter.lat - location.lat, viewCenter.lng - location.lng) > 0.002;
  const list = showAll ? listPoints : listPoints.slice(0, 3);
  const controls = <>
          <div className="calm-map-heading">
            <h2>주변 지원시설 지도</h2>
            <button ref={locationTrigger} type="button" className="calm-location-choice" onClick={() => { locationRequest.cancel(); setLocating(false); setPicker(true); }} aria-label={`조회 위치 변경: ${originLabel}`}><MapPin size={18} aria-hidden="true" /><span><span className="refined-location-label"><span className="refined-mobile-brand" aria-hidden="true">TourSafe</span><small>{helpLocationContext(location)}</small></span><b>{originLabel}</b></span><Search size={18} aria-hidden="true" /></button>
            {(locationMessage || locating) && <p className="calm-location-message" role="status">{locationMessage || '위치 확인 중 · 아직 이전 위치의 정보예요.'}</p>}
            {location.kind === 'gps' && !locationMessage && !locating && <p className="calm-location-captured">{location.address}</p>}
          </div>
          <div className="calm-map-bottom">
            <div className="refined-map-actions">
            {moved && !selected && <button className="calm-search-here" type="button" onClick={() => chooseLocation({ ...viewCenter, name: '지도에서 선택한 위치', address: '지도 중심을 기준으로 조회했어요.' }, 'map')}><Search size={16} />이 위치에서 다시 찾기</button>}
            <button className="calm-locate" type="button" aria-label="내 위치로 찾기" onClick={locate} disabled={locating}><LocateFixed size={21} aria-hidden="true" /><span>{locating ? '확인 중' : '내 위치'}</span></button>
            </div>
            {current ? <article key={current.id} className="calm-place-card" aria-labelledby="calm-selected-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closePlace(); } }}>
              <div className="refined-card-toolbar"><button id="nearby-facilities" ref={facilityTrigger} className="refined-card-back" type="button" onClick={event => openFacilities(event.currentTarget)}><ChevronLeft size={18} aria-hidden="true" />목록으로</button><button className="calm-card-close" type="button" aria-label="장소 선택 해제" onClick={closePlace}><X size={21} aria-hidden="true" /></button></div>
              <h2 id="calm-selected-title" tabIndex={-1}>{current.name}</h2>
              <small>{currentFacility ? `${mapPointKind(currentFacility)} · ${facilityDistanceLabel(currentFacility)}` : `여행지 · 직선 ${distance(current.distanceMeters)}`}</small>
              <div className="calm-card-actions">{currentPhone && <a href={currentPhone}><Phone size={18} />전화 문의</a>}{currentPlace ? <button onClick={() => onOpenPlace(currentPlace)}>방문 정보<ArrowUpRight size={18} /></button> : <a href={mapLink(current.name, current)} target="_blank" rel="noreferrer">길찾기<ArrowUpRight size={18} /></a>}</div>
              {currentFacility && (currentFacility.hospital || currentFacility.type === 'MEDICAL') && <p className="toilet-position-note">현재 접수·진료 가능 여부는 전화로 확인해 주세요.</p>}
              {currentFacility?.type === 'TOURIST_INFO' && <p className="toilet-position-note">관광·길 안내를 돕는 비긴급 시설이에요. 관광안내·통역 {currentFacility.source.kind === 'DEMO_DATA' ? '1330' : <a href="tel:1330">1330</a>}</p>}
              {currentFacility?.type === 'CCTV' && <p className="toilet-position-note">설치 위치 자료예요. 실제 작동 여부와 지역의 안전도는 알 수 없어요.</p>}
              {currentFacility?.addressLocation && <p className="toilet-position-note">주소 기준 위치 · 실제 입구와 다를 수 있어요.</p>}
              <details key={current.id}><summary>주소·상세 정보</summary><p>{current.address || '주소 미제공'}</p>{currentFacility && <>
                <p>출발 기준: {helpLocationContext(location)} · {originLabel}</p>
                {isAddressReference(currentFacility) && <p>자료 좌표 사이의 직선 계산값 {distance(currentFacility.distanceMeters)} · 실제 입구까지 거리·이동 경로는 미확인이에요.</p>}
                {currentFacility.hospital ? <><p>진료과: {currentFacility.hospital.departments.join(' · ') || '미제공'}</p><p>오늘 요일의 등록시간: {hospitalHoursLabel(currentFacility.hospital.hours.find(item => item.day === currentHospitalDay()))}</p><p>공휴일·휴게시간·현재 접수 여부는 전화로 확인해 주세요.</p></> : <p>{currentFacility.type === 'CCTV' ? `설치자료 · 작동·촬영 범위 미확인${currentFacility.cameraCount != null ? ` · 등록 ${currentFacility.cameraCount}대` : ''}` : currentFacility.type === 'MEDICAL' ? '현재 진료·수용 가능 여부는 전화로 확인해 주세요.' : `운영시간: ${currentFacility.openingHours || '미제공'}`}</p>}
                <p>{currentFacility.phone || '전화번호 미제공'}</p><p>{currentFacility.source.name} · {dateLabel(currentFacility.updatedAt)}</p>{currentFacility.emergencyFacility && <p>응급기관 등록: {currentFacility.emergencyFacility.source.name} · 수용 가능 여부 미확인</p>}
                {currentFacility.type === 'TOILET' && <><p>위도 {currentFacility.lat.toFixed(6)} · 경도 {currentFacility.lng.toFixed(6)}</p>{currentFacility.addressLocation && <p>좌표: 카카오 주소 검색 · {dateLabel(currentFacility.addressLocation.checkedAt)} 변환<br />{currentFacility.addressLocation.matchedAddress}</p>}<p>등록된 개방시간이며 현재 이용 가능 여부는 현장·전화로 확인해 주세요.</p></>}
              </>}</details>
            </article> : <div className="refined-facility-panel">
            <div className="refined-facility-heading"><div className="map-layer-intro"><span id="map-layer-label">주변 시설 위치</span><small>위치 자료 · 안전도 평가 아님</small></div><button id="nearby-facilities" className="map-layer-list" ref={facilityTrigger} type="button" onClick={event => openFacilities(event.currentTarget)}><List size={18} aria-hidden="true" /><span>시설 목록</span><ArrowUpRight size={16} aria-hidden="true" /></button></div>
            <div className="map-layer-bar" role="group" aria-labelledby="map-layer-label">
              {layerButtons.map(({ type, label, Icon }) => <button key={type} className={`map-layer-toggle layer-${type.toLowerCase()}`} aria-label={`${type === 'CCTV' ? 'CCTV 설치 위치' : label} 지도 표시`} aria-pressed={layers[type]} onClick={() => toggleLayer(type)}><Icon size={19} aria-hidden="true" /><span><span className="refined-layer-check" aria-hidden="true">{layers[type] && <Check size={12} />}</span>{label}</span></button>)}
            </div>
            {layerIssues.length > 0 ? <div className="map-layer-notice" role="status"><span>{layerIssues.join('·')} 자료 확인 불가</span><button onClick={refreshAll}>재조회</button></div> : layerLoading ? <div className="map-layer-notice" role="status">시설 정보를 불러오는 중…</div> : !points.length && <div className="map-layer-notice">{Object.values(layers).some(Boolean) ? '조회 자료에 표시할 시설이 없어요. 목록에서 확인해 주세요.' : '시설 표시를 모두 껐어요.'}</div>}
            {extraCategory && <button className="map-extra-layer" onClick={() => { setExtraCategory(null); setSelected(undefined); }}>{labels[extraCategory]} 표시 끄기<X size={14} /></button>}
            </div>}
          </div>
  </>;
  const fallback = <div className="map-block ts-map-block ts-immersive dark"><div className="map-canvas-wrap">{controls}<MapFailureNotice /></div></div>;
  const offlineMap = <div className="map-block ts-map-block ts-immersive dark"><div className="map-canvas-wrap">{controls}<div className="offline-map-placeholder"><strong>오프라인 · 지도 배경 없이 시설 목록을 이용해요</strong><p>주소와 연락처는 미리 받은 자료예요. 아래 ‘시설 목록’에서 확인해 주세요.</p></div></div></div>;
  return <>
    <SnapshotNotice at={facilities.data?.offlineSnapshotAt} label="주변 시설" />
    <SnapshotNotice at={hospitals.data?.offlineSnapshotAt} label="의료기관" />
    <section id="live-safety-map" tabIndex={-1} className="tour-map tour-calm-map refined-map" aria-label="투어세이프 여행 지도">
      {!online ? offlineMap : <MapErrorBoundary fallback={fallback}><Suspense fallback={<div className="map-block ts-map-block ts-immersive dark"><div className="map-canvas-wrap">{controls}<div className="map-recovery" role="status">투어세이프 지도를 여는 중…</div></div></div>}>
        <TourSafeMapPanel points={points} selected={current?.id} onSelect={selectPlace} center={location} visible={visible} originLabel={location.kind === 'gps' ? '확인한 내 위치' : location.kind === 'saved' ? '저장한 방문지' : '조회 위치'} onViewCenter={setViewCenter} immersive settingsContent={close => <>
          <div className="calm-weather"><b>조회 위치의 날씨</b><p>{weatherQuery.loading ? '확인 중…' : weather?.temperature.value != null ? `${weather.temperature.value}° · ${weather.condition.value || '상태 미확인'}` : '날씨를 확인하지 못했어요.'}</p>{weather?.temperature.value != null && <small>{timeLabel(weather.temperature.updatedAt)} 관측 · 기상청</small>}<button onClick={refreshAll}>시설·날씨 새로 조회</button></div>
          <button className="calm-info-link" onClick={() => { close(); onAbout(); }}><Info size={18} />지도 자료·이용 안내</button>
        </>}>
          {controls}
        </TourSafeMapPanel>
      </Suspense></MapErrorBoundary>}
    </section>
    {picker && <HelpLocationPicker onChoose={chooseLocation} onClose={() => { pendingCategory.current = null; setPicker(false); requestAnimationFrame(() => locationTrigger.current?.focus({ preventScroll: true })); }} />}
    {facilitiesOpen && <Modal title="주변 시설" className="nearby-facilities-dialog refined-facilities-dialog" onClose={closeFacilities}>
      <div ref={facilitySheet} className="nearby-sheet-body" onScroll={event => { listPosition.current.scrollTop = event.currentTarget.scrollTop; }}>
        <p className="nearby-origin"><MapPin size={16} /><span>{helpLocationContext(location)} · {originLabel}{locating && ' · 위치 확인 중'}</span></p>
        <SnapshotNotice at={category === 'SPOT' ? data?.offlineSnapshotAt : facilities.data?.offlineSnapshotAt} label="주변 시설" />
        {category === 'MEDICAL' && <SnapshotNotice at={hospitals.data?.offlineSnapshotAt} label="의료기관" />}
        {location.kind === 'saved' && <p className="nearby-range">저장 위치 출처: {location.sourceName || '미확인'}{location.savedAt && ` · ${dateLabel(location.savedAt)} 저장`} · 내 현재 위치가 아니에요.</p>}
        {!category ? <><h2 ref={facilityHeading} tabIndex={-1}>어떤 정보가 필요하세요?</h2><p className="nearby-range">의료·경찰, 관광 안내와 참고 자료는 역할이 달라요. 등록된 위치가 현재 이용 가능함을 뜻하지는 않아요.</p>{(['의료·경찰 지원', '관광·편의 지원', '여행·참고 정보'] as const).map(group => <section className="nearby-category-group" key={group}><h3>{group}</h3><div className="nearby-category-grid">{categories.filter(item => item.group === group).map(({ type, name, note, Icon }) => <button key={type} onClick={() => chooseCategory(type)}><Icon size={22} aria-hidden="true" /><span><b>{name}</b><small>{note}</small></span></button>)}</div></section>)}</> : <>
          <button className="nearby-back" onClick={() => chooseCategory(null)}><ChevronLeft size={18} />종류 바꾸기</button>
          <h2 ref={facilityHeading} tabIndex={-1}>{labels[category]}</h2>
          {category === 'MEDICAL' && <><div className="medical-list-filters" role="group" aria-label="의료 목록 종류">{([{ key: 'ALL', name: '전체 의료' }, { key: 'HOSPITAL', name: '병원·의원' }, { key: 'EMERGENCY', name: '응급의료' }] as const).map(item => <button key={item.key} aria-pressed={medicalFilter === item.key} onClick={() => { setMedicalFilter(item.key); setShowAll(false); }}>{item.name}</button>)}</div><button className="nearby-show-more" disabled={locating} onClick={() => { setFacilitiesOpen(false); onHospitals(); }}>병원 진료과·요일별 시간표</button></>}
          <p className="nearby-range">{category === 'POLICE' ? '가까운 검색 후보 최대 3곳 · 직선 3km 이내' : category === 'TOILET' ? '전국 자료의 주소 기준 위치 · 직선 3km 내 가까운 최대 20개 위치의 자료 · 실제 입구와 다를 수 있어요.' : category === 'CCTV' ? '직선 3km 내 자료 중 간격을 두고 최대 40지점 표시' : category === 'MEDICAL' ? '병원: 같은 시군구·직선 5km 내 최대 12개 후보 / 응급기관: 직선 3km 내 최대 3개 후보' : '직선 3km 내 조회 자료 중 일부'}</p>
          {category === 'MEDICAL' && <div className="medical-data-state" role="status">{medicalFilter !== 'EMERGENCY' && (hospitals.loading ? <p>병원 정보를 불러오는 중…</p> : hospitals.error ? <p>병원 자료 확인 불가 <button onClick={hospitals.refresh}>병원 재조회</button></p> : null)}{medicalFilter !== 'HOSPITAL' && (facilities.loading ? <p>응급기관 정보를 불러오는 중…</p> : facilities.error || medicalStatus?.status !== 'OK' ? <p>응급기관 자료 확인 불가 <button onClick={facilities.refresh}>응급기관 재조회</button></p> : null)}</div>}
          {category !== 'MEDICAL' && categoryLoading ? <p className="nearby-empty" role="status">주변 정보를 불러오는 중이에요…</p> : category !== 'MEDICAL' && categoryFailed ? <div className="nearby-empty" role="alert"><p>자료를 확인하지 못했어요. 실제로 시설이 없다는 뜻은 아니에요.</p><button onClick={category === 'SPOT' ? refresh : facilities.refresh}>다시 조회</button></div> : <>
            {category === 'CCTV' && facilities.data?.cctvSummary && <div className="nearby-cctv-summary"><b>반경 500m 등록 설치지점 {facilities.data.cctvSummary.within500m}곳</b><p>불러온 설치자료 기준 · 카메라 대수와 달라요.</p><small>실시간 작동·촬영 범위나 지역의 안전 정도는 알 수 없어요.</small></div>}
            <>
              <div className="nearby-result-list">{list.map(point => { const item = listedFacilities.find(row => row.id === point.id); const spot = rows.find(row => row.spot.id === point.id)?.spot; return <button key={point.id} data-facility-id={point.id} onClick={() => selectPlace(point.id)}><span><b>{point.name}</b>{category === 'MEDICAL' && <small>{mapPointKind(point)}</small>}<small>{item ? facilityDistanceLabel(item) : spot ? `직선 ${distance(spot.distanceMeters)}` : '거리 미확인'}{item && item.type !== 'CCTV' && ` · ${phoneLink(item.phone) ? '전화번호 제공' : '전화번호 미제공'}`}</small></span><ArrowUpRight size={19} /></button>; })}</div>
              {!listPoints.length && <p className="nearby-empty">{category === 'TOILET' ? '이 위치 주변의 조회 자료에서 화장실 좌표를 확인하지 못했어요. 아래 지역 주소 목록도 확인해 주세요.' : '현재 불러온 자료에서 표시할 곳이 없어요. 실제로 주변 시설이 없다는 뜻은 아니에요.'}</p>}
              {!showAll && listPoints.length > 3 && <button className="nearby-show-more" onClick={() => setShowAll(true)}>나머지 {listPoints.length - 3}곳 보기</button>}
              {category === 'SPOT' && <button className="nearby-show-more" onClick={() => { setFacilitiesOpen(false); onExplore(); }}>여행지 조건으로 검색</button>}
              {category !== 'CCTV' && <p className="nearby-range">방문 전 운영·도움 제공 여부를 확인해 주세요.</p>}
            </>
            {category === 'TOILET' && facilities.data?.toiletCoordinates === 'PARTIAL' && <p className="nearby-range" role="status">전국 화장실 좌표 자료를 불러오지 못해 일부 위치와 주소만 표시해요. 화장실이 없다는 뜻은 아니에요.</p>}
            {category === 'TOILET' && facilities.data?.qualityIssues?.map(issue => <details className="nearby-address-only" key={issue.id}><summary>주소 확인 중 · {issue.name}</summary><p className="nearby-range">{issue.reason}</p><a href={issue.evidenceUrl} target="_blank" rel="noreferrer">공식 안내 확인 ↗</a></details>)}
            {category === 'TOILET' && <ToiletAddressSearch />}
            {category === 'TOILET' && <details className="nearby-address-only" key={toilets?.area}><summary>위치 미확인 주소 목록 · {toilets?.total ?? 0}곳</summary><p className="nearby-range">{toilets?.area || '행정구역 미확인'} · 거리 미확인 · {Math.min(addressLimit, toilets?.total ?? 0)}곳 표시</p>{toilets?.items.slice(0, addressLimit).map(item => <article className="nearby-address" key={item.id}><h3>{item.name}</h3><p>{item.address}</p><small>개방시간: {item.openingHours || '미제공'} · {dateLabel(item.updatedAt)}</small></article>)}{(toilets?.items.length ?? 0) > addressLimit && <button className="nearby-show-more" onClick={() => setAddressLimit(n => n + 30)}>주소 30곳 더 보기</button>}{!toilets?.items.length && <p className="nearby-range">{!toilets?.area ? '이 위치의 행정구역을 확인하지 못했어요. 장소를 직접 선택해 주세요.' : '추가로 표시할 주소 자료가 없어요.'}</p>}</details>}
          </>}
        </>}
      </div>
    </Modal>}
  </>;
}
