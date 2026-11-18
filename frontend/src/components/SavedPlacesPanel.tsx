import { useSavedPlaces } from '../hooks/useSavedPlaces';
import { mapLink } from '../utils/format';
import { phoneLink } from '../utils/format';
import type { Recommendation } from '../../../shared/models';
import { useEffect, useRef, useState } from 'react';
import type { SavedPlaceIdentity } from '../utils/savedPlaces';
import { VisitPlanEditor } from './VisitPlanEditor';
import type { NearbyHelpAction } from '../utils/nearbyHelp';
import { dateLabel } from '../utils/format';
import { OfflinePlaceActions } from './OfflinePlaceActions';
import { CandidateComparison } from './CandidateComparison';
import { SpotDetail } from '../pages/SpotDetail';
import { useConnection } from '../hooks/useConnection';
import { appFetch } from '../services/appFetch';

export function SavedPlacesPanel({ current, openPlanRequest, onNearbyHelp, active = true }: { current: Recommendation[]; openPlanRequest?: { placeId: string; requestId: number } | null; onNearbyHelp: NearbyHelpAction; active?: boolean }) {
  const saved = useSavedPlaces();
  const online = useConnection();
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const [comparison, setComparison] = useState<Recommendation[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  useEffect(() => { if (!active) { setSelected(null); setComparisonOpen(false); } }, [active]);
  function compare(item: Recommendation) {
    setComparison(rows => rows.some(row => row.spot.id === item.spot.id) ? rows.filter(row => row.spot.id !== item.spot.id) : rows.length < 2 ? [...rows, item] : rows);
  }
  const [pending, setPending] = useState('');
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const handledRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!openPlanRequest || handledRequest.current === openPlanRequest.requestId) return;
    const entry = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-saved-place]') || []).find(element => element.dataset.savedPlace === openPlanRequest.placeId);
    const disclosure = entry?.querySelector<HTMLDetailsElement>('.saved-visit-plan');
    if (!entry || !disclosure) return;
    disclosure.open = true;
    const frame = requestAnimationFrame(() => {
      handledRequest.current = openPlanRequest.requestId;
      entry.scrollIntoView({ block: 'start' });
      entry.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [openPlanRequest, saved.ids, saved.places, current]);
  useEffect(() => () => request.current?.abort(), []);
  async function refreshPlace(id: string) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPending(id); setMessage('');
    try {
      const response = await appFetch(`/api/tourist-spots/${encodeURIComponent(id)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), cache:'no-store' });
      if (!response.ok) throw new Error();
      const place = await response.json() as SavedPlaceIdentity;
      if (place.id !== id) throw new Error();
      if (!controller.signal.aborted) {
        const refreshed = saved.toggle(place, 'refresh');
        setMessage(refreshed ? '이름·주소·연락처를 다시 확인했어요. 운영·접수 여부는 현장에 확인해 주세요.' : '불러온 이름·주소를 저장하지 못했어요. 저장한 정보는 그대로 남아 있어요. 저장소 설정을 확인한 뒤 다시 시도해 주세요.');
      }
    } catch { if (!controller.signal.aborted) setMessage('최신 정보를 확인하지 못했어요. 저장한 정보는 그대로 남아 있어요.'); }
    finally { if (!controller.signal.aborted) setPending(''); }
  }
  return <div className="saved-place-list" ref={listRef}>
    <p className="nearby-range">검색 위치와 관계없이 저장한 장소를 모두 보여요. 저장 당시의 이름·주소이며 운영시간·접수 상태는 다시 확인해 주세요.</p>
    {message && <p className="nearby-range" role="status">{message}</p>}
    {saved.error && <p className="nearby-range" role="alert">{saved.error}</p>}
    {!saved.ids.length && <p>마음에 드는 장소의 하트를 눌러 저장해 보세요.</p>}
    {comparison.length > 0 && <div className="offline-place-actions" aria-label="보관한 후보 비교"><p>{comparison.map(item => item.spot.name).join(' · ')} · {comparison.length}/2</p><button type="button" disabled={comparison.length !== 2} onClick={() => setComparisonOpen(true)}>보관한 두 후보 비교</button><button type="button" onClick={() => setComparison([])}>비교 후보 비우기</button></div>}
    {saved.ids.map(id => {
      const place = saved.places?.[id] || current.find(item => item.spot.id === id)?.spot;
      return <article key={id} className="saved-place-entry" data-saved-place={id}>
        <h3 tabIndex={-1}>{place?.name || '이전 버전에서 저장한 장소'}</h3>
        {place ? <><p>{place.address || '주소 미제공'}</p><small>{saved.places?.[id] ? `${dateLabel(saved.places[id]!.savedAt)} 저장` : '이번 조회에서 확인한 정보'} · {place.source.name}</small>
          {place.source.kind !== 'DEMO_DATA' && <div><a href={mapLink(place.name, place)} target="_blank" rel="noreferrer">길찾기 ↗</a>{phoneLink(place.phone) && <a href={phoneLink(place.phone)!}>전화 문의</a>}</div>}
        </> : <p>이전 저장에는 장소 번호만 남아 있어요. 이름·주소를 불러와 확인해 주세요.</p>}
        {/^[0-9]{1,16}$/.test(id) && <button type="button" onClick={() => refreshPlace(id)} disabled={!online || Boolean(pending)}>{pending === id ? '확인 중…' : place ? '최신 이름·주소 확인' : '이름·주소 불러오기'}</button>}
        <button type="button" onClick={() => saved.toggle(id)} aria-label={`${place?.name || '이전 장소'} 저장 취소`}>저장 취소</button>
        <OfflinePlaceActions id={id} current={current.find(item => item.spot.id === id)} onOpen={setSelected} onCompare={compare} comparing={comparison.some(item => item.spot.id === id)} comparisonFull={comparison.length === 2} />
        <div className="saved-nearby-actions" role="group" aria-label={`${place?.name || '이전 저장 장소'} 주변 도움 찾기`}>
          <p>{place ? '저장한 방문지의 자료 좌표를 기준으로 찾아요. 내 현재 위치와는 달라요.' : '이전 저장에는 좌표가 없어요. 도움을 찾을 기준 장소를 직접 선택해 주세요.'}</p>
          <button type="button" disabled={place?.source.kind === 'DEMO_DATA'} onClick={() => onNearbyHelp(place || null, 'TOILET')}>주변 화장실</button>
          <button type="button" disabled={place?.source.kind === 'DEMO_DATA'} onClick={() => onNearbyHelp(place || null, 'MEDICAL')}>주변 의료기관</button>
          {place?.source.kind === 'DEMO_DATA' && <p>시연 장소에서는 실제 주변 시설을 조회하지 않아요.</p>}
        </div>
        {place && <details className="saved-visit-plan"><summary>가족 여행 준비 카드 · 확인 목록</summary><p className="visit-plan-help">저장한 질문과 개인 메모예요. 시설·날씨·현재 운영 여부를 저장하거나 새로 조회한 결과는 아니에요.</p><VisitPlanEditor place={place} /></details>}
      </article>;
    })}
    {selected && <SpotDetail item={selected} saved={saved.ids.includes(selected.spot.id)} onSave={() => saved.toggle(selected.spot)} onClose={() => setSelected(null)} />}
    {comparisonOpen && comparison.length === 2 && <CandidateComparison items={comparison} scope="이 기기에 보관한 방문 자료" onClose={() => setComparisonOpen(false)} onOpen={item => { setComparisonOpen(false); setSelected(item); }} />}
  </div>;
}
