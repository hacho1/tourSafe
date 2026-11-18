import type { Recommendation } from '../../../shared/models';
import { useTravelNeeds } from '../hooks/useTravelNeeds';
import { assess, buildVisitQuestions, needEvidenceLabel, STATUS } from '../utils/suitability';
import { dateLabel, distance, phoneLink } from '../utils/format';
import { Modal } from './Modal';
import { SnapshotNotice } from './OfflineNotice';
import { useConnection } from '../hooks/useConnection';
import { snapshotRecommendation } from '../services/offline';

export function CandidateComparison({ items, scope, onClose, onOpen }: { items: Recommendation[]; scope: string; onClose: () => void; onOpen: (item: Recommendation) => void }) {
  const online = useConnection();
  items = online ? items : items.map(snapshotRecommendation);
  const [needs] = useTravelNeeds();
  const assessments = items.map(item => assess(item, needs));
  const questions = buildVisitQuestions(needs);
  return <Modal title="방문 후보 비교" className="candidate-comparison-dialog" onClose={onClose}>
    <div className="candidate-comparison-scroll">
      <h2>같은 질문으로 후보를 비교해요</h2>
      {items.map(item => item.offlineSnapshotAt && <SnapshotNotice key={item.spot.id} at={item.offlineSnapshotAt} label={item.spot.name} />)}
      <p>{scope}에서 조회된 후보 중 선택한 {items.length}곳이에요. 전체 관광지를 비교한 결과는 아니에요.</p>
      {items.some(item => item.spot.source.kind === 'DEMO_DATA') && <p className="comparison-limit">시연 장소와 자료를 비교하고 있어요. 실제 방문지의 이용 가능 여부를 뜻하지 않아요.</p>}
      <p className="comparison-limit">자료상 확인과 방문일의 실제 이용 가능 여부는 달라요. 필수조건 미충족은 다른 시설로 상쇄하지 않아요.</p>
      <div className="comparison-candidates">{items.map((item,index) => <div key={item.spot.id}><h3>{item.spot.name}</h3><p>{item.offlineSnapshotAt ? '저장 당시 검색 기준 · 현재 이동거리 미확인' : `출발지에서 직선 ${distance(item.spot.distanceMeters)}`}</p><strong>{STATUS[assessments[index]!.status]}</strong>{item.score.hardFilter.length > 0 && <p className="comparison-limit">방문 주의: {item.score.hardFilter.join(' · ')}</p>}<p>{phoneLink(item.spot.phone) ? '등록 연락처 있음 · 상세에서 확인' : '문의 전화번호 미제공'}</p></div>)}</div>
      {!assessments[0]?.results.length && <p className="comparison-limit">선택한 필요조건이 없어 조건별 적합성을 판정하지 않았어요. 필요조건 설정 후 다시 비교할 수 있어요.</p>}
      {assessments[0]?.results.map((result,index) => <section className="comparison-condition" key={result.id} aria-label={result.label}>
        <h3>{result.preference==='required'?'필수':'선호'} · {result.label}</h3>
        <p className="comparison-question">{questions[index+1]?.replace(/^[^:]+:\s*/, '')}</p>
        <div className="comparison-cells">{items.map((item,itemIndex) => {
          const row = assessments[itemIndex]!.results.find(r => r.id === result.id)!;
          return <div key={item.spot.id} className={`comparison-cell state-${row.state}`}><b>{item.spot.name}</b><strong>{needEvidenceLabel(row)}</strong><details><summary>근거 보기</summary><p>{row.explanation}</p><small>{row.source?.name || '출처 미확인'} · {dateLabel(row.updatedAt)}</small>{row.source?.url && <a href={row.source.url} target="_blank" rel="noreferrer">기관 자료 출처 보기 ↗</a>}</details></div>;
        })}</div>
      </section>)}
      <section className="comparison-next"><h3>후보와 확인할 질문을 함께 챙겨요</h3><p>자료상 확인된 시설도 방문일에 이용할 수 있는지 물어보세요. 연락처가 없어도 질문을 저장하거나 복사할 수 있어요.</p>{items.map(item => <button type="button" className="primary" key={item.spot.id} onClick={() => onOpen(item)}>{item.spot.name} 확인 목록 만들기</button>)}</section>
    </div>
  </Modal>;
}
