import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { APP_BACKGROUNDED } from '../services/platform';

const DURATION_MS = 10_000;

export function MockReportCountdown({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<'countdown' | 'complete' | 'canceled'>('countdown');
  const [seconds, setSeconds] = useState(DURATION_MS / 1000);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'countdown') return;
    const end = performance.now() + DURATION_MS;
    function cancel() {
      setPhase(current => current === 'countdown' ? 'canceled' : current);
    }
    function onVisibility() {
      if (document.visibilityState !== 'visible') cancel();
    }
    const clock = window.setInterval(() => setSeconds(Math.max(1, Math.ceil((end - performance.now()) / 1000))), 200);
    const deadline = window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        setPhase(current => current === 'countdown' ? 'complete' : current);
      } else cancel();
    }, DURATION_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', cancel);
    window.addEventListener(APP_BACKGROUNDED, cancel);
    onVisibility();
    return () => {
      clearInterval(clock);
      clearTimeout(deadline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', cancel);
      window.removeEventListener(APP_BACKGROUNDED, cancel);
    };
  }, [phase]);

  return <section className="mock-report-content">
    {phase === 'countdown' ? <>
      <h2 ref={title} tabIndex={-1}>모의신고까지</h2>
      <div className="mock-report-time" role="timer" aria-live="off"><strong>{seconds}</strong><span>초</span></div>
      <p className="mock-report-note">연습 모드예요. 실제 신고는 접수되지 않아요.</p>
      <button type="button" className="secondary" onClick={onClose}>모의신고 취소</button>
    </> : <>
      {phase === 'complete' ? <Check size={30} aria-hidden="true" /> : <AlertCircle size={30} aria-hidden="true" />}
      <h2 ref={title} tabIndex={-1}>{phase === 'complete' ? '모의신고 완료' : '모의신고를 취소했어요'}</h2>
      <p>{phase === 'complete' ? '연습을 마쳤어요. 실제 신고는 접수되지 않았어요.' : '앱 화면을 벗어나 카운트다운을 종료했어요.'}</p>
      <button type="button" className="primary" onClick={onClose}>확인</button>
    </>}
  </section>;
}
