import type { Recommendation } from '../../../shared/models';
import { useTravelNeeds } from '../hooks/useTravelNeeds';
import { assess, needEvidenceLabel } from '../utils/suitability';
import { dateLabel, distance } from '../utils/format';
import { Modal } from './Modal';
import { useConnection } from '../hooks/useConnection';
import { snapshotRecommendation } from '../services/offline';
import { TravelNeedsSettings } from './TravelNeeds';

export function CandidateComparison({ items, scope, onClose, onOpen }: { items: Recommendation[]; scope: string; onClose: () => void; onOpen: (item: Recommendation) => void }) {
  const online = useConnection();
  const [needs] = useTravelNeeds();
  const candidates = (online ? items : items.map(snapshotRecommendation)).map(item => ({ item, assessment: assess(item, needs) }));
  const rows = candidates[0]?.assessment.results || [];
  const offline = candidates.some(({ item }) => item.offlineSnapshotAt);
  const demo = candidates.some(({ item }) => item.spot.source.kind === 'DEMO_DATA');
  return <Modal title="방문 후보 비교" className="candidate-comparison-dialog centered-dialog" onClose={onClose}>
    <div className="candidate-comparison-scroll">
      <div className="compare-scope"><p>{scope}{offline ? ' · 저장 자료' : ''}{demo ? ' · 시연' : ''}</p></div>
      <div className="compare-table" role="table" aria-label="여행지별 필요조건">
        <div className="compare-head" role="row">
          <span role="columnheader">필요조건</span>
          {candidates.map(({ item }) => <div role="columnheader" key={item.spot.id}>
            <strong>{item.spot.name}</strong>
            <small>{item.offlineSnapshotAt ? `${dateLabel(item.offlineSnapshotAt)} 보관` : `직선 ${distance(item.spot.distanceMeters)}`}</small>
          </div>)}
        </div>
        {rows.map(row => <div className="compare-row" role="row" key={row.id}>
          <span role="rowheader">{row.label}{row.preference === 'preferred' && <small>선호</small>}</span>
          {candidates.map(({ item, assessment }) => {
            const result = assessment.results.find(entry => entry.id === row.id)!;
            const label = result.state === 'met' ? '확인됨' : result.state === 'unmet' ? '미충족' : '미확인';
            return <div role="cell" key={item.spot.id}>
              <details className="compare-evidence">
                <summary className={`compare-status state-${result.state}`}>{label}</summary>
                <p>{needEvidenceLabel(result)} · {result.explanation}</p>
                <small>{result.source?.name || '출처 미확인'} · {dateLabel(result.updatedAt)}</small>
                {result.source?.url && <a href={result.source.url} target="_blank" rel="noreferrer">원문 보기</a>}
              </details>
            </div>;
          })}
        </div>)}
      </div>
      {!rows.length && <div className="compare-empty"><p>필요조건을 선택하면 두 장소를 비교할 수 있어요.</p><TravelNeedsSettings /></div>}
      {rows.length > 0 && <p className="compare-note">결과를 누르면 출처를 볼 수 있어요. 실제 이용 가능 여부는 방문 전에 확인해 주세요.</p>}
      <div className="compare-actions">
        {candidates.map(({ item }) => <button type="button" className="secondary" key={item.spot.id} onClick={() => onOpen(item)}>{item.spot.name} 준비하기</button>)}
      </div>
    </div>
  </Modal>;
}
