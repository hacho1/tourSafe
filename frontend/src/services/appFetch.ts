import { CapacitorHttp } from '@capacitor/core';
import { appApiUrl } from '../utils/appServer';
import { appServer, connected, nativeApp } from './platform';

export async function requestAppServer(server: string, path: string, init?: RequestInit, transport: typeof CapacitorHttp.request = CapacitorHttp.request): Promise<Response> {
  if (init?.method && init.method.toUpperCase() !== 'GET') throw new Error('앱 서버 연결은 조회 요청만 지원해요.');
  const url = appApiUrl(server, path);
  const signal = init?.signal;
  signal?.throwIfAborted();
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  // Native HTTP avoids WebView CORS and mixed-content restrictions for a local test PC.
  // Cancellation suppresses late results even though the OS request may finish in the background.
  return new Promise<Response>((resolve, reject) => {
    const abort = () => reject(signal?.reason || new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    void transport({ url, method: 'GET', headers: { Accept: 'application/json', ...headers },
      responseType: 'json', connectTimeout: 15000, readTimeout: 90000,
    }).then(result => {
      if (!signal?.aborted) resolve(new Response(JSON.stringify(result.data), { status: result.status, headers: { 'content-type': 'application/json' } }));
    }).catch(reject).finally(() => signal?.removeEventListener('abort', abort));
  });
}

export const appFetch: typeof fetch = (input, init) => {
  if (nativeApp && typeof input === 'string' && input.startsWith('/api/')) {
    if (!connected()) return Promise.reject(new TypeError('OFFLINE'));
    return requestAppServer(appServer(), input, init);
  }
  return fetch(input, init);
};
