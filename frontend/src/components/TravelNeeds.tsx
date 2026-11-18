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
      <p>나이나 건강 상태 대신 필요한 환경을 골라 주세요. 설정은 이 기기에 저장하며 서버로 보내지 않아요.</p>
      {storageWarning && <p className="needs-storage-warning" role="status">{storageWarning}</p>}
      <p>자료에 적힌 내용과 현재 이용 가능 여부는 달라요. 필수조건은 다른 편의시설로 대체하지 않아요.</p>
      {(['이동 접근성','편의·휴식','정보 및 지원'] as const).map(group=><fieldset key={group}><legend>{group}</legend>{NEEDS.filter(n=>n[2]===group).map(([id,label])=><label className="needs-row" key={id}><span>{label}</span><select aria-label={`${label} 선택`} value={needs[id] || ''} onChange={e=>{const next: Preferences={...needs}; const value=e.target.value; if (value==='required'||value==='preferred') next[id]=value; else delete next[id]; setNeeds(next);}}><option value="">선택 안 함</option><option value="required">반드시 필요</option><option value="preferred">있으면 좋음</option></select></label>)}</fieldset>)}
    </div><footer className="needs-settings-footer"><p>{count ? `${count}개 조건을 후보 비교에 적용해요.` : '조건을 선택하지 않으면 적합성을 판정하지 않고 후보를 보여드려요.'}</p><button type="button" className="primary" onClick={onApply || onClose}>{onApply ? count ? '이 조건으로 후보 보기' : '조건 없이 후보 보기' : '확인'}</button></footer></Modal>;
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
 return <section id={id} className={`suitability ${compact ? 'compact' : ''}`} aria-label="개인별 필요조건 판정"><strong>{STATUS[result.status]}</strong>
  {result.status==='unset' && <p>필수조건을 선택하지 않아 적합성을 판정하지 않았어요.</p>}
  {required.length>0 && <p className="needs-summary">필수 {required.length}개 중 자료상 확인 {required.filter(r=>r.state==='met').length}개 · 자료 미확인 {required.filter(r=>r.state==='unknown').length}개{required.some(r=>r.state==='unmet') ? ' · 미충족 자료 있음' : ''}</p>}
  {rows.length>0 && <ul>{rows.map(r=><li key={r.id}><b>{r.preference==='required'?'필수':'선호'} · {r.label}: {needEvidenceLabel(r)}</b>{!compact && <><p>{r.explanation}</p><small>출처: {r.source?.name || '미확인'} · 자료 기준일: {dateLabel(r.updatedAt)}</small></>}</li>)}</ul>}
  {compact && result.results.length>rows.length && <small>나머지 {result.results.length-rows.length}개 조건과 근거는 상세에서 확인해요.</small>}
  {compact && <small className="needs-current-note">현재 이용·운영은 방문 전에 확인해요.</small>}
  {!compact && <p className="needs-current-limit">자료상 확인은 현재 이용 가능 보장이 아니에요. 방문일의 운영·출입 여부와 실제 이용 동선을 확인해 주세요.</p>}
 </section>;
}
