import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, ShieldCheck } from 'lucide-react';
import { Modal } from './Modal';
import { HelpDemo } from './HelpDemo';

export function FirstVisitPrompt({ onGuide, onSkip }: { onGuide: () => void; onSkip: () => void }) {
  return <section className="first-visit-prompt" aria-labelledby="first-visit-title">
    <div><h2 id="first-visit-title">처음 오셨나요?</h2><p>나에게 맞는 여행지를 찾고, 도움받는 방법을 알아보세요.</p></div>
    <div className="first-visit-actions"><button type="button" className="guide-primary" onClick={onGuide}><BookOpen size={17} aria-hidden="true" />사용법 보기</button><button type="button" className="guide-secondary" onClick={onSkip}>바로 시작</button></div>
  </section>;
}

const STEPS = ['필요조건', '정보 읽기', '도움 체험'];
export function FirstVisitGuide({ onClose, onExplore }: { onClose: () => void; onExplore: () => void }) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
    const frame = requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [step]);
  return <Modal title="TourSafe 사용법" className="visit-guide-dialog" onClose={onClose}>
    <ol className="guide-progress" aria-label="사용법 진행">{STEPS.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    {step === 2 && <p className="demo-boundary"><ShieldCheck size={17} aria-hidden="true" /><strong>체험 모드 · 실제 전화·신고 없음</strong></p>}
    <div ref={scroll} className="guide-scroll">
      {step === 0 && <section aria-labelledby="guide-needs-title">
        <h2 id="guide-needs-title" ref={heading} tabIndex={-1}>필요한 환경부터 골라요</h2>
        <p>‘필요조건 설정’에서 이동과 휴식에 필요한 환경을 골라 주세요.</p>
        <dl className="guide-conditions"><div><dt>계단 없는 출입</dt><dd>반드시 필요</dd></div><div><dt>일반 공중화장실</dt><dd>있으면 좋음</dd></div></dl>
        <p className="guide-note">설정 예시예요. 이 안내에서는 내 조건을 바꾸지 않아요.</p>
        <p><strong>필수조건은 다른 편의시설로 대체하지 않아요.</strong> 조건을 정한 뒤 여행지별 확인 결과를 비교해 보세요.</p>
      </section>}
      {step === 1 && <section aria-labelledby="guide-data-title">
        <h2 id="guide-data-title" ref={heading} tabIndex={-1}>미확인은 ‘없음’과 달라요</h2>
        <p>자료가 없거나 뜻을 명확히 해석하기 어려우면 미확인으로 표시해요.</p>
        <dl className="guide-conditions"><div><dt>자료상 확인</dt><dd>선택한 조건을 자료에서 확인</dd></div><div><dt>원문 있음 · 해석 보류</dt><dd>기관 설명을 직접 확인</dd></div><div><dt>자료 없음</dt><dd>판정할 정보를 받지 못함</dd></div></dl>
        <p>출처와 기관 원문을 함께 읽고, 현재 이용 가능 여부는 방문 전에 확인해 주세요.</p>
        <p className="guide-note">정보 확인율은 자료가 얼마나 확인됐는지를 보여줘요. 데이터 정확도나 안전 확률이 아니에요. 지역의 안전도도 예측하지 않아요.</p>
      </section>}
      {step === 2 && <HelpDemo />}
    </div>
    <footer className="guide-footer">
      <div className="guide-page-actions">{step > 0 ? <button type="button" className="guide-secondary" onClick={() => setStep(step - 1)}>이전</button> : <button type="button" className="guide-secondary" onClick={onClose}>안내 건너뛰기</button>}{step < 2 ? <button type="button" className="guide-primary" onClick={() => setStep(step + 1)}>다음<ArrowRight size={17} aria-hidden="true" /></button> : <button type="button" className="guide-primary" onClick={onExplore}>내 필요조건 설정하기</button>}</div>
      {step === 2 && <button type="button" className="guide-browse" onClick={onClose}>안내 마치기</button>}
    </footer>
  </Modal>;
}
