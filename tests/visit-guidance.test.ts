import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guidanceStorage, GUIDE_SEEN_KEY, koreanNightKey, NIGHT_DISMISSED_KEY, readGuidanceValue, saveGuidanceValue } from '../frontend/src/utils/visitGuidance.js';

test('night notice begins at 20:00 KST and ends at 06:00 KST', () => {
  assert.equal(koreanNightKey(new Date('2026-10-29T10:59:59Z')), null);
  assert.equal(koreanNightKey(new Date('2026-10-29T11:00:00Z')), '2026-10-29');
  assert.equal(koreanNightKey(new Date('2026-10-29T20:59:59Z')), '2026-10-29');
  assert.equal(koreanNightKey(new Date('2026-10-29T21:00:00Z')), null);
});

test('dismissal identifies one whole night across midnight, then allows the next night', () => {
  const beforeMidnight = koreanNightKey(new Date('2026-10-29T14:59:59Z'));
  const afterMidnight = koreanNightKey(new Date('2026-10-29T15:00:00Z'));
  const nextNight = koreanNightKey(new Date('2026-10-30T11:00:00Z'));
  assert.equal(beforeMidnight, afterMidnight);
  assert.notEqual(nextNight, beforeMidnight);
});

test('the early-morning night key handles year boundaries and invalid dates', () => {
  assert.equal(koreanNightKey(new Date('2026-12-31T15:30:00Z')), '2026-12-31');
  assert.equal(koreanNightKey(new Date(NaN)), null);
});

test('reading and dismissing guidance does not change travel needs or saved places', () => {
  const values = new Map<string, string>([['toursafe.travel-needs.v1', '{"stepFree":"required"}'], ['saved', '["museum"]']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(readGuidanceValue(storage, GUIDE_SEEN_KEY), null);
  saveGuidanceValue(storage, GUIDE_SEEN_KEY, 'seen');
  saveGuidanceValue(storage, NIGHT_DISMISSED_KEY, '2026-10-29');
  assert.equal(readGuidanceValue(storage, GUIDE_SEEN_KEY), 'seen');
  assert.equal(values.get('toursafe.travel-needs.v1'), '{"stepFree":"required"}');
  assert.equal(values.get('saved'), '["museum"]');
});

test('unavailable or throwing browser storage cannot block guidance', () => {
  assert.equal(guidanceStorage('localStorage'), undefined);
  assert.equal(readGuidanceValue(undefined, GUIDE_SEEN_KEY), null);
  const blocked = { getItem: () => { throw new Error('Storage blocked'); }, setItem: () => { throw new Error('Storage full'); } };
  assert.equal(readGuidanceValue(blocked, GUIDE_SEEN_KEY), null);
  assert.doesNotThrow(() => saveGuidanceValue(blocked, GUIDE_SEEN_KEY, 'seen'));
  assert.doesNotThrow(() => saveGuidanceValue(undefined, NIGHT_DISMISSED_KEY, '2026-10-29'));
});
