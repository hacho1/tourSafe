import type { TouristSpot } from '../../../shared/models';
import { SAFETY_LABEL } from '../config/constants';
import { dateLabel, evidenceLabel, sourceLabel } from '../utils/format';
import './visit-facility-info.css';

export function VisitFacilityInfo({ spot, showFacts = true }: { spot: TouristSpot; showFacts?: boolean }) {
  const facts = Object.entries(spot.safety).filter(([, value]) => value.status !== 'UNKNOWN');
  const details = spot.visitDetails || [];
  if ((!showFacts || !facts.length) && !details.length) return null;
  return <section className="detail-section visit-facility-info" aria-label="관광지 편의·접근성 자료">
    <h3>등록된 편의·접근성 정보</h3>
    <p className="small muted">관광지에 연결된 기관 자료예요. 현재 이용 가능 여부와 이동 동선 전체를 확인한 정보는 아니에요.</p>
    {showFacts && facts.length > 0 && <div className="evidence-grid">
      {facts.map(([key, value]) => <div key={key} className={`evidence-item ${value.status.toLowerCase()}`}>
        <div><span>{SAFETY_LABEL[key as keyof typeof SAFETY_LABEL]}</span><b>{evidenceLabel(value)}</b></div>
        <small>{sourceLabel(value.source)} · {dateLabel(value.updatedAt)}</small>
      </div>)}
    </div>}
    {details.length > 0 && <details className="visit-source-details">
      <summary>접근로·시설 상세 안내 {details.length}개 보기</summary>
      <dl className="visit-details-list">{details.map(item => <div key={item.id}>
        <dt>{item.label}</dt><dd>{item.text}</dd>
        <dd className="visit-detail-source">{item.source.url ? <a href={item.source.url} target="_blank" rel="noreferrer">{item.source.name}</a> : item.source.name} · {dateLabel(item.updatedAt)}</dd>
      </div>)}</dl>
      <p className="small muted">유모차 대여와 유모차 이동 가능 여부는 달라요. 출처별 내용이 다르면 해당 항목은 미확인으로 표시해요.</p>
    </details>}
  </section>;
}
