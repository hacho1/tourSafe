import { useEffect, useState } from 'react';
import { useConnection } from '../hooks/useConnection';
import { offlineShellReady } from '../services/offline';
import { timeLabel } from '../utils/format';
import { nativeApp } from '../services/platform';

export function SnapshotNotice({ at, label = '조회' }: { at?: string; label?: string }) {
  return at ? <p className="offline-snapshot" role="status"><strong>이전에 저장한 {label} 자료</strong> · {timeLabel(at)} 자료 시각<br />현재 운영·개방·접수 여부는 확인하지 못했어요. 길찾기·기관 웹사이트는 인터넷 연결이 필요해요.</p> : null;
}

export function OfflineNotice({ onSaved, onlyOffline = false }: { onSaved: () => void; onlyOffline?: boolean }) {
  const online = useConnection();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const update = () => { void offlineShellReady().then(value => { if (active) setReady(value); }).catch(() => {}); };
    update();
    navigator.serviceWorker?.addEventListener('controllerchange', update);
    return () => { active = false; navigator.serviceWorker?.removeEventListener('controllerchange', update); };
  }, []);
  if (onlyOffline && online) return null;
  return <aside className={`offline-notice ${online ? '' : 'is-offline'}`} aria-label="연결과 오프라인 이용">
    <details>
      <summary>{online ? ready ? '오프라인 이용 준비' : '오프라인 이용 안내' : '오프라인 · 기기에 저장한 자료로 이용 중'}</summary>
      <p>저장한 질문·메모는 인터넷 없이 열고 수정할 수 있어요. 여행 전에 저장한 장소에서 ‘오프라인 자료 준비’를 눌러 주변 화장실·의료기관도 담아 주세요.</p>
      <p>지도 배경, 새 장소 검색, 날씨, 새 도보 경로는 연결이 필요해요. 전화는 통신망이 필요하며 자동으로 연결하지 않아요.</p>
      <p>{nativeApp ? '앱 화면이 설치 파일에 포함돼 있어요. 앱 데이터 삭제·앱 제거 시에는 보관 자료도 지워져요.' : `${ready ? '앱 화면이 이 브라우저에 준비됐어요.' : '앱 화면을 준비하고 있어요. 온라인에서 한 번 연 뒤 이용해 주세요. HTTPS 또는 localhost가 필요해요.'} 브라우저 데이터를 지우거나 기기가 저장 공간을 정리하면 오프라인 자료도 삭제될 수 있어요.`}</p>
      <button type="button" onClick={onSaved}>저장한 준비 카드 열기</button>
    </details>
  </aside>;
}
