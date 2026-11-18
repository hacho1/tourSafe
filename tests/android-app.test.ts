import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appApiUrl, normalizeAppServer, USB_SERVER } from '../frontend/src/utils/appServer.js';
import { requestAppServer } from '../frontend/src/services/appFetch.js';
import { nativeDeviceLocation } from '../frontend/src/services/deviceLocation.js';

test('Android test connections allow USB/private LAN HTTP and public HTTPS', () => {
  for (const value of [USB_SERVER, 'http://localhost:8787', 'http://10.0.2.2:8787', 'http://192.168.1.5:8787', 'http://172.16.0.1:8787', 'https://api.example.com']) {
    assert.equal(normalizeAppServer(value), value);
  }
});
test('server settings reject public cleartext, embedded credentials, paths, query secrets and executable URLs', () => {
  for (const value of ['http://example.com', 'http://172.32.0.1', 'https://user:password@example.com', 'https://api.example.com/private', 'https://api.example.com/?key=secret', 'https://api.example.com/#hash', 'javascript:alert(1)', 'file:///tmp']) {
    assert.throws(() => normalizeAppServer(value));
  }
});
test('native API paths cannot escape the chosen server or the API route', () => {
  assert.equal(appApiUrl(USB_SERVER, '/api/recommendations?lat=37.5&lng=127'), USB_SERVER + '/api/recommendations?lat=37.5&lng=127');
  for (const path of ['//evil.example/api/health', 'https://evil.example/api/health', '/api/../../private', '/api/%2e%2e/secret']) assert.throws(() => appApiUrl(USB_SERVER, path));
});
test('native transport keeps HTTP failure status and does not silently return success', async () => {
  const response = await requestAppServer(USB_SERVER, '/api/health', {}, async options => {
    assert.equal(options.url, USB_SERVER + '/api/health');
    return { status: 503, data: { message: 'unavailable' }, headers: {}, url: options.url };
  });
  assert.equal(response.ok, false); assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: 'unavailable' });
});
test('native lookup cancellation rejects immediately and ignores a late OS response', async () => {
  const controller = new AbortController();
  let finish!: (value: { status: number; data: object; headers: object; url: string }) => void;
  const response = requestAppServer(USB_SERVER, '/api/health', { signal: controller.signal }, async () => new Promise(resolve => { finish = resolve; }));
  controller.abort(); await assert.rejects(response, { name: 'AbortError' });
  finish({ status: 200, data: { ok: true }, headers: {}, url: USB_SERVER });
});
test('an already cancelled native lookup makes no OS request', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(requestAppServer(USB_SERVER, '/api/health', { signal: controller.signal }, async () => { calls++; throw new Error(); }), { name: 'AbortError' });
  assert.equal(calls, 0);
});
test('Android APK embeds the UI and requests foreground location only, without call permission', () => {
  const config = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(config.webDir, 'frontend/dist-android'); assert.equal(config.server.url, undefined);
  const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.ok(manifest.includes('ACCESS_COARSE_LOCATION')); assert.ok(manifest.includes('ACCESS_FINE_LOCATION'));
  assert.ok(manifest.includes('android:usesCleartextTraffic="false"'));
  assert.equal(manifest.includes('ACCESS_BACKGROUND_LOCATION'), false); assert.equal(manifest.includes('CALL_PHONE'), false);
});

test('denying location with a remaining coarse prompt does not open a second native permission dialog', async () => {
  let prompts = 0, positions = 0;
  const geo = nativeDeviceLocation({
    async checkPermissions() { return { location: 'prompt', coarseLocation: 'prompt' }; },
    async requestPermissions() { prompts++; return { location: 'denied', coarseLocation: 'prompt-with-rationale' }; },
    async getCurrentPosition() { positions++; throw new Error('must not ask again'); },
  });
  const failure = await new Promise<GeolocationPositionError>(resolve => geo.getCurrentPosition(() => assert.fail('denied position returned'), resolve));
  assert.equal(failure.code, 1); assert.equal(prompts, 1); assert.equal(positions, 0);
});

test('an approximate-location grant is usable without requesting precise location again', async () => {
  let prompts = 0;
  const geo = nativeDeviceLocation({
    async checkPermissions() { return { location: 'denied', coarseLocation: 'granted' }; },
    async requestPermissions() { prompts++; throw new Error('should not request precise location'); },
    async getCurrentPosition(options) {
      assert.equal(options?.enableHighAccuracy, false);
      return { timestamp: Date.now(), coords: { latitude: 37.5, longitude: 127, accuracy: 1000, altitudeAccuracy: null, altitude: null, speed: null, heading: null } };
    },
  });
  const position = await new Promise<GeolocationPosition>((resolve, reject) => geo.getCurrentPosition(resolve, reject));
  assert.equal(position.coords.accuracy, 1000); assert.equal(prompts, 0);
});
