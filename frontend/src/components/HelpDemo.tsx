import { useState } from 'react';
import { MockReportCountdown } from './MockReportCountdown';

export function HelpDemo() {
  const [started, setStarted] = useState(false);
  return <section className="help-demo" aria-label="모의신고 연습">
    {started
      ? <MockReportCountdown onClose={() => setStarted(false)} />
      : <>
        <h2>모의신고 연습</h2>
        <p>두 번 흔들면 10초 카운트다운이 시작돼요. 여기서는 버튼으로 같은 과정을 체험할 수 있어요.</p>
        <button type="button" className="guide-primary" onClick={() => setStarted(true)}>모의신고 시작</button>
      </>}
  </section>;
}
