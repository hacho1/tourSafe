import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VISIT_PLANS_KEY, readVisitPlans, writeVisitPlan, removeVisitPlan,
  type PlanStorage, type VisitPlan,
} from '../frontend/src/utils/visitPlans';
import {
  createSavedPlacesStore, SAVED_PLACES_KEY, SAVED_PLACES_PLAN_REMOVE_ERROR,
  SAVED_PLACES_REMOVE_ERROR,
} from '../frontend/src/utils/savedPlaces';

class MemoryStorage implements PlanStorage {
  values = new Map<string, string>();
  writes: { key: string; value: string }[] = [];
  failReadKey = '';
  failWriteKey = '';
  getItem(key: string) {
    if (key === this.failReadKey) throw new Error('SecurityError');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (key === this.failWriteKey) throw new Error('QuotaExceededError');
    this.writes.push({ key, value });
    this.values.set(key, value);
  }
}

const plan = (placeId = 'museum'): VisitPlan => ({
  placeId,
  savedAt: '2026-10-29T10:00:00.000Z',
  preferences: { stepFree: 'required', strollerAccess: 'required', nursing: 'preferred' },
  questions: ['주출입구부터 전시실까지 유모차로 이동할 수 있나요?'],
  note: '방문 전 운영기관에 확인하기',
});

function seed(storage: MemoryStorage, plans: Record<string, VisitPlan>) {
  storage.values.set(VISIT_PLANS_KEY, JSON.stringify({ version: 1, plans }));
}

test('방문 계획은 새로고침 후 조건·질문·메모를 복원하고 별도 키만 사용한다', () => {
  const storage = new MemoryStorage();
  storage.values.set(SAVED_PLACES_KEY, '["legacy"]');
  assert.deepEqual(readVisitPlans(storage), {});
  assert.equal(storage.writes.length, 0);
  const original = plan();
  writeVisitPlan(storage, original);
  assert.deepEqual(readVisitPlans(storage), { museum: original });
  assert.deepEqual(JSON.parse(storage.getItem(VISIT_PLANS_KEY)!), { version: 1, plans: { museum: original } });
  assert.equal(storage.getItem(SAVED_PLACES_KEY), '["legacy"]');
  assert.deepEqual(storage.writes.map(write => write.key), [VISIT_PLANS_KEY]);
  original.questions[0] = '호출자가 바꾼 질문';
  assert.notEqual(readVisitPlans(storage).museum.questions[0], original.questions[0]);
});

test('쓰기 직전 다시 읽어 다른 후보와 다른 탭의 최신 변경을 보존한다', () => {
  const storage = new MemoryStorage();
  writeVisitPlan(storage, plan('first'));
  readVisitPlans(storage);
  const latest = { ...plan('other-tab'), note: '다른 탭에서 저장한 메모' };
  seed(storage, { first: plan('first'), 'other-tab': latest });
  const update = { ...plan('first'), note: '수정한 메모' };
  writeVisitPlan(storage, update);
  assert.deepEqual(readVisitPlans(storage), { first: update, 'other-tab': latest });
});

test('다른 후보를 유지하며 삭제하고 sidecar 또는 해당 ID가 없으면 쓰지 않는다', () => {
  const storage = new MemoryStorage();
  removeVisitPlan(storage, 'missing');
  assert.equal(storage.writes.length, 0);
  seed(storage, { museum: plan(), other: plan('other') });
  removeVisitPlan(storage, 'missing');
  assert.equal(storage.writes.length, 0);
  removeVisitPlan(storage, 'museum');
  assert.deepEqual(readVisitPlans(storage), { other: plan('other') });
  removeVisitPlan(storage, 'other');
  assert.deepEqual(readVisitPlans(storage), {});
  assert.equal(storage.writes.length, 2);
});

test('최대 100곳에서 기존 계획 수정은 가능하고 101번째 추가는 기존 값을 보존하며 실패한다', () => {
  const storage = new MemoryStorage();
  const plans = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`place-${index}`, plan(`place-${index}`)]));
  seed(storage, plans);
  writeVisitPlan(storage, { ...plan('place-0'), note: '수정 가능' });
  const raw = storage.getItem(VISIT_PLANS_KEY);
  assert.throws(() => writeVisitPlan(storage, plan('overflow')), /limit/);
  assert.equal(storage.getItem(VISIT_PLANS_KEY), raw);
  assert.equal(storage.writes.length, 1);
  seed(storage, { ...plans, overflow: plan('overflow') });
  assert.throws(() => readVisitPlans(storage));
});

