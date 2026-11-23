import { useEffect, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import type { Region } from '../../../shared/models';
import { HOSPITAL_REGIONS } from '../../../shared/hospitals';
import { searchRegions } from '../services/api';
import { Modal } from './Modal';

export function HelpLocationPicker({ onChoose, onClose, title = '도움받을 위치 선택' }: { onChoose: (region: Region) => void; onClose: () => void; title?: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Region[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  function change(value: string) {
    pending.current?.abort(); setLoading(false); setQuery(value); setResults([]); setMessage('');
  }
  async function search() {
    pending.current?.abort();
    if (query.trim().length < 2) { setMessage('장소 이름을 두 글자 이상 입력해 주세요.'); return; }
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setMessage(''); setResults([]);
    try {
      const data = await searchRegions(query.trim(), controller.signal);
      if (controller.signal.aborted) return;
      setResults(data.preset ? [] : data.regions);
      setMessage(data.preset ? '장소 검색을 연결하지 못했어요. 아래 시작 위치를 선택할 수 있어요.' : data.regions.length ? '' : '찾은 장소가 없어요. 다른 이름으로 검색해 주세요.');
    } catch {
      if (!controller.signal.aborted) setMessage('장소를 불러오지 못했어요. 다시 검색해 주세요.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <Modal title={title} onClose={onClose} className="safety-dialog help-location-dialog centered-dialog">
    <div className="help-location-body">
      <p>숙소나 가까운 역을 검색하거나 시작 위치를 선택해 주세요.</p>
      <form onSubmit={event => { event.preventDefault(); void search(); }}>
        <label className="help-location-search-label" htmlFor="help-place-query">숙소·역·장소 이름</label>
        <input id="help-place-query" value={query} onChange={event => change(event.target.value)} placeholder="예: 해운대역, 제주 시청" maxLength={80} />
        <button type="submit" disabled={loading}><Search size={18} />검색</button>
      </form>
      <div role="status">{loading ? '장소를 찾고 있어요…' : message}</div>
      <div className="help-location-results">{results.map((region, index) => <button key={`${region.lat}:${region.lng}:${index}`} onClick={() => onChoose(region)}><MapPin size={19} /><span><b>{region.name}</b><small>{region.address}</small></span></button>)}</div>
      <p className="help-location-label">시작 위치에서 둘러보기</p>
      <div className="help-preset-list">{HOSPITAL_REGIONS.map(region => <button key={region.id} onClick={() => onChoose({ name: region.originName, address: region.name, lat: region.lat, lng: region.lng })}>{region.originName}</button>)}</div>
    </div>
  </Modal>;
}
