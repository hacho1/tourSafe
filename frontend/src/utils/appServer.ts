export const APP_SERVER_KEY = 'toursafe:app-server:v1';
export const APP_SERVER_CHANGED = 'toursafe-app-server-change';
export const USB_SERVER = 'http://127.0.0.1:8787';

/** Test HTTP is limited to loopback/private LAN; public servers require HTTPS. */
export function normalizeAppServer(input: string): string {
  const url = new URL(input.trim());
  const host = url.hostname;
  const parts = host.split('.').map(Number);
  const ipv4 = parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255);
  const local = host === 'localhost' || host === '[::1]' || (ipv4 && (parts[0] === 127 || parts[0] === 10 ||
    parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31));
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password ||
    url.search || url.hash || url.pathname !== '/') throw new Error('HTTPS 서버 주소 또는 PC의 내부 IP와 포트만 입력해 주세요. 예: http://192.168.0.10:8787');
  return url.origin;
}

export function appApiUrl(server: string, path: string): string {
  if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('잘못된 앱 조회 경로예요.');
  const base = normalizeAppServer(server);
  const url = new URL(path, base);
  if (url.origin !== base || !url.pathname.startsWith('/api/')) throw new Error('잘못된 앱 조회 경로예요.');
  return url.href;
}
