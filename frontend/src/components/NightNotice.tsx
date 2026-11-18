import { useEffect, useState } from 'react';
import { Moon, X } from 'lucide-react';
import { guidanceStorage, koreanNightKey, NIGHT_DISMISSED_KEY, readGuidanceValue, saveGuidanceValue } from '../utils/visitGuidance';

export function NightNotice() {
  const [night, setNight] = useState(() => koreanNightKey(new Date()));
  const [dismissed, setDismissed] = useState(() => readGuidanceValue(guidanceStorage('sessionStorage'), NIGHT_DISMISSED_KEY));
  useEffect(() => {
    const refresh = () => setNight(koreanNightKey(new Date()));
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  if (!night || night === dismissed) return null;
  return <aside className="night-notice" aria-labelledby="night-notice-title">
    <Moon size={20} aria-hidden="true" />
    <div><h2 id="night-notice-title">지금은 야간이에요</h2><p>이동 전 방문지의 출입 가능 시간과 귀가 교통편을 확인해 주세요.</p><small>한국 시간 기준 · 시간대 안내이며 지역 위험도 판단은 아니에요.</small></div>
    <button type="button" aria-label="야간 안내 닫기" onClick={() => {
      setDismissed(night);
      saveGuidanceValue(guidanceStorage('sessionStorage'), NIGHT_DISMISSED_KEY, night);
    }}><X size={19} aria-hidden="true" /></button>
  </aside>;
}
