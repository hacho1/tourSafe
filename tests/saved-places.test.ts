import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSavedPlacesStore, SAVED_PLACES_KEY, SAVED_PLACES_READ_ERROR,
  SAVED_PLACES_REMOVE_ERROR, SAVED_PLACES_SAVE_ERROR,
  type SavedPlacesStorage,
} from "../frontend/src/utils/savedPlaces.js";
import { VISIT_PLANS_KEY } from "../frontend/src/utils/visitPlans.js";

class FakeStorage implements SavedPlacesStorage {
  raw: string | null;
  failRead = false;
  failWrite = false;
  writes: { key: string; value: string }[] = [];

  constructor(raw: string | null = null) { this.raw = raw; }
  getItem(key: string) {
    if (key === VISIT_PLANS_KEY) return null;
    assert.equal(key, SAVED_PLACES_KEY);
    if (this.failRead) throw new Error("SecurityError");
    return this.raw;
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error("QuotaExceededError");
    this.writes.push({ key, value });
    this.raw = value;
  }
}

function setupEvents(storage: FakeStorage) {
  type Change = { key: string | null; storageArea?: SavedPlacesStorage | null };
  const handlers = new Set<(event: Change) => void>();
  const store = createSavedPlacesStore(() => storage, (listener) => {
    handlers.add(listener);
    return () => { handlers.delete(listener); };
  });
  return { store, handlers, emit: (event: Change) => handlers.forEach((listener) => listener(event)) };
}

test("saving and deleting publish only persisted IDs to all same-tab consumers", () => {
  const storage = new FakeStorage('["existing"]');
  const store = createSavedPlacesStore(() => storage);
  const observations: string[][][] = [[], []];
  const stops = observations.map((seen) => store.subscribe(() => {
    const ids = store.getSnapshot().ids;
    assert.deepEqual(JSON.parse(storage.raw!), ids, "storage succeeds before visible IDs change");
    seen.push([...ids]);
  }));
  store.toggle("new");
  store.toggle("existing");
  assert.deepEqual(observations, [
    [["existing", "new"], ["new"]],
    [["existing", "new"], ["new"]],
  ]);
  assert.equal(storage.writes.length, 2);
  assert.equal(store.getSnapshot().error, "");
  stops.forEach((stop) => stop());
});

test("quota failures preserve previous visible and persisted IDs for both save and delete", () => {
  const storage = new FakeStorage('["existing"]');
  const store = createSavedPlacesStore(() => storage);
  const originalIds = store.getSnapshot().ids;
  storage.failWrite = true;
  store.toggle("new");
  assert.equal(store.getSnapshot().ids, originalIds);
  assert.equal(store.getSnapshot().error, SAVED_PLACES_SAVE_ERROR);
  assert.equal(storage.raw, '["existing"]');
  store.clearError();
  assert.equal(store.getSnapshot().error, "");
  store.toggle("existing");
  assert.equal(store.getSnapshot().ids, originalIds);
  assert.equal(store.getSnapshot().error, SAVED_PLACES_REMOVE_ERROR);
  assert.equal(storage.raw, '["existing"]');
  assert.equal(storage.writes.length, 0);
  storage.failWrite = false;
  store.toggle("existing");
  assert.deepEqual(store.getSnapshot(), { ids: [], error: "" });
});

test("missing storage starts empty but unavailable or throwing storage reports a Korean read error", () => {
  const fresh = createSavedPlacesStore(() => new FakeStorage());
  assert.deepEqual(fresh.getSnapshot(), { ids: [], error: "" });
  for (const getStorage of [
    () => null,
    () => { throw new Error("SecurityError"); },
    () => { const storage = new FakeStorage(); storage.failRead = true; return storage; },
  ]) {
    const store = createSavedPlacesStore(getStorage);
    assert.deepEqual(store.getSnapshot(), { ids: [], error: SAVED_PLACES_READ_ERROR });
    store.toggle("new");
    assert.deepEqual(store.getSnapshot(), { ids: [], error: SAVED_PLACES_READ_ERROR });
    assert.match(store.getSnapshot().error, /목록과 개수를 확인할 수 없습니다/);
  }
});

test("malformed saved data is reported and never overwritten by a toggle", () => {
  for (const raw of ["", "{", "null", '{}', '["valid", 3]', '[{"id":"place","lat":37.5,"lng":127}]', '[""]']) {
    const storage = new FakeStorage(raw);
    const store = createSavedPlacesStore(() => storage);
    assert.deepEqual(store.getSnapshot(), { ids: [], error: SAVED_PLACES_READ_ERROR });
    store.toggle("new");
    assert.equal(storage.raw, raw);
    assert.equal(storage.writes.length, 0);
    assert.equal(store.getSnapshot().error, SAVED_PLACES_READ_ERROR);
  }
});

test("a later read failure retains the last confirmed IDs and prevents data loss", () => {
  const storage = new FakeStorage('["existing"]');
  const { store, emit } = setupEvents(storage);
  const stop = store.subscribe(() => {});
  storage.failRead = true;
  emit({ key: SAVED_PLACES_KEY, storageArea: storage });
  assert.deepEqual(store.getSnapshot(), { ids: ["existing"], error: SAVED_PLACES_READ_ERROR });
  store.toggle("existing");
  assert.equal(storage.writes.length, 0);
  assert.deepEqual(store.getSnapshot().ids, ["existing"]);
  storage.failRead = false;
  storage.raw = '["recovered"]';
  emit({ key: SAVED_PLACES_KEY, storageArea: storage });
  assert.deepEqual(store.getSnapshot(), { ids: ["recovered"], error: "" });
  stop();
});

