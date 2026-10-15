import { useEffect, useRef, useState } from 'react';
import { LocateFixed, Map, ShieldCheck } from 'lucide-react';
import { Modal } from '../components/Modal';
import { SavedFeedback } from '../components/SavedFeedback';
import { LivePlacesMap } from '../components/LivePlacesMap';
import { HospitalFinder } from '../components/HospitalFinder';
import { EmergencyEntry } from '../components/EmergencyHelp';
import { useSavedPlaces } from '../hooks/useSavedPlaces';
import type { HelpLocation } from '../utils/helpLocation';
import { SpotDetail } from './SpotDetail';
import type { Recommendation } from '../../../shared/models';

export function SafetyMap({ location, onLocation, active, onExplore, onSaved, onEmergency, emergencyOpen }: { location: HelpLocation; onLocation: (location: HelpLocation) => void; active: boolean; onExplore: () => void; onSaved: () => void; onEmergency: () => void; emergencyOpen: boolean }) {
  const [dialog, setDialog] = useState<'place' | 'hospitals' | 'about' | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Recommendation | null>(null);
  const hospitalTrigger = useRef<HTMLElement | null>(null);
  const saved = useSavedPlaces();
  function openHospitals() {
    hospitalTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog('hospitals');
  }
  function closeHospitals() {
    setDialog(null);
    requestAnimationFrame(() => {
      if (hospitalTrigger.current?.isConnected) hospitalTrigger.current.focus({ preventScroll: true });
      else document.getElementById('nearby-facilities')?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    if (!active) { setDialog(null); return; }
  }, [active]);
  return <div className="safety-app">
    <a className="skip-link" href="#live-safety-map" onClick={event => { event.preventDefault(); document.getElementById('live-safety-map')?.focus(); }}>안심 지도로 바로가기</a>
    <header className="sm-header emergency-header"><div className="sm-header-inner">
      <a className="sm-brand" href="#map" onClick={event => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label="TourSafe 안심 지도"><span><ShieldCheck size={26} /></span><b>Tour<span>Safe</span><small>여행의 모든 순간, 안심</small></b></a>
      <nav className="sm-desktop-nav" aria-label="주 메뉴"><button className="active" aria-current="page"><Map size={17} />안심 지도</button><button onClick={onExplore}>여행지 찾기</button><button onClick={onSaved}>저장한 장소</button></nav>
      <EmergencyEntry onClick={onEmergency} />
    </div></header>
    <main className="sm-main sm-reference-main">
      <div className="page-feedback"><SavedFeedback /></div>
      <LivePlacesMap location={location} onLocation={onLocation} visible={active} active={active && dialog === null && !emergencyOpen} onHospitals={openHospitals} onExplore={onExplore} onAbout={() => setDialog('about')} onOpenPlace={item => { setSelectedPlace(item); setDialog('place'); }} />
    </main>
    {dialog === 'hospitals' && <HospitalFinder origin={location} onClose={closeHospitals} />}
    {dialog === 'place' && selectedPlace && <SpotDetail item={selectedPlace} saved={saved.ids.includes(selectedPlace.spot.id)} onSave={() => saved.toggle(selectedPlace.spot)} onClose={() => setDialog(null)} initialTab="info" />}
    {dialog === 'about' && <Modal title="TourSafe 이용 안내" className="safety-dialog" onClose={() => setDialog(null)}><div className="sm-dialog-body"><span className="sm-about-icon"><ShieldCheck size={32} /></span><h2>낯선 곳에서, 다음 행동까지.</h2><p className="sm-dialog-intro">위치를 확인하고, 필요한 도움을 고른 뒤 연락·길찾기로 이어가세요.</p><div className="sm-about-list"><div><Map size={21} /><p><b>익숙한 투어세이프 지도</b><span>도로·공원·물길은 OpenStreetMap, 관광지는 한국관광공사 정보예요. 건물과 작은 길은 지도 설정에서 펼쳐볼 수 있어요. 실제 이동은 길찾기를 함께 확인해 주세요.</span></p></div><div><LocateFixed size={21} /><p><b>같은 위치에서 도움을 찾아요</b><span>‘내 위치로 찾기’를 누르면 좌표를 서버와 카카오·공공데이터 제공기관에 보내 주변을 조회해요. 마지막으로 확인한 위치이며 이동 중 자동 추적하지 않아요. 장소 검색이나 지도 이동 후 ‘이 위치에서 다시 찾기’로 조회 위치를 바꿀 수 있어요.</span></p></div><div><ShieldCheck size={21} /><p><b>확인할 내용도 함께 알려드려요</b><span>시설은 직선 3km 이내 조회 자료 중 일부예요. 병원은 선택한 위치의 시군구 목록에서 5km 이내의 일부 후보를 보여줘요. 등록시간은 접수 가능 여부가 아니므로 전화 확인이 필요해요. CCTV는 설치자료이고, 화장실은 전국 공공자료의 주소를 좌표로 변환해 표시해요. 실제 입구와 다를 수 있고, 위치를 확인하지 못한 곳은 주소 목록에서 볼 수 있어요. 지역 안전점수와 자동 신고는 제공하지 않아요.</span></p></div></div><button className="sm-primary sm-wide" onClick={() => setDialog(null)}>지도로 돌아가기</button></div></Modal>}
  </div>;
}
