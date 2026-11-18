import { useId, useRef, useState } from 'react';
import { Baby, CloudSun, Hospital, MapPin, Phone, Toilet } from 'lucide-react';
import type { Evidence, Recommendation } from '../../../shared/models';
import { useTravelNeeds } from '../hooks/useTravelNeeds';
import { assess, needEvidenceLabel, STATUS } from '../utils/suitability';
import { dateLabel, mapLink, phoneLink, sourceLabel, timeLabel } from '../utils/format';
import { facilityDistanceLabel, isAddressReference } from '../utils/facilityLocation';
import { FacilityLocationEvidence } from './FacilityLocationEvidence';
import { TravelNeedsSettings } from './TravelNeeds';
import { VisitPlanEditor, type VisitQuestionRequest } from './VisitPlanEditor';

function WeatherValue({ label, evidence, unit = '' }: { label: string; evidence: Evidence<string | number>; unit?: string }) {
  const available = evidence.status === 'CONFIRMED' && evidence.value !== null;
  return <div><dt>{label}</dt><dd>{available ? `${evidence.value}${unit}` : '자료 미확인'}<small>{sourceLabel(evidence.source)} · {timeLabel(evidence.updatedAt)}</small></dd></div>;
}

export function FamilyPreparationCard({ item, formId, onOpenSaved, onSelectFacility }: {
  item: Recommendation;
  formId: string;
  onOpenSaved?: (placeId: string) => void;
  onSelectFacility: (id: string) => void;
}) {
  const [needs] = useTravelNeeds();
  const assessment = assess(item, needs);
  const headingId = useId();
  const supportHeading = useRef<HTMLHeadingElement>(null);
  const [questionRequest, setQuestionRequest] = useState<VisitQuestionRequest | null>(null);
  const questionSequence = useRef(0);
  const requiredChecks = assessment.results.filter(result => result.preference === 'required' && result.state !== 'met');
  const demo = item.spot.source.kind === 'DEMO_DATA';
  return <section className="family-preparation" aria-labelledby={headingId}>
    <h3 id={headingId} tabIndex={-1}><Baby size={23} aria-hidden="true" />가족 여행 준비 카드</h3>
    <p className="family-intro">{item.spot.name}에 가기 전, 필요한 환경과 물어볼 질문을 챙겨요. 여행 중에는 주변 도움 정보를 확인할 수 있어요.</p>
    <button type="button" className="family-support-jump" onClick={() => { supportHeading.current?.scrollIntoView({ block: 'start' }); supportHeading.current?.focus({ preventScroll: true }); }}>주변 화장실·의료·날씨 보기</button>
    {demo && <p className="family-limit">가상 장소와 시설·날씨를 이용한 시연 카드예요. 실제 방문 정보가 아니에요.</p>}
    {requiredChecks.length > 0 && <div className="family-required-checks"><strong>방문 전에 확인할 필수 항목</strong><p>{requiredChecks.map(result => `${result.label}: ${needEvidenceLabel(result)}`).join(' · ')}</p><p>아래 항목의 ‘확인 질문·메모 작성’에서 물어볼 내용을 챙겨요.</p></div>}

    <section className="family-card-section" aria-label="우리 가족에게 필요한 것">
      <div className="family-section-heading"><h4>우리 가족에게 필요한 것</h4><TravelNeedsSettings /></div>
      <p>유모차 이동, 화장실, 수유·휴식 등 필요한 조건을 골라 주세요. 기존의 모든 접근성 조건도 선택할 수 있어요.</p>
      {!assessment.results.length ? <p className="family-empty">아직 선택한 조건이 없어요. 필요조건을 설정하면 이 장소의 자료와 확인할 질문을 함께 볼 수 있어요.</p> : <ul className="family-needs-list">{assessment.results.map(result => <li key={result.id}><span>{result.preference === 'required' ? '필수' : '선호'}</span>{result.label}</li>)}</ul>}
    </section>

    <section className="family-card-section" aria-label="알고 갈 것과 물어볼 질문">
      <h4>알고 갈 것 · 물어볼 질문</h4>
      <p><strong>{STATUS[assessment.status]}</strong></p>
      <p>자료상 확인은 방문일의 이용 가능 보장이 아니에요. 자료가 없다는 것은 시설이 없다는 뜻이 아니에요.</p>
      {assessment.results.length > 0 && <ul className="family-evidence-list">{assessment.results.map(result => <li key={result.id}>
        <div className="family-evidence-label"><b>{result.label}</b><strong className={result.state === 'unmet' ? 'family-unmet' : ''}>{needEvidenceLabel(result)}</strong></div>
        <details><summary>{result.label} 근거 보기</summary><p>{result.explanation}</p><small>{result.source?.name || '출처 미확인'} · {dateLabel(result.updatedAt)}</small>{result.source?.url && <a href={result.source.url} target="_blank" rel="noreferrer">기관 자료 출처 보기 ↗</a>}</details>
        {result.state !== 'met' && <button type="button" className="family-question-link" aria-label={`${result.label} 확인 질문·메모 작성`} onClick={() => setQuestionRequest({ requestId: ++questionSequence.current, need: result.id, preference: result.preference })}>확인 질문·메모 작성</button>}
      </li>)}</ul>}
      {item.score.hardFilter.length > 0 && <div className="family-limit" role="note"><strong>방문 전에 주의할 내용</strong><p>{item.score.hardFilter.join(' · ')}</p></div>}
      <p className="family-limit">필수조건 미충족은 다른 편의시설로 상쇄하지 않아요. 현장 동선과 운영·출입 여부를 방문 전에 확인해 주세요.</p>
      <VisitPlanEditor place={item.spot} formId={formId} onOpenSaved={onOpenSaved} questionRequest={questionRequest} />
    </section>

    <section className="family-card-section family-support" aria-label="필요할 때 찾을 도움">
      <h4 ref={supportHeading} tabIndex={-1}>필요할 때 찾을 도움</h4>
      <p>아래는 <strong>방문지 기준</strong> 조회 자료예요. 내 현재 위치와 다르며, 거리는 직선거리예요.</p>
      {(['TOILET', 'MEDICAL'] as const).map(type => {
        const facility = item.facilities.filter(row => row.type === type).sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
        const Icon = type === 'TOILET' ? Toilet : Hospital;
        const label = type === 'TOILET' ? '화장실이 필요할 때' : '의료기관을 찾아야 할 때';
        const call = facility && !demo && facility.source.kind !== 'DEMO_DATA' ? phoneLink(facility.phone) : null;
        return <div className="family-support-row" key={type}>
          <h5><Icon size={19} aria-hidden="true" />{label}</h5>
          {facility ? <><b>{facility.name}</b><p>{facilityDistanceLabel(facility)} · {isAddressReference(facility) ? '조회된 시설 후보' : '방문지 자료 좌표 기준 · 조회 자료 중 가까운 후보'}</p><small>{sourceLabel(facility.source)} · {dateLabel(facility.updatedAt)}</small><FacilityLocationEvidence facility={facility} origin={`${item.spot.name}의 방문지 자료 좌표`} /><p>{type === 'TOILET' ? '관광지 내부 화장실과 구분해요. 실제 입구와 개방 여부를 확인해 주세요.' : '현재 진료·접수·응급환자 수용 여부는 미확인이에요.'}</p><div className="family-support-actions"><button type="button" onClick={() => onSelectFacility(facility.id)}><MapPin size={16} aria-hidden="true" />{demo ? '예시 위치 보기' : '상세 위치 보기'}</button>{!demo && facility.source.kind !== 'DEMO_DATA' && <a href={mapLink(facility.name, facility)} target="_blank" rel="noreferrer">길찾기 ↗</a>}{call && <a href={call}><Phone size={16} aria-hidden="true" />전화로 확인</a>}</div>{!call && <p className="family-small">{demo || facility.source.kind === 'DEMO_DATA' ? '시연 자료에서는 전화 연결을 제공하지 않아요.' : '문의 전화번호 미제공 또는 형식 미확인'}</p>}</> : <p className="family-empty">이번 조회에서 {type === 'TOILET' ? '주변 화장실' : '주변 의료시설'} 자료를 확인하지 못했어요. 실제로 주변에 없다는 뜻은 아니에요.</p>}
        </div>;
      })}
      <div className="family-support-row family-weather">
        <h5><CloudSun size={19} aria-hidden="true" />날씨가 달라졌을 때</h5>
        <p>기상특보는 자동 확인하지 않아요. 관측·예보와 함께 출발 전 특보·현장 출입통제를 별도로 확인해 주세요.</p>
        <details><summary>방문지 관측·예보와 출처 보기</summary><dl>
          <WeatherValue label="날씨" evidence={item.weather.condition} />
          <WeatherValue label="기온" evidence={item.weather.temperature} unit="°C" />
          <WeatherValue label="시간당 강수" evidence={item.weather.precipitation} unit=" mm" />
          <WeatherValue label="풍속" evidence={item.weather.windSpeed} unit=" m/s" />
          <WeatherValue label="예보 강수확률" evidence={item.weather.precipitationProbability} unit="%" />
        </dl></details>
      </div>
      <p className="family-small">긴급 연락처와 내 위치 확인은 화면의 ‘도움’에서 열 수 있어요. 저장하는 내용은 질문과 개인 메모이며, 위 시설·날씨 자료를 저장하지 않아요.</p>
    </section>
  </section>;
}
