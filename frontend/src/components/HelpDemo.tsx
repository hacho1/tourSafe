import { useEffect, useRef, useState } from 'react';
import { Check, Languages, RotateCcw, ShieldCheck, Siren, Smartphone } from 'lucide-react';

const CONTACTS = [
  { number: '112', label: '위협·범죄', Icon: ShieldCheck },
  { number: '119', label: '화재·구급', Icon: Siren },
  { number: '1330', label: '여행 안내·통역', Icon: Languages },
] as const;
type Contact = typeof CONTACTS[number];
type Phase = 'gesture' | 'choose' | 'countdown' | 'complete';

/** This rehearsal only changes UI state. It has no phone links or call/navigation effects. */
export function HelpDemo() {
  const [phase, setPhase] = useState<Phase>('gesture');
  const [contact, setContact] = useState<Contact>(CONTACTS[1]);
  const [remaining, setRemaining] = useState(5);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const scroll = heading.current?.closest('.guide-scroll');
    if (scroll) scroll.scrollTop = 0;
    const frame = requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'countdown') return;
    const started = performance.now();
    let active = true;
    function cancelWhenHidden() {
      if (document.visibilityState === 'visible') return;
      active = false;
      setNotice('화면을 벗어나 체험을 취소했어요. 다시 연락할 곳을 고를 수 있어요.');
      setPhase('choose');
    }
    const timer = window.setInterval(() => {
      if (!active) return;
      if (document.visibilityState !== 'visible') { cancelWhenHidden(); return; }
      const next = Math.max(0, 5 - Math.floor((performance.now() - started) / 1000));
      setRemaining(next);
      if (next === 0) { active = false; setPhase('complete'); }
    }, 100);
    document.addEventListener('visibilitychange', cancelWhenHidden);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', cancelWhenHidden);
    };
  }, [phase]);

  function choose(value: Contact) {
    setContact(value);
    setRemaining(5);
    setNotice('');
    setPhase('countdown');
  }
  return <section className="help-demo" aria-label="도움 기능 체험">
    {phase === 'gesture' && <>
      <h2 ref={heading} tabIndex={-1}>도움 화면을 미리 열어볼까요?</h2>
      <p>휴대폰을 가볍게 두 번 흔들어 도움 화면을 여는 과정을 체험해 보세요.</p>
      <div className="demo-gesture"><Smartphone size={62} strokeWidth={1.5} aria-hidden="true" /><span>움직임 센서 없이도 버튼으로 체험할 수 있어요.</span></div>
      <button type="button" className="guide-primary demo-start" onClick={() => setPhase('choose')}>두 번 흔들기 체험</button>
      <p className="guide-note">실제 흔들기는 도움 화면의 ‘흔들어서 도움 열기’에서 직접 켜요. 앱을 보고 있을 때 작동하며, 전화할 곳은 직접 선택해요.</p>
    </>}
    {phase === 'choose' && <>
      <Smartphone className="demo-shaken-phone" size={34} aria-hidden="true" />
      <h2 ref={heading} tabIndex={-1}>도움이 필요하세요?</h2>
      <p>연락할 곳을 고르면 5초 뒤 모의 연결 화면을 보여드려요. 실제로 전화하지 않아요.</p>
      {notice && <p className="guide-note" role="status">{notice}</p>}
      <div className="demo-contact-options">{CONTACTS.map(({ number, label, Icon }) => <button type="button" key={number} aria-label={`${label} ${number} 모의 연결 체험`} onClick={() => choose(CONTACTS.find(value => value.number === number)!)}><Icon size={22} aria-hidden="true" /><span>{label}<b>{number}</b></span><small>체험</small></button>)}</div>
    </>}
    {phase === 'countdown' && <>
      <h2 ref={heading} tabIndex={-1}>{contact.number} 모의 연결 준비</h2>
      <p>{contact.label} 연락을 연습하고 있어요.</p>
      <div className="demo-countdown"><strong role="timer" aria-label={`모의 연결까지 ${remaining}초`}>{remaining}</strong><span>초 뒤 모의 연결 화면으로 이동해요</span></div>
      <p className="guide-note">실제 도움 화면에서는 카운트다운 없이 연락할 번호를 직접 선택해 전화 앱을 열어요.</p>
      <div className="demo-actions"><button type="button" className="guide-secondary" onClick={() => { setNotice('모의 연결을 취소했어요.'); setPhase('choose'); }}>체험 취소</button><button type="button" className="guide-primary" onClick={() => setPhase('complete')}>지금 체험</button></div>
    </>}
    {phase === 'complete' && <>
      <Check size={34} aria-hidden="true" />
      <h2 ref={heading} tabIndex={-1}>{contact.number} 모의 연결 화면</h2>
      <p><strong>실제 전화나 신고는 이루어지지 않았어요.</strong></p>
      <p>실제 도움 화면에서 번호를 선택하면 전화 앱이 열려요. 이 앱에서는 통화나 신고 접수 여부를 확인할 수 없어요.</p>
      <button type="button" className="guide-secondary" onClick={() => { setNotice(''); setPhase('choose'); }}><RotateCcw size={16} aria-hidden="true" />연락할 곳 다시 고르기</button>
    </>}
  </section>;
}