test("loads are bounded to 100 distinct IDs and a new save keeps the latest 100 IDs", () => {
  const ids = Array.from({ length: 105 }, (_, index) => `place-${index}`);
  const storage = new FakeStorage(JSON.stringify([ids[0], ...ids]));
  const store = createSavedPlacesStore(() => storage);
  assert.deepEqual(store.getSnapshot().ids, ids.slice(0, 100));
  assert.equal(storage.writes.length, 0);
  store.toggle("new");
  assert.deepEqual(store.getSnapshot().ids, [...ids.slice(1, 100), "new"]);
  assert.deepEqual(JSON.parse(storage.raw!), store.getSnapshot().ids);
});

test("storage changes synchronize cross-tab, ignore unrelated areas, and clean up listeners", () => {
  const storage = new FakeStorage('["first"]');
  const { store, handlers, emit } = setupEvents(storage);
  let notifications = 0;
  const stopA = store.subscribe(() => { notifications += 1; });
  const stopB = store.subscribe(() => { notifications += 1; });
  assert.equal(handlers.size, 1);
  storage.raw = '["second"]';
  emit({ key: "unrelated", storageArea: storage });
  emit({ key: SAVED_PLACES_KEY, storageArea: new FakeStorage() });
  assert.deepEqual(store.getSnapshot().ids, ["first"]);
  emit({ key: SAVED_PLACES_KEY, storageArea: storage });
  assert.deepEqual(store.getSnapshot().ids, ["second"]);
  assert.equal(notifications, 2);
  storage.raw = null;
  emit({ key: null, storageArea: storage });
  assert.deepEqual(store.getSnapshot().ids, []);
  stopA();
  assert.equal(handlers.size, 1);
  stopB();
  assert.equal(handlers.size, 0);
  storage.raw = '["while-unmounted"]';
  const stopRemount = store.subscribe(() => {});
  assert.deepEqual(store.getSnapshot().ids, ["while-unmounted"]);
  stopRemount();
  assert.equal(handlers.size, 0);
});

test("snapshot reads are stable and effect resubscription performs no writes", () => {
  const storage = new FakeStorage('["existing"]');
  const { store } = setupEvents(storage);
  const initial = store.getSnapshot();
  const stop = store.subscribe(() => {});
  stop();
  const stopAgain = store.subscribe(() => {});
  assert.equal(store.getSnapshot(), initial);
  assert.equal(store.getSnapshot(), store.getSnapshot());
  assert.equal(storage.writes.length, 0);
  stopAgain();
});

test("writes merge a missed cross-tab update and serialize bookmark IDs without place details or GPS", () => {
  const storage = new FakeStorage('["existing"]');
  const store = createSavedPlacesStore(() => storage);
  storage.raw = '["existing", "other-tab"]';
  store.toggle("new");
  assert.deepEqual(storage.writes, [{ key: SAVED_PLACES_KEY, value: '["existing","other-tab","new"]' }]);
  assert.deepEqual(store.getSnapshot().ids, ["existing", "other-tab", "new"]);
  // Runtime callers cannot accidentally persist an entire recommendation object.
  store.toggle({ id: "bad", name: "place details", lat: 37.5, lng: 127 } as unknown as string);
  assert.equal(storage.writes.length, 1);
  assert.equal(/lat|lng|name|recommendation/.test(storage.raw!), false);
});


test('saved place identity survives reload and region changes with legacy IDs preserved atomically', () => {
  const storage = new FakeStorage('["legacy"]');
  const store = createSavedPlacesStore(() => storage);
  const place = { id:'new',name:'저장할 장소',address:'서울시 주소',phone:null,lat:37.5,lng:127,source:{kind:'PUBLIC_DATA',name:'공공자료',url:null} } as import('../shared/models.js').TouristSpot;
  store.toggle(place);
  const reloaded = createSavedPlacesStore(() => storage);
  assert.deepEqual(reloaded.getSnapshot().ids, ['legacy','new']);
  assert.equal(reloaded.getSnapshot().places?.new?.name, place.name);
  storage.failWrite=true;
  reloaded.toggle('new');
  assert.equal(reloaded.getSnapshot().places?.new?.name, place.name);
  storage.failWrite=false;
  reloaded.toggle('new');
  assert.deepEqual(reloaded.getSnapshot().ids, ['legacy']);
  assert.equal(reloaded.getSnapshot().places?.new, undefined);
});

test('refresh recovers legacy identity without resurrecting a removed bookmark', () => {
  const storage=new FakeStorage('["legacy"]'); const store=createSavedPlacesStore(()=>storage);
  const place={id:'legacy',name:'복구한 장소',lat:37.5,lng:127,address:null,phone:null,source:{kind:'PUBLIC_DATA' as const,name:'공공',url:null}};
  store.toggle(place,'refresh'); assert.equal(store.getSnapshot().places?.legacy?.name,place.name);
  store.toggle('legacy'); const writes=storage.writes.length;
  store.toggle(place,'refresh'); assert.deepEqual(store.getSnapshot().ids,[]); assert.equal(storage.writes.length,writes);
});
