import { useEffect, useRef, useState } from 'react';
import { appServer, nativeApp, refreshAppServer, updateNativeConnection } from '../services/platform';
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
      const result = await requestAppServer(server, '/api/health', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      const health = await result.json();
      if (controller.signal.aborted) return;
      if (!result.ok || health.ok !== true || !['LIVE', 'DEMO'].includes(health.mode)) throw new Error('TourSafe 서버의 응답을 확인하지 못했어요.');
      localStorage.setItem(APP_SERVER_KEY, server);
      setUrl(server); updateNativeConnection(true); refreshAppServer();
      setMessage('PC 서버에 연결했어요. 여행지·시설 목록을 다시 조회합니다. 저장한 질문·메모는 유지돼요.');
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error && error.message.startsWith('HTTPS') ? error.message : 'PC 서버에 연결하지 못했어요. PC에서 서버를 실행하고 USB 연결 설정 또는 같은 Wi-Fi와 주소를 확인해 주세요. 저장한 준비 카드는 계속 사용할 수 있어요.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <>
    <div className="native-connection-entry"><span>TourSafe 안드로이드 · PC 연결 테스트</span><button type="button" onClick={() => { setMessage(''); setOpen(true); }}>PC 서버 연결</button></div>
    {open && <Modal title="PC 서버 연결" className="safety-dialog" onClose={() => { request.current?.abort(); setBusy(false); setOpen(false); }}>
      <div className="native-connection-body"><h2>실시간 조회를 PC에 연결해요</h2><p>이 설치본은 PC 서버를 이용하는 테스트 앱이에요. 오프라인 준비 카드와 메모는 앱 안에 보관해요.</p>
        <form onSubmit={event => { event.preventDefault(); void connect(); }}><label htmlFor="app-server">PC 서버 주소</label><input id="app-server" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={url} disabled={busy} onChange={event => setUrl(event.target.value)} required />
          <button type="submit" disabled={busy}>{busy ? '연결 확인 중…' : '연결 확인 후 적용'}</button></form>
        <button type="button" disabled={busy} onClick={() => setUrl(USB_SERVER)}>USB 연결 주소 사용</button>
        <p>USB 연결은 PC에서 ‘TourSafe-휴대폰에설치.ps1’을 실행해 주세요. Wi-Fi 연결은 PC의 내부 IP와 서버 포트를 입력해요.</p><p>공개 서버로 바꿀 때는 HTTPS 주소를 사용해 주세요. 앱에는 공공데이터 API 키가 포함되지 않아요.</p>
        {message && <p role="status">{message}</p>}
      </div>
    </Modal>}
  </>;
}
