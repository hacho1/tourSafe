import { deviceLocation } from '../services/deviceLocation';
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, Check, Copy, LocateFixed, MapPin, ShieldCheck, Siren, Languages, Smartphone } from "lucide-react";
import { Modal } from "./Modal";
import { buildEmergencyMessage, formatEmergencyLocation, isFreshEmergencyLocation, requestEmergencyLocation, type EmergencyLocation } from "../utils/emergency";
import "../emergency-help.css";
import type { useShake } from '../hooks/useShake';

export function EmergencyEntry({ onClick }: { onClick: () => void }) {
  return <button type="button" className="emergency-launch" onClick={onClick} aria-label="도움 열기"><Siren size={17} aria-hidden="true" /><span>도움</span></button>;
}

export function EmergencyHelp({ onClose, shake, onGuide, openedByShake = false }: { onClose: () => void; shake: ReturnType<typeof useShake>; onGuide?: () => void; openedByShake?: boolean }) {
  const [location, setLocation] = useState<EmergencyLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const landmarkInput = useRef<HTMLInputElement>(null);
  const [landmark, setLandmark] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [copying, setCopying] = useState(false);
  const [now, setNow] = useState(Date.now);
  const cancelLocation = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const copyVersion = useRef(0);
  const preview = useRef<HTMLTextAreaElement>(null);
  const fresh = location !== null && isFreshEmergencyLocation(location, now);
  const hasMessage = Boolean(landmark.trim()) || fresh;
  const message = buildEmergencyMessage(landmark, location, now);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; cancelLocation.current?.(); copyVersion.current++; };
  }, []);
  useEffect(() => {
    if (!location) return;
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [location]);

  useEffect(() => { if (manualOpen) landmarkInput.current?.focus({ preventScroll: true }); }, [manualOpen]);
  function clearCopyStatus() { copyVersion.current++; setCopying(false); setCopyStatus(""); }
  function locate() {
    cancelLocation.current?.();
    clearCopyStatus();
    setLocation(null);
    setLocating(true);
    setLocationStatus("위치를 확인하고 있어요. 기다리는 동안에도 전화할 수 있어요.");
    cancelLocation.current = requestEmergencyLocation(
      window.isSecureContext ? deviceLocation() : undefined,
      value => { setLocation(value); setNow(Date.now()); setLocating(false); setLocationStatus(""); clearCopyStatus(); },
      error => { setLocating(false); setLocationStatus(error); setManualOpen(true); },
    );
  }
  function cancelLocating() {
    cancelLocation.current?.();
    setLocating(false);
    setLocationStatus("위치 확인을 취소했어요. 주소나 건물 이름을 직접 적을 수 있어요.");
  }
  async function copyMessage() {
    const clickedAt = Date.now();
    setNow(clickedAt);
    if (location && !isFreshEmergencyLocation(location, clickedAt) && !landmark.trim()) {
      setCopyStatus("이전 위치는 복사하지 않았어요. 위치를 다시 확인하거나 주소를 적어 주세요.");
      return;
    }
    const version = ++copyVersion.current;
    setCopying(true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(buildEmergencyMessage(landmark, location, clickedAt));
      if (alive.current && version === copyVersion.current) setCopyStatus("복사했어요. 필요한 곳에 직접 붙여넣어 주세요.");
    } catch {
      if (alive.current && version === copyVersion.current) {
        setCopyStatus("자동 복사가 안 돼요. 아래 내용을 선택해 직접 복사해 주세요.");
        preview.current?.focus();
        preview.current?.select();
      }
    } finally {
      if (alive.current && version === copyVersion.current) setCopying(false);
    }
  }

  return <Modal title="도움 · 연락하기" className="emergency-dialog quick-help-dialog" onClose={onClose} hideEmergency>
    <div className="emergency-scroll">
      <section className="emergency-call" aria-label="대한민국 도움 연락처">
        <h2>{openedByShake ? '도움이 필요하세요?' : '어디로 연락할까요?'}</h2>
        <p className="emergency-intro">{openedByShake ? '흔들기로 도움 화면을 열었어요. 전화할 곳은 직접 선택해 주세요.' : '위치 확인 없이도 전화 앱을 열 수 있어요.'}</p>
          <div className="emergency-choices">
            <a href="tel:112" aria-label="위협·범죄 112 전화 앱 열기"><ShieldCheck size={22} aria-hidden="true" /><b>위협·범죄</b><strong>112</strong><span>전화 앱 열기 <ArrowUpRight size={14} /></span></a>
            <a href="tel:119" aria-label="화재·구급 119 전화 앱 열기"><Siren size={22} aria-hidden="true" /><b>화재·구급</b><strong>119</strong><span>전화 앱 열기 <ArrowUpRight size={14} /></span></a>
          </div>
        <a href="tel:1330" className="travel-help-contact" aria-label="여행 안내·통역 1330 전화 앱 열기"><Languages size={22} /><span><b>여행 안내·통역</b><small>관광 문의 · 전화 앱 열기</small></span><strong>1330</strong><ArrowUpRight size={17} /></a>
        <p className="quick-help-note">전화 앱이 열리지 않으면 번호를 직접 입력해 주세요.</p>
      </section>

      {onGuide && <button type="button" className="help-guide-entry" onClick={onGuide}><BookOpen size={18} aria-hidden="true" /><span>사용법 · 도움 기능 체험</span><ArrowRight size={17} aria-hidden="true" /></button>}

      <details className="emergency-location">
        <summary><MapPin size={19} aria-hidden="true" /><span>내 위치 확인·전달</span><small>선택</small></summary>
        <p>위치 확인을 기다리지 않고 전화해도 돼요.</p>
        <div className="emergency-location-actions">
          <button type="button" className="emergency-locate" onClick={locate} disabled={locating}><LocateFixed size={17} aria-hidden="true" />{locating ? "위치 확인 중…" : location ? "내 위치 다시 확인" : "내 위치 확인"}</button>
          {locating && <button type="button" className="emergency-text-button" onClick={cancelLocating}>확인 취소</button>}
          {location && <button type="button" className="emergency-text-button" onClick={() => { setLocation(null); setLocationStatus(""); clearCopyStatus(); }}>위치 지우기</button>}
        </div>
        <div role="status" className="emergency-location-status">
          {locationStatus || (fresh && location ? <><Check size={15} aria-hidden="true" /><span>{formatEmergencyLocation(location)}<br />기기 추정 위치예요. 주변 주소·건물 이름도 확인해 주세요.</span></> : location ? "확인한 지 2분이 지나 위치를 다시 확인해야 해요. 이전 좌표는 복사 내용에서 빠져요." : "버튼을 눌러 허용할 때만 기기 위치를 한 번 확인해요.")}
        </div>
        <details className="emergency-manual" open={manualOpen} onToggle={event => setManualOpen(event.currentTarget.open)}><summary>주소·건물 이름 직접 적기</summary>
        <label className="emergency-label" htmlFor="emergency-landmark">주소·건물 이름</label>
        <input ref={landmarkInput} id="emergency-landmark" value={landmark} onChange={event => { setLandmark(event.target.value); clearCopyStatus(); }} placeholder="예: ○○역 2번 출구 앞" maxLength={300} autoComplete="off" />
        </details>
        {hasMessage && <label className="emergency-message">복사할 내용<textarea ref={preview} value={message} readOnly rows={4} spellCheck={false} /></label>}
        <button type="button" className="emergency-copy" onClick={copyMessage} disabled={!hasMessage || copying}><Copy size={17} aria-hidden="true" />{copying ? "복사 중…" : "위치 내용 복사"}</button>
        <p className="emergency-copy-status" role="status">{copyStatus || "위치와 입력한 내용은 자동 전송되지 않아요."}</p>
      </details>

      <details className="help-shake-settings"><summary><Smartphone size={19} /><span>흔들어서 도움 열기</span><small>{shake.enabled ? '켜짐' : '꺼짐'}</small></summary><div className="help-shake-toggle"><p>앱 화면을 보고 있을 때, 가볍게 두 번 흔들면 이 화면을 열어요. 전화는 직접 선택해요.</p><button className={'sm-switch ' + (shake.enabled ? 'on' : '')} role="switch" aria-label="흔들어서 도움 열기" aria-checked={shake.enabled} disabled={shake.pending} onClick={shake.toggle}><span /></button></div><p className="quick-help-note" role="status">{shake.message || '기기와 브라우저가 지원할 때 사용할 수 있어요. 하단 도움 버튼으로도 같은 화면을 열 수 있어요.'}</p></details>

      <details className="emergency-guide">
        <summary>신고할 때 무엇을 말하나요?</summary>
        <ol><li><b>어디인지</b><span>주소, 가까운 건물 이름과 층수처럼 찾을 수 있는 단서를 알려 주세요.</span></li><li><b>무슨 상황인지</b><span>일어난 일과 다친 사람이 있는지, 확인한 내용을 전해 주세요.</span></li><li><b>상담원의 안내 듣기</b><span>질문에 답하고 상황실에서 안내하는 행동을 따라 주세요.</span></li></ol>
        <p>말로 신고하기 어려운 경우에는 휴대폰 문자 앱에서 112 또는 119에 위치와 상황을 직접 적어 보낼 수 있어요.</p>
        <div className="emergency-sources"><a href="https://www.police.go.kr/user/bbs/BD_selectBbs.do?q_bbsCode=1007&q_bbscttSn=20250613093203002" target="_blank" rel="noreferrer">경찰청 신고 안내 ↗</a><a href="https://www.nfa.go.kr/nfa/safetyinfo/emergencyservice/119emergencydeclaration/" target="_blank" rel="noreferrer">소방청 신고 요령 ↗</a><a href="https://www.nfa.go.kr/nfa/news/pressrelease/press/?cntId=1902&mode=view&pageIdx=1&searchCondition=all" target="_blank" rel="noreferrer">소방청 문자 신고 안내 ↗</a></div>
      </details>
      <details className="emergency-privacy"><summary>이용 안내·연락처 출처</summary><p>이 화면의 기기 위치와 입력 내용은 TourSafe 서버에 보내거나 저장하지 않아요. 창을 닫으면 지워지며, 직접 복사한 내용은 기기 클립보드에 남을 수 있어요.</p><p>위치는 버튼을 눌러 새로 확인해요. 지도에서 선택한 여행지 좌표를 내 위치로 사용하지 않아요. 이 화면에서는 통화·신고 접수 여부를 확인할 수 없어요.</p><p>1330은 한국관광공사의 여행 안내·통역 서비스예요. 긴급 출동을 요청할 때는 상황에 맞는112·119를 이용해 주세요.</p><div className="emergency-sources"><a href="https://112.go.kr/" target="_blank" rel="noreferrer">경찰청112</a><a href="https://www.nfa.go.kr/nfa/introduce/organizationidfo/situation/" target="_blank" rel="noreferrer">소방청119</a><a href="https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=140632" target="_blank" rel="noreferrer">한국관광공사1330</a></div></details>
    </div>
  </Modal>;
}
