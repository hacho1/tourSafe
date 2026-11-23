import { useState } from 'react';
import type { Recommendation } from '../../../shared/models';
import { NEEDS, STATUS, assess, needEvidenceLabel, type Preferences } from '../utils/suitability';
import { useTravelNeeds } from '../hooks/useTravelNeeds';
import { dateLabel } from '../utils/format';
import { Modal } from './Modal';
import './travel-needs.css';
export function TravelNeedsDialog({ onClose, onApply }: { onClose: () => void; onApply?: () => void }) {
  const [needs,setNeeds,storageWarning]=useTravelNeeds();
  const count = Object.keys(needs).length;
  return <Modal title="여행에 필요한 조건" onClose={onClose} className="needs-dialog"><div className="needs-settings">
      <p>여행에 필요한 항목을 체크해 주세요.</p>
      {storageWarning && <p className="needs-storage-warning" role="status">{storageWarning}</p>}
      {(['이동 접근성','편의·휴식','정보 및 지원'] as const).map(group=><fieldset key={group}><legend>{group}</legend>{NEEDS.filter(n=>n[2]===group).map(([id,label])=><label className="needs-row" key={id}>
        <input type="checkbox" checked={Boolean(needs[id])} onChange={event => {
          const next: Preferences = { ...needs };
          if (event.target.checked) next[id] = needs[id] || 'required';
          else delete next[id];
          setNeeds(next);
        }} />
        <span>{label}</span>{needs[id] === 'preferred' && <small>선호</small>}
      </label>)}</fieldset>)}
    </div><footer className="needs-settings-footer"><p>{count}개 선택</p><button type="button" className="primary" onClick={onApply || onClose}>{onApply ? count ? '이 조건으로 후보 보기' : '조건 없이 후보 보기' : '확인'}</button></footer></Modal>;
}
export function TravelNeedsSettings() {
  const [open,setOpen]=useState(false); const [needs]=useTravelNeeds();
  return <><button type="button" className="secondary needs-button" onClick={()=>setOpen(true)}>필요조건 설정 ({Object.keys(needs).length})</button>{open && <TravelNeedsDialog onClose={()=>setOpen(false)} />}</>;
}
export function Suitability({ item, compact=false, id }: { item: Recommendation; compact?: boolean; id?: string }) {
 const [needs]=useTravelNeeds(); const result=assess(item,needs);
 const required = result.results.filter(r=>r.preference==='required');
 const priority = {unmet:0,unknown:1,met:2};
 const rows = compact ? [...result.results].sort((a,b)=>Number(b.preference==='required')-Number(a.preference==='required') || priority[a.state]-priority[b.state]).slice(0,2) : result.results;
 return <section id={id} className={`suitability ${compact ? 'compact' : ''}`} aria-label="개인별 필요조건 판정">{compact && <b className="needs-box-title">필요조건 확인</b>}<strong>{STATUS[result.status]}</strong>
  {result.status==='unset' && <p>{result.results.length ? '저장된 선호조건을 보여드려요.' : '조건을 설정하면 장소별로 확인할 수 있어요.'}</p>}
  {required.length>0 && <p className="needs-summary">필수 {required.length}개 중 자료상 확인 {required.filter(r=>r.state==='met').length}개 · 자료 미확인 {required.filter(r=>r.state==='unknown').length}개{required.some(r=>r.state==='unmet') ? ' · 미충족 자료 있음' : ''}</p>}
  {rows.length>0 && <ul>{rows.map(r=><li key={r.id}><b>{r.preference==='required'?'필수':'선호'} · {r.label}: {needEvidenceLabel(r)}</b>{!compact && <><p>{r.explanation}</p><small>출처: {r.source?.name || '미확인'} · 자료 기준일: {dateLabel(r.updatedAt)}</small></>}</li>)}</ul>}
  {compact && result.results.length>rows.length && <small>조건 {result.results.length}개 중 {rows.length}개 표시</small>}
  {!compact && <p className="needs-current-limit">자료상 확인은 현재 이용 가능 보장이 아니에요. 방문일의 운영·출입 여부와 실제 이용 동선을 확인해 주세요.</p>}
 </section>;
}
