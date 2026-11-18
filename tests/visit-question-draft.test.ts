import test from 'node:test';
import assert from 'node:assert/strict';
import { addCurrentVisitQuestions } from '../frontend/src/utils/visitQuestionDraft';
import { buildVisitQuestions, type Preferences } from '../frontend/src/utils/suitability';

test('추가·수정한 질문과 이전 조건의 질문은 그대로 두고 새 조건의 질문을 추가한다', () => {
  const previous: Preferences = { stepFree: 'required' };
  const current: Preferences = { strollerAccess: 'required' };
  const custom = '  아이가 쉬어 갈 수 있는 조용한 공간도 있나요?  ';
  const modified = buildVisitQuestions(previous)[1]!.replace('있나요?', '있나요? 보조 출입구도 알려 주세요.');
  const original = [...buildVisitQuestions(previous), modified, custom].join('\n');
  const result = addCurrentVisitQuestions(original, current);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.text, original + '\n' + buildVisitQuestions(current)[1]);
  assert.equal(result.added, 1);
  assert.equal(result.total, 5);
  assert.deepEqual(current, { strollerAccess: 'required' });
});

test('앞뒤 공백만 무시해 중복을 비교하고 기존 문장·중복·빈 줄·줄바꿈을 보존한다', () => {
  const generated = buildVisitQuestions({ nursing: 'preferred' });
  const original = `\r\n  ${generated[0]}  \r\n\r\n${generated[0]}\r\n직접 쓴  질문\r\n`;
  const result = addCurrentVisitQuestions(original, { nursing: 'preferred' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.text, original + generated[1]);
  assert.equal(result.added, 1);
  assert.equal(result.total, 4);
});

test('질문의 내부 공백이나 수정된 문장은 같은 기본 질문으로 간주하지 않는다', () => {
  const base = buildVisitQuestions({})[0]!;
  const original = base.replace('방문 예정일', '방문  예정일');
  const result = addCurrentVisitQuestions(original, {});
  assert.deepEqual(result, { ok: true, text: original + '\n' + base, added: 1, total: 2 });
});

test('반복 추가는 새 중복을 만들지 않고 원래 텍스트를 반환한다', () => {
  const preferences: Preferences = { strollerAccess: 'required', nursing: 'preferred', rest: 'preferred' };
  const first = addCurrentVisitQuestions('직접 확인할 질문\n\n', preferences);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = addCurrentVisitQuestions(first.text, preferences);
  assert.deepEqual(second, { ok: true, text: first.text, added: 0, total: first.total });
});

test('빈 초안에는 기본 질문을 추가하고 마지막 줄바꿈이 있으면 빈 줄을 더 넣지 않는다', () => {
  const generated = buildVisitQuestions({});
  assert.deepEqual(addCurrentVisitQuestions('', {}), {
    ok: true, text: generated.join('\n'), added: 1, total: 1,
  });
  const result = addCurrentVisitQuestions('직접 질문\n', {});
  assert.deepEqual(result, { ok: true, text: '직접 질문\n' + generated[0], added: 1, total: 2 });
});

test('20개에 정확히 도달하면 추가하고 초과하면 자르거나 변경한 텍스트를 반환하지 않는다', () => {
  const nineteen = Array.from({ length: 19 }, (_, index) => `직접 질문 ${index + 1}`).join('\n');
  const accepted = addCurrentVisitQuestions(nineteen, {});
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.total, 20);
  const original = accepted.text;
  const rejected = addCurrentVisitQuestions(original, { strollerAccess: 'required' });
  assert.deepEqual(rejected, { ok: false, total: 21 });
  assert.equal(original, nineteen + '\n' + buildVisitQuestions({})[0]);
  assert.equal(Object.hasOwn(rejected, 'text'), false);
});

test('기존 중복도 질문 한도에 포함하고 사용자 지정 한도를 적용한다', () => {
  const base = buildVisitQuestions({})[0]!;
  assert.deepEqual(addCurrentVisitQuestions(base + '\n' + base, {}, 1), { ok: false, total: 2 });
  assert.deepEqual(addCurrentVisitQuestions('직접 질문', {}, 2), {
    ok: true, text: '직접 질문\n' + base, added: 1, total: 2,
  });
});
