import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facilityDistanceLabel, isAddressReference } from '../frontend/src/utils/facilityLocation';
import { savedHelpOrigin } from '../frontend/src/utils/nearbyHelp';
import { helpLocationContext } from '../frontend/src/utils/helpLocation';
import { appendVisitQuestions } from '../frontend/src/utils/visitQuestionDraft';
import { appendConfirmationNote } from '../frontend/src/utils/visitConfirmationNote';
import { dateLabel } from '../frontend/src/utils/format';
import type { SavedPlaceIdentity } from '../frontend/src/utils/savedPlaces';

const place: SavedPlaceIdentity & { savedAt: string } = {
  id: '3442142', name: '서울숲 곤충식물원', address: '성동구 뚝섬로 273', phone: null,
  lat: 37.5431247707, lng: 127.0418131384,
  source: { kind: 'PUBLIC_DATA', name: '한국관광공사', url: null }, savedAt: '2026-11-03T15:30:00Z',
};

test('주소 변환 좌표는 6m와 292m 모두 주 표시에서 입구 거리처럼 보이지 않는다', () => {
  for (const distanceMeters of [6, 292]) {
    const facility = { distanceMeters, addressLocation: { precision: 'ADDRESS' as const } };
    assert.equal(facilityDistanceLabel(facility), '주소 참고 위치 · 실제 입구 미확인');
    assert.equal(facility.distanceMeters, distanceMeters, '상세 근거의 계산값은 유지한다');
  }
  assert.equal(isAddressReference({ distanceMeters: 6, locationNote: '주소 기준 위치 · 실제 입구와 다를 수 있어요.' }), true);
});

test('주소 변환 아닌 거리와 거리 미확인은 각각 유지하고 0으로 대체하지 않는다', () => {
  assert.equal(facilityDistanceLabel({ distanceMeters: 1900 }), '직선 1.9km');
  assert.equal(facilityDistanceLabel({ distanceMeters: NaN }), '거리 미확인');
  assert.equal(facilityDistanceLabel({ distanceMeters: -1 }), '거리 미확인');
});

test('저장→도움은 이름 재검색 없이 저장 좌표·출처를 그대로 전달한다', () => {
  const before = JSON.stringify(place);
  const origin = savedHelpOrigin(place)!;
  assert.deepEqual(origin, { lat: place.lat, lng: place.lng, name: place.name, address: place.address,
    kind: 'saved', sourceName: place.source.name, savedAt: place.savedAt });
  assert.equal(helpLocationContext(origin), '저장한 방문지 기준');
  assert.notEqual(origin.lat, 37.5414277019142, '동명 장소 검색점으로 바꾸지 않는다');
  assert.equal(JSON.stringify(place), before);
});

test('예전 ID만 저장·잘못된 좌표·시연 자료는 기본 위치로 대체하지 않고 선택을 요청한다', () => {
  assert.equal(savedHelpOrigin(null), null);
  for (const bad of [{ ...place, lat: NaN }, { ...place, lat: 40 }, { ...place, lng: 0 }, { ...place, name: '' },
    { ...place, source: { ...place.source, kind: 'DEMO_DATA' as const } }]) assert.equal(savedHelpOrigin(bad), null);
});

test('항목 하나의 질문 연결은 직접 쓴 질문·다른 질문·빈 줄을 보존하고 중복을 추가하지 않는다', () => {
  const draft = '직접 수정한 질문\n\n직접 추가한 질문';
  const added = appendVisitQuestions(draft, ['선택한 항목 확인 질문']);
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(added.text, draft + '\n선택한 항목 확인 질문');
  assert.equal(appendVisitQuestions(added.text, ['선택한 항목 확인 질문']).ok, true);
  const again = appendVisitQuestions(added.text, ['선택한 항목 확인 질문']);
  if (again.ok) { assert.equal(again.text, added.text); assert.equal(again.added, 0); }
  const full = Array.from({ length: 20 }, (_, i) => `개인 질문 ${i}`).join('\n');
  assert.deepEqual(appendVisitQuestions(full, ['선택한 항목 확인 질문']), { ok: false, total: 21 });
});

test('개인 확인 양식은 기존 메모를 보존하고 빈 양식을 반복해서 붙이지 않는다', () => {
  const original = '먼저 작성한 개인 메모';
  const added = appendConfirmationNote(original, '2026. 11. 04.');
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.ok(added.text.startsWith(original + '\n\n'));
  assert.ok(added.text.includes('확인일: 2026. 11. 04.'));
  assert.ok(added.text.includes('확인 방법:'));
  assert.deepEqual(appendConfirmationNote(added.text, '2026. 11. 04.'), { ok: true, text: added.text, added: false });
  assert.deepEqual(appendConfirmationNote('메'.repeat(2000), '2026. 11. 04.'), { ok: false });
});

test('장소와 개인 확인의 저장 날짜는 같은 한국 시간 기준을 사용한다', () => {
  assert.match(dateLabel(place.savedAt), /2026.*11.*04/);
});
