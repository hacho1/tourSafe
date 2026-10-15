import { useSavedPlaces } from '../hooks/useSavedPlaces';
import { mapLink } from '../utils/format';
import { phoneLink } from '../utils/format';
import type { Recommendation } from '../../../shared/models';
import { useEffect, useRef, useState } from 'react';
import type { SavedPlaceIdentity } from '../utils/savedPlaces';

export function SavedPlacesPanel({ current }: { current: Recommendation[] }) {
  const saved = useSavedPlaces();
  const [pending, setPending] = useState('');
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function refreshPlace(id: string) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPending(id); setMessage('');
    try {
      const response = await fetch(`/api/tourist-spots/${encodeURIComponent(id)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), cache:'no-store' });
      if (!response.ok) throw new Error();
      const place = await response.json() as SavedPlaceIdentity;
      if (place.id !== id) throw new Error();
      if (!controller.signal.aborted) { saved.toggle(place, 'refresh'); setMessage('이름·주소·연락처를 다시 확인했어요. 운영·접수 여부는 현장에 확인해 주세요.'); }
    } catch { if (!controller.signal.aborted) setMessage('최신 정보를 확인하지 못했어요. 저장한 정보는 그대로 남아 있어요.'); }
    finally { if (!controller.signal.aborted) setPending(''); }
  }
  return <div className="saved-place-list">
    <p className="nearby-range">검색 위치와 관계없이 저장한 장소를 모두 보여요. 저장 당시의 이름·주소이며 운영시간·접수 상태는 다시 확인해 주세요.</p>
    {message && <p className="nearby-range" role="status">{message}</p>}
    {!saved.ids.length && <p>마음에 드는 장소의 하트를 눌러 저장해 보세요.</p>}
    {saved.ids.map(id => {
      const place = saved.places?.[id] || current.find(item => item.spot.id === id)?.spot;
      return <article key={id} className="saved-place-entry">
        <h3>{place?.name || '이전 버전에서 저장한 장소'}</h3>
        {place ? <><p>{place.address || '주소 미제공'}</p><small>{saved.places?.[id] ? `${saved.places[id]!.savedAt.slice(0,10)} 저장` : '이번 조회에서 확인한 정보'} · {place.source.name}</small>
          {place.source.kind !== 'DEMO_DATA' && <div><a href={mapLink(place.name, place)} target="_blank" rel="noreferrer">길찾기 ↗</a>{phoneLink(place.phone) && <a href={phoneLink(place.phone)!}>전화 문의</a>}</div>}
        </> : <p>이전 저장에는 장소 번호만 남아 있어요. 이름·주소를 불러와 확인해 주세요.</p>}
        {/^[0-9]{1,16}$/.test(id) && <button onClick={() => refreshPlace(id)} disabled={Boolean(pending)}>{pending === id ? '확인 중…' : place ? '최신 이름·주소 확인' : '이름·주소 불러오기'}</button>}
        <button onClick={() => saved.toggle(id)} aria-label={`${place?.name || '이전 장소'} 저장 취소`}>저장 취소</button>
      </article>;
    })}
  </div>;
}
