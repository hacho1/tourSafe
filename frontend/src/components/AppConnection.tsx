import { useEffect, useRef, useState } from 'react';
import { appServer, defaultAppServer, nativeApp, refreshAppServer, updateNativeConnection } from '../services/platform';
import { requestAppServer } from '../services/appFetch';
import { APP_SERVER_KEY, normalizeAppServer, USB_SERVER } from '../utils/appServer';
import { Modal } from './Modal';
import '../native-app.css';

export function AppConnection() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(appServer);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  if (!nativeApp) return null;
  async function connect() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage('');
    try {
      const server = normalizeAppServer(url);
      const result = await requestAppServer(server, '/api/health', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]) });
      const health = await result.json();
      if (controller.signal.aborted) return;
      if (!result.ok || health.ok !== true || !['LIVE', 'DEMO'].includes(health.mode)) throw new Error('TripFit 서버의 응답을 확인하지 못했어요.');
      localStorage.setItem(APP_SERVER_KEY, server);
      setUrl(server); updateNativeConnection(true); refreshAppServer();
      setMessage('TripFit 서버에 연결했어요. 여행지·시설 목록을 다시 조회합니다. 저장한 질문·메모는 유지돼요.');
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error && error.message.startsWith('HTTPS') ? error.message : '서버에 연결하지 못했어요. 인터넷 연결과 서버 주소를 확인해 주세요. 저장한 준비 카드는 계속 사용할 수 있어요.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <>
    <div className="native-connection-entry"><span>TripFit 안드로이드</span><button type="button" onClick={() => { setMessage(''); setOpen(true); }}>서버 연결</button></div>
    {open && <Modal title="서버 연결" className="safety-dialog" hideEmergency onClose={() => { request.current?.abort(); setBusy(false); setOpen(false); }}>
      <div className="native-connection-body"><h2>실시간 조회 서버 설정</h2><p>관광지·날씨·시설 정보를 조회할 서버를 설정해요. 오프라인 준비 카드와 메모는 앱 안에 보관해요.</p>
        <form onSubmit={event => { event.preventDefault(); void connect(); }}><label htmlFor="app-server">서버 주소</label><input id="app-server" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={url} disabled={busy} onChange={event => setUrl(event.target.value)} required />
          <button type="submit" disabled={busy}>{busy ? '연결 확인 중…' : '연결 확인 후 적용'}</button></form>
        {defaultAppServer !== USB_SERVER && <button type="button" disabled={busy} onClick={() => setUrl(defaultAppServer)}>기본 서버 주소 사용</button>}
        <button type="button" disabled={busy} onClick={() => setUrl(USB_SERVER)}>USB 연결 주소 사용</button>
        <p>USB 연결은 PC에서 휴대폰 설치 스크립트를 실행해 주세요. Wi-Fi 연결은 PC의 내부 IP와 서버 포트를 입력해요.</p><p>공개 서버로 바꿀 때는 HTTPS 주소를 사용해 주세요. 앱에는 공공데이터 API 키가 포함되지 않아요.</p>
        {message && <p role="status">{message}</p>}
      </div>
    </Modal>}
  </>;
}
