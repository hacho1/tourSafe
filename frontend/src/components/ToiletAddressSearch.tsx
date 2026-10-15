import { useEffect, useRef, useState } from 'react';
import type { PublicFacilityRecord } from '../../../shared/mapFacilities';

interface Results { total: number; items: PublicFacilityRecord[]; nextOffset: number | null }
export function ToiletAddressSearch() {
  const [query, setQuery] = useState(''), [applied, setApplied] = useState('');
  const [data, setData] = useState<Results | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search(text: string, offset = 0) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); if (!offset) { setData(null); setApplied(text); }
    try {
      const response = await fetch(`/api/toilet-addresses?${new URLSearchParams({q:text,offset:String(offset)})}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw new Error();
      const result = await response.json() as Results;
      if (!controller.signal.aborted) setData(previous => ({ ...result, items: offset ? [...(previous?.items || []), ...result.items] : result.items }));
    } catch { if (!controller.signal.aborted) setError('주소 자료를 불러오지 못했어요. 다시 검색해 주세요.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <details className="nearby-address-only"><summary>전국 위치 미확인 주소 검색</summary>
    <p className="nearby-range">지역을 분류하지 못한 자료도 이름·주소로 찾을 수 있어요. 좌표와 거리는 미확인이에요.</p>
    <form onSubmit={event => { event.preventDefault(); if(query.trim().length >= 2) void search(query.trim()); }}>
      <label htmlFor="toilet-address-query">화장실 이름·주소</label>
      <input id="toilet-address-query" value={query} onChange={e=>setQuery(e.target.value)} minLength={2} maxLength={80} required />
      <button className="nearby-show-more" disabled={busy}>{busy ? '검색 중…' : '주소 검색'}</button>
    </form>
    {error && <p role="alert" className="nearby-range">{error}</p>}
    {data && <><p className="nearby-range" role="status">‘{applied}’ 검색 자료 {data.total}곳 · {data.items.length}곳 표시</p>{data.items.map(item => <article className="nearby-address" key={item.id}><h3>{item.name}</h3><p>{item.address || '주소 미제공'}</p><small>등록 개방시간: {item.openingHours || '미제공'} · 현재 이용 가능 여부 미확인</small></article>)}{data.nextOffset !== null && <button className="nearby-show-more" disabled={busy} onClick={()=>search(applied,data.nextOffset!)}>주소 30곳 더 보기</button>}</>}
  </details>;
}
