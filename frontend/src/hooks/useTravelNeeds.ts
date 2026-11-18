import { useEffect, useState } from 'react';
import { NEEDS, type Preferences } from '../utils/suitability';
const key = 'toursafe.travel-needs.v1';
const event = 'toursafe-needs-change';
let temporary: Preferences | null = null;
let storageWarning = '';
function read(): Preferences {
  if (temporary) return temporary;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      storageWarning = '저장된 조건을 읽지 못했어요. 설정을 다시 확인해 주세요.';
      return {};
    }
    storageWarning = '';
    return Object.fromEntries(NEEDS.flatMap(([id]) => raw[id] === 'required' || raw[id] === 'preferred' ? [[id, raw[id]]] : []));
  } catch { storageWarning = '저장된 조건을 읽지 못했어요. 설정을 다시 확인해 주세요.'; return {}; }
}
export function useTravelNeeds() {
  const [needs,setNeeds] = useState<Preferences>(read);
  const [warning, setWarning] = useState(storageWarning);
  useEffect(() => { const refresh=()=>{ setNeeds(read()); setWarning(storageWarning); }; window.addEventListener(event,refresh); window.addEventListener('storage',refresh); return () => {window.removeEventListener(event,refresh); window.removeEventListener('storage',refresh);}; }, []);
  const update = (next: Preferences) => { try { localStorage.setItem(key,JSON.stringify(next)); temporary=null; storageWarning=''; } catch { temporary=next; storageWarning='기기에 저장하지 못했어요. 이 화면을 닫거나 새로고침하면 설정이 사라질 수 있어요.'; } window.dispatchEvent(new Event(event)); };
  return [needs, update, warning] as const;
}
