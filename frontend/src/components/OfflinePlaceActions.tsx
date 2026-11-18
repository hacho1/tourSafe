import { useEffect, useRef, useState } from 'react';
import type { Recommendation } from '../../../shared/models';
import { findOfflineRecommendation, getOfflinePack, OFFLINE_CHANGED, offlineShellReady, prepareOfflinePlace, removeOfflinePlace, type OfflinePack } from '../services/offline';
import { useConnection } from '../hooks/useConnection';
import { timeLabel } from '../utils/format';

export function OfflinePlaceActions({ id, current, onOpen, onCompare, comparing, comparisonFull }: {
  id: string; current?: Recommendation; onOpen: (item: Recommendation) => void;
  onCompare: (item: Recommendation) => void; comparing: boolean; comparisonFull: boolean;
}) {
  const online = useConnection();
  const [pack, setPack] = useState<OfflinePack | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    const update = () => { void getOfflinePack(id).then(value => { if (active) setPack(value); }).catch(() => { if (active) setMessage('오프라인 자료를 읽지 못했어요. 질문·메모는 아래에서 확인할 수 있어요.'); }); };
    update(); window.addEventListener(OFFLINE_CHANGED, update);
    return () => { active = false; controller.current?.abort(); window.removeEventListener(OFFLINE_CHANGED, update); };
  }, [id]);
  async function prepare() {
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setMessage('');
    try {
      if (!await offlineShellReady()) throw new Error('앱 화면을 먼저 내려받고 있어요. 연결된 상태에서 잠시 후 다시 눌러 주세요. HTTPS 또는 localhost가 필요해요.');
      const item = current || await findOfflineRecommendation(id);
      if (!item) throw new Error('이 장소의 방문 자료가 아직 없어요. 여행지 찾기에서 장소를 다시 조회한 뒤 준비해 주세요. 질문·메모는 그대로 남아 있어요.');
      const result = await prepareOfflinePlace(item, abort.signal);
      if (!abort.signal.aborted) { setPack(result); setMessage('방문 자료와 주변 화장실·의료기관 목록을 이 기기에 준비했어요. 일부 기관의 진료과·시간표는 미확인일 수 있어요.'); }
    } catch (error) {
      if (!abort.signal.aborted) setMessage(error instanceof DOMException && ['QuotaExceededError', 'SecurityError', 'NotAllowedError'].includes(error.name)
        ? '기기 저장 공간이 부족하거나 저장이 차단됐어요. 브라우저 설정·저장 공간을 확인해 주세요. 기존 질문·메모는 유지돼요.'
        : error instanceof TypeError ? '주변 자료를 받거나 저장하지 못했어요. 인터넷 연결과 기기 저장 공간을 확인한 뒤 다시 시도해 주세요.'
        : error instanceof Error ? error.message : '자료를 저장하지 못했어요. 저장 공간과 연결 상태를 확인해 주세요.');
    }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  async function remove() {
    try { await removeOfflinePlace(id); setPack(null); setMessage('이 장소의 내려받은 주변 자료를 지웠어요. 질문·메모는 유지돼요.'); }
    catch { setMessage('오프라인 자료를 지우지 못했어요. 잠시 후 다시 시도해 주세요.'); }
  }
  return <section className="offline-place-actions" aria-label="이 장소 오프라인 이용">
    <strong>{pack ? '오프라인 자료 준비됨' : '여행 전에 오프라인 자료 준비'}</strong>
    <p>{pack ? `${timeLabel(pack.preparedAt)} 내려받음 · 방문 자료와 저장 위치 주변 화장실·의료기관 목록` : '질문·메모는 이미 기기에 저장돼요. 아래 버튼으로 방문 자료와 주변 시설 목록도 미리 담을 수 있어요.'}</p>
    <p>지도 배경·사진·날씨는 포함하지 않아요. 현재 이용 가능 여부는 별도 확인이 필요해요.</p>
    <button type="button" disabled={!online || busy || current?.spot.source.kind === 'DEMO_DATA'} onClick={() => { void prepare(); }}>{busy ? '주변 자료를 준비하는 중…' : pack ? '오프라인 자료 다시 받기' : '오프라인 자료 준비'}</button>
    {busy && <button type="button" onClick={() => { controller.current?.abort(); setBusy(false); setMessage('준비를 취소했어요. 기존 자료와 질문·메모는 유지돼요.'); }}>준비 취소</button>}
    {pack && <><button type="button" onClick={() => onOpen(pack.item)}>보관한 방문 자료 보기</button><button type="button" aria-pressed={comparing} disabled={comparisonFull && !comparing} onClick={() => onCompare(pack.item)}>{comparing ? '비교에서 빼기' : '보관한 후보 비교에 담기'}</button><button type="button" disabled={busy} onClick={() => { void remove(); }}>내려받은 자료 삭제</button></>}
    {!online && !pack && <p>이 장소의 주변 자료를 미리 받지 않았어요. 아래 질문·메모는 인터넷 없이 사용할 수 있어요.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