test('손상된 기존 데이터는 읽기·쓰기·삭제에서 예외를 내고 덮어쓰지 않는다', () => {
  const malformed = [
    '', '{', 'null', '[]', '{}', '{"version":2,"plans":{}}', '{"version":1,"plans":[]}',
    JSON.stringify({ version: 1, plans: { museum: plan('different-id') } }),
    JSON.stringify({ version: 1, plans: { museum: { ...plan(), assessment: 'met' } } }),
  ];
  for (const raw of malformed) {
    const storage = new MemoryStorage();
    storage.values.set(VISIT_PLANS_KEY, raw);
    assert.throws(() => readVisitPlans(storage), raw);
    assert.throws(() => writeVisitPlan(storage, plan('new')), raw);
    assert.throws(() => removeVisitPlan(storage, 'museum'), raw);
    assert.equal(storage.getItem(VISIT_PLANS_KEY), raw);
    assert.equal(storage.writes.length, 0);
  }
});

test('잘못된 날짜·ID·조건·질문·메모·추가 정보는 저장 전에 거절한다', () => {
  const invalid: unknown[] = [
    { ...plan(), placeId: '' }, { ...plan(), placeId: ' museum ' },
    ...['날짜 오류', '2026-02-30T10:00:00Z', '2026-10-29', '2026-10-29T24:00:00Z'].map(savedAt => ({ ...plan(), savedAt })),
    { ...plan(), preferences: { unknown: 'required' } },
    { ...plan(), preferences: { stepFree: 'yes' } },
    { ...plan(), preferences: [] },
    { ...plan(), questions: [] }, { ...plan(), questions: Array(21).fill('질문') },
    { ...plan(), questions: ['   '] }, { ...plan(), questions: ['질'.repeat(301)] },
    { ...plan(), questions: [null] }, { ...plan(), questions: Array(1) },
    { ...plan(), note: '글'.repeat(2001) }, { ...plan(), note: null },
    ...['lat', 'lng', 'source', 'openingHours', 'assessment'].map(key => ({ ...plan(), [key]: '저장 금지' })),
  ];
  const storage = new MemoryStorage();
  seed(storage, { existing: plan('existing') });
  const raw = storage.getItem(VISIT_PLANS_KEY);
  for (const value of invalid) {
    assert.throws(() => writeVisitPlan(storage, value as VisitPlan));
    assert.equal(storage.getItem(VISIT_PLANS_KEY), raw);
  }
  assert.equal(storage.writes.length, 0);
  for (const savedAt of ['2024-02-29T10:00:00Z', '2026-10-29T19:00:00+09:00']) {
    writeVisitPlan(storage, { ...plan(), savedAt, preferences: {}, questions: Array(20).fill('질'.repeat(300)), note: '글'.repeat(2000) });
    assert.equal(readVisitPlans(storage).museum.savedAt, savedAt);
  }
});

test('저장소 읽기와 쓰기 실패는 호출자에게 전달하고 기존 값은 보존한다', () => {
  const storage = new MemoryStorage();
  seed(storage, { museum: plan() });
  const raw = storage.getItem(VISIT_PLANS_KEY);
  storage.failReadKey = VISIT_PLANS_KEY;
  assert.throws(() => readVisitPlans(storage), /SecurityError/);
  assert.throws(() => writeVisitPlan(storage, plan('new')), /SecurityError/);
  assert.throws(() => removeVisitPlan(storage, 'museum'), /SecurityError/);
  storage.failReadKey = '';
  storage.failWriteKey = VISIT_PLANS_KEY;
  assert.throws(() => writeVisitPlan(storage, plan('new')), /QuotaExceededError/);
  assert.throws(() => removeVisitPlan(storage, 'museum'), /QuotaExceededError/);
  assert.equal(storage.getItem(VISIT_PLANS_KEY), raw);
  assert.equal(storage.writes.length, 0);
});

test('프로토타입 오염 키와 상속받은 객체는 거절한다', () => {
  const storage = new MemoryStorage();
  for (const id of ['__proto__', 'constructor', 'prototype']) {
    assert.throws(() => writeVisitPlan(storage, plan(id)));
    assert.throws(() => removeVisitPlan(storage, id));
    storage.values.set(VISIT_PLANS_KEY, JSON.stringify({ version: 1, plans: { [id]: plan(id) } }));
    assert.throws(() => readVisitPlans(storage));
  }
  storage.values.delete(VISIT_PLANS_KEY);
  const poisoned = JSON.parse('{"stepFree":"required","__proto__":{"polluted":true}}');
  assert.throws(() => writeVisitPlan(storage, { ...plan(), preferences: poisoned }));
  assert.throws(() => writeVisitPlan(storage, Object.assign(Object.create({ polluted: true }), plan())));
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  assert.equal(storage.writes.length, 0);
});

test('legacy 또는 손상된 장소 저장 값은 방문 계획 저장만으로 변경되지 않는다', () => {
  for (const raw of ['["legacy"]', '{broken']) {
    const storage = new MemoryStorage();
    storage.values.set(SAVED_PLACES_KEY, raw);
    writeVisitPlan(storage, plan());
    removeVisitPlan(storage, 'museum');
    assert.equal(storage.getItem(SAVED_PLACES_KEY), raw);
  }
});

test('장소 삭제 성공 시 질문을 정리하고 legacy 형식과 성공 반환을 유지한다', () => {
  const storage = new MemoryStorage();
  storage.values.set(SAVED_PLACES_KEY, '["museum","other"]');
  seed(storage, { museum: plan(), other: plan('other') });
  const store = createSavedPlacesStore(() => storage);
  assert.equal(store.toggle('museum'), true);
  assert.deepEqual(store.getSnapshot(), { ids: ['other'], error: '' });
  assert.equal(storage.getItem(SAVED_PLACES_KEY), '["other"]');
  assert.deepEqual(readVisitPlans(storage), { other: plan('other') });
  assert.deepEqual(storage.writes.map(write => write.key), [SAVED_PLACES_KEY, VISIT_PLANS_KEY]);
  assert.equal(store.toggle('new'), true);
  assert.equal(store.toggle(''), false);
  assert.equal(store.toggle('not-saved', 'refresh'), false);
});

test('질문 삭제 실패 시 삭제된 장소를 반영하고 부분 실패를 분명히 알린다', () => {
  for (const failure of ['read', 'write', 'malformed']) {
    const storage = new MemoryStorage();
    storage.values.set(SAVED_PLACES_KEY, '["museum"]');
    seed(storage, { museum: plan() });
    if (failure === 'read') storage.failReadKey = VISIT_PLANS_KEY;
    if (failure === 'write') storage.failWriteKey = VISIT_PLANS_KEY;
    if (failure === 'malformed') storage.values.set(VISIT_PLANS_KEY, '{broken');
    const retained = storage.values.get(VISIT_PLANS_KEY);
    const store = createSavedPlacesStore(() => storage);
    const seen: string[][] = [];
    store.subscribe(() => seen.push([...store.getSnapshot().ids]));
    assert.equal(store.toggle('museum'), false);
    assert.deepEqual(store.getSnapshot(), { ids: [], error: SAVED_PLACES_PLAN_REMOVE_ERROR });
    assert.deepEqual(seen, [[]]);
    assert.equal(storage.getItem(SAVED_PLACES_KEY), '[]');
    assert.equal(storage.values.get(VISIT_PLANS_KEY), retained);
  }
});

test('장소 삭제 자체가 실패하면 질문 삭제를 시도하지 않는다', () => {
  const storage = new MemoryStorage();
  storage.values.set(SAVED_PLACES_KEY, '["museum"]');
  seed(storage, { museum: plan() });
  storage.failWriteKey = SAVED_PLACES_KEY;
  const store = createSavedPlacesStore(() => storage);
  assert.equal(store.toggle('museum'), false);
  assert.deepEqual(store.getSnapshot(), { ids: ['museum'], error: SAVED_PLACES_REMOVE_ERROR });
  assert.deepEqual(readVisitPlans(storage), { museum: plan() });
  assert.equal(storage.writes.length, 0);
});

test('저장 한도 때문에 빠진 후보의 질문도 정리한다', () => {
  const storage = new MemoryStorage();
  const ids = Array.from({ length: 100 }, (_, index) => `place-${index}`);
  storage.values.set(SAVED_PLACES_KEY, JSON.stringify(ids));
  seed(storage, { 'place-0': plan('place-0'), 'place-1': plan('place-1') });
  const store = createSavedPlacesStore(() => storage);
  assert.equal(store.toggle('new'), true);
  assert.deepEqual(store.getSnapshot().ids, [...ids.slice(1), 'new']);
  assert.deepEqual(readVisitPlans(storage), { 'place-1': plan('place-1') });
});

test('기존 방문 계획을 읽고 체크한 항목과 메모를 함께 다시 저장한다', () => {
  const storage = new MemoryStorage();
  const previous = plan();
  seed(storage, { [previous.placeId]: previous });
  assert.deepEqual(readVisitPlans(storage)[previous.placeId], previous);
  const changed = { ...previous, checkedQuestions: [previous.questions[0]!] };
  writeVisitPlan(storage, changed);
  assert.deepEqual(readVisitPlans(storage)[previous.placeId], changed);
  assert.throws(() => writeVisitPlan(storage, { ...changed, checkedQuestions: ['목록에 없는 항목'] }));
});
