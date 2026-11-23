import { useEffect, useId, useRef, useState } from 'react';
import { useSavedPlaces } from '../hooks/useSavedPlaces';
import { useTravelNeeds } from '../hooks/useTravelNeeds';
import { phoneLink } from '../utils/format';
import type { SavedPlaceIdentity } from '../utils/savedPlaces';
import { buildVisitQuestions, NEEDS, type Need, type Preference, type Preferences } from '../utils/suitability';
import { readVisitPlans, VISIT_PLANS_KEY, writeVisitPlan, type VisitPlan } from '../utils/visitPlans';
import { addCurrentVisitQuestions, appendVisitQuestions } from '../utils/visitQuestionDraft';

export interface VisitQuestionRequest { requestId: number; need: Need; preference: Preference }

const planChangeEvent = 'toursafe-visit-plans-change';
const maxQuestions = 20;
const maxQuestionLength = 300;
const maxNoteLength = 2000;
const readErrorMessage = '저장한 확인 목록을 읽지 못했어요. 브라우저 저장소 설정을 확인하고 다시 불러와 주세요.';

interface EditorState {
  questionsText: string;
  checkedQuestions: string[];
  note: string;
  preferences: Preferences;
  savedAt: string | null;
  version: string;
  readError: string;
}

function preferencesKey(preferences: Preferences) {
  return JSON.stringify(NEEDS.map(([id]) => preferences[id] || null));
}

function fromPlan(plan: VisitPlan): EditorState {
  return {
    questionsText: plan.questions.join('\n'),
    checkedQuestions: plan.checkedQuestions || [],
    note: plan.note,
    preferences: { ...plan.preferences },
    savedAt: plan.savedAt,
    version: JSON.stringify(plan),
    readError: '',
  };
}

function readEditorState(placeId: string, preferences: Preferences): EditorState {
  const fresh: EditorState = {
    questionsText: buildVisitQuestions(preferences).join('\n'),
    checkedQuestions: [],
    note: '',
    preferences: { ...preferences },
    savedAt: null,
    version: 'null',
    readError: '',
  };
  try {
    const plan = readVisitPlans(window.localStorage)[placeId];
    return plan ? fromPlan(plan) : fresh;
  } catch {
    return { ...fresh, readError: readErrorMessage };
  }
}

function questionLines(text: string) {
  return text.split(/\r?\n/).map(question => question.trim()).filter(Boolean);
}

export function VisitPlanEditor({ place, formId, onOpenSaved, questionRequest }: { place: SavedPlaceIdentity; formId?: string; onOpenSaved?: (placeId: string) => void; questionRequest?: VisitQuestionRequest | null }) {
  const saved = useSavedPlaces();
  const [currentPreferences] = useTravelNeeds();
  const [editor, setEditor] = useState(() => readEditorState(place.id, currentPreferences));
  const [dirty, setDirty] = useState(false);
  const [externalUpdate, setExternalUpdate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [questionMessage, setQuestionMessage] = useState('');
  const [beforeAdd, setBeforeAdd] = useState<Pick<EditorState, 'questionsText' | 'preferences'> | null>(null);
  const handledQuestionRequest = useRef<string | null>(null);
  const editorRef = useRef<HTMLFormElement>(null);
  const questionsRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const editorStateRef = useRef(editor);
  const dirtyRef = useRef(false);
  const preferencesRef = useRef(currentPreferences);
  const placeIdRef = useRef(place.id);
  const id = useId();
  editorStateRef.current = editor;
  preferencesRef.current = currentPreferences;

  function applyEditor(next: EditorState) {
    editorStateRef.current = next;
    setEditor(next);
  }

  function loadSavedList() {
    const next = readEditorState(place.id, preferencesRef.current);
    if (next.readError) {
      applyEditor({ ...editorStateRef.current, readError: next.readError });
      return;
    }
    applyEditor(next);
    dirtyRef.current = false;
    setDirty(false);
    setExternalUpdate(false);
    setSaveMessage('');
    setSaveError('');
    setCopyMessage('');
    setQuestionMessage('');
    setBeforeAdd(null);
  }

  useEffect(() => {
    if (placeIdRef.current !== place.id) {
      placeIdRef.current = place.id;
      const next = readEditorState(place.id, preferencesRef.current);
      editorStateRef.current = next;
      setEditor(next);
      dirtyRef.current = false;
      setDirty(false);
      setExternalUpdate(false);
      setSaveMessage('');
      setSaveError('');
      setCopyMessage('');
      setQuestionMessage('');
      setBeforeAdd(null);
    }

    const refresh = () => {
      const next = readEditorState(place.id, preferencesRef.current);
      const current = editorStateRef.current;
      if (next.readError) {
        editorStateRef.current = { ...current, readError: next.readError };
        setEditor(editorStateRef.current);
        return;
      }
      if (next.version === current.version) {
        if (current.readError) {
          editorStateRef.current = { ...current, readError: '' };
          setEditor(editorStateRef.current);
        }
        return;
      }
      if (dirtyRef.current) {
        setExternalUpdate(true);
        return;
      }
      editorStateRef.current = next;
      setEditor(next);
      setExternalUpdate(false);
      setSaveMessage('');
      setSaveError('');
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== VISIT_PLANS_KEY) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage) return;
      } catch {
        return;
      }
      refresh();
    };
    const onPlanChange = (event: Event) => {
      const changedPlace = (event as CustomEvent<{ placeId?: string }>).detail?.placeId;
      if (!changedPlace || changedPlace === place.id) refresh();
    };
    const disclosure = editorRef.current?.closest('details');
    const onToggle = () => { if (disclosure?.open) refresh(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(planChangeEvent, onPlanChange);
    window.addEventListener('focus', refresh);
    disclosure?.addEventListener('toggle', onToggle);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(planChangeEvent, onPlanChange);
      window.removeEventListener('focus', refresh);
      disclosure?.removeEventListener('toggle', onToggle);
    };
  }, [place.id]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(planChangeEvent, { detail: { placeId: place.id } }));
  }, [saved.ids, place.id]);

  useEffect(() => {
    if (!saveMessage && !saveError) return;
    const frame = requestAnimationFrame(() => {
      editorRef.current?.querySelector(saveError ? '.visit-plan-error[role="alert"]' : '.visit-plan-success')?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [saveMessage, saveError]);

  useEffect(() => {
    if (!questionRequest) return;
    const requestKey = `${place.id}:${questionRequest.requestId}`;
    if (handledQuestionRequest.current === requestKey) return;
    handledQuestionRequest.current = requestKey;
    const question = buildVisitQuestions({ [questionRequest.need]: questionRequest.preference })[1]!;
    const current = editorStateRef.current;
    const result = appendVisitQuestions(current.questionsText, [question], maxQuestions);
    if (result.ok) {
      if (result.added) {
        updateDraft({ questionsText: result.text, preferences: { ...current.preferences, [questionRequest.need]: questionRequest.preference } });
        setBeforeAdd({ questionsText: current.questionsText, preferences: current.preferences });
      }
      const label = NEEDS.find(([need]) => need === questionRequest.need)![1];
      setQuestionMessage(`${label} 확인 질문${result.added ? '을 추가했어요' : '이 이미 있어요'}. 아래 질문을 검토하고 직접 확인한 내용은 방문 메모에 남겨 주세요.`);
    } else {
      setQuestionMessage(`질문 ${maxQuestions}개 한도를 넘어서 추가하지 않았어요. 기존 입력은 그대로예요. 질문을 정리한 뒤 다시 선택해 주세요.`);
    }
    const frame = requestAnimationFrame(() => {
      const textarea = questionsRef.current;
      textarea?.scrollIntoView({ block: 'center' }); textarea?.focus({ preventScroll: true });
      const start = textarea?.value.indexOf(question) ?? -1;
      if (start >= 0) textarea?.setSelectionRange(start, start + question.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [questionRequest, place.id]);

  function updateDraft(next: Partial<Pick<EditorState, 'questionsText' | 'note' | 'preferences' | 'checkedQuestions'>>) {
    dirtyRef.current = true;
    setDirty(true);
    applyEditor({ ...editorStateRef.current, ...next });
    setSaveMessage('');
    setSaveError('');
    setCopyMessage('');
    setQuestionMessage('');
    setBeforeAdd(null);
  }

  function addQuestions() {
    const current = editorStateRef.current;
    const result = addCurrentVisitQuestions(current.questionsText, currentPreferences, maxQuestions);
    if (!result.ok) {
      setQuestionMessage(`추가하면 질문이 ${result.total}개가 되어 ${maxQuestions}개 한도를 넘어요. 기존 입력은 그대로예요. 필요한 질문을 정리한 뒤 다시 추가해 주세요.`);
      return;
    }
    const previous = { questionsText: current.questionsText, preferences: current.preferences };
    updateDraft({ questionsText: result.text, preferences: { ...currentPreferences } });
    setBeforeAdd(previous);
    setQuestionMessage(result.added ? `현재 조건의 질문 ${result.added}개를 추가했어요. 기존 질문과 메모는 그대로예요.` : '현재 조건의 기본 질문이 이미 있어요. 기존 질문과 메모는 그대로예요.');
  }

  const questions = questionLines(editor.questionsText);
  const questionsError = questions.length === 0
    ? '확인할 질문을 한 줄 이상 입력해 주세요.'
    : questions.length > maxQuestions
      ? `질문은 ${maxQuestions}개까지 저장할 수 있어요. 한 줄에 하나씩 적어 주세요.`
      : questions.some(question => question.length > maxQuestionLength)
        ? `질문 한 개는 ${maxQuestionLength}자 이내로 적어 주세요.`
        : '';
  const noteError = editor.note.length > maxNoteLength ? `메모는 ${maxNoteLength}자 이내로 적어 주세요.` : '';
  const conditionsChanged = preferencesKey(editor.preferences) !== preferencesKey(currentPreferences);
  const [editingQuestions, setEditingQuestions] = useState(false);
  const callHref = place.source.kind !== 'DEMO_DATA' ? phoneLink(place.phone) : null;

  function savePlan() {
    setSaveMessage('');
    setSaveError('');
    if (questionsError || noteError) {
      setSaveError(questionsError || noteError);
      if (questionsError) { setEditingQuestions(true); requestAnimationFrame(() => questionsRef.current?.focus()); }
      else noteRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      try {
        const latest = readVisitPlans(window.localStorage)[place.id];
        if (JSON.stringify(latest ?? null) !== editorStateRef.current.version) {
          setExternalUpdate(true);
          setSaveError('다른 화면에서 이 장소의 목록이 바뀌어 덮어쓰지 않았어요. 현재 입력을 복사해 보관한 뒤 저장된 목록을 불러와 주세요.');
          return;
        }
      } catch {
        setSaveError(readErrorMessage);
        return;
      }
      if (!saved.places?.[place.id]) {
        const identitySaved = saved.toggle(place, saved.ids.includes(place.id) ? 'refresh' : 'toggle');
        if (!identitySaved) {
          setSaveError('후보 저장을 완료하지 못해 확인 목록도 저장하지 않았어요. 입력은 그대로 남아 있어요. 저장소 설정을 확인한 뒤 다시 시도해 주세요.');
          return;
        }
      }
      const plan: VisitPlan = {
        placeId: place.id,
        savedAt: new Date().toISOString(),
        preferences: { ...editor.preferences },
        questions,
        ...(editor.checkedQuestions.length ? { checkedQuestions: editor.checkedQuestions.filter(question => questions.includes(question)) } : {}),
        note: editor.note,
      };
      try {
        writeVisitPlan(window.localStorage, plan);
      } catch {
        setSaveError('후보는 저장됐지만 확인 목록은 저장하지 못했어요. 입력은 그대로 남아 있어요. 저장 공간과 설정을 확인한 뒤 다시 저장해 주세요.');
        return;
      }
      applyEditor(fromPlan(plan));
      dirtyRef.current = false;
      setDirty(false);
      setExternalUpdate(false);
      setSaveMessage('후보와 확인 목록을 이 기기에 저장했어요.');
      setBeforeAdd(null);
      window.dispatchEvent(new CustomEvent(planChangeEvent, { detail: { placeId: place.id } }));
    } finally {
      setSaving(false);
    }
  }

  async function copyQuestions() {
    setCopyMessage('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(editor.questionsText);
      setCopyMessage('질문을 복사했어요.');
    } catch {
      questionsRef.current?.focus();
      questionsRef.current?.select();
      setCopyMessage('자동 복사가 되지 않아 질문을 선택했어요. 길게 누르거나 키보드의 복사 기능으로 복사해 주세요.');
    }
  }

  return <form id={formId} className="visit-plan-editor" ref={editorRef} aria-labelledby={`${id}-heading`} onSubmit={event => { event.preventDefault(); savePlan(); }}>
    <div className="visit-checklist-heading">
      <h3 className="visit-plan-heading" id={`${id}-heading`} tabIndex={-1}>방문 체크리스트</h3>
      <span>{questions.filter(question => editor.checkedQuestions.includes(question)).length}/{questions.length} 완료</span>
    </div>
    <ul className="visit-checklist">
      {questions.map((question, index) => <li key={index}>
        <label>
          <input type="checkbox" checked={editor.checkedQuestions.includes(question)} onChange={event => {
            updateDraft({ checkedQuestions: event.target.checked
              ? [...editor.checkedQuestions, question]
              : editor.checkedQuestions.filter(value => value !== question) });
          }} />
          <span>{question}</span>
        </label>
      </li>)}
    </ul>
    {conditionsChanged && <p className="visit-plan-meta">필요조건이 바뀌었어요. 항목 편집에서 현재 조건을 추가할 수 있어요.</p>}
    {dirty && <p className="visit-plan-meta">저장하면 체크 상태와 메모가 이 기기에 남아요.</p>}
    {editor.readError && <div className="visit-plan-error" role="alert">
      <p>{editor.readError}</p>
      <button type="button" onClick={loadSavedList}>저장 목록 다시 읽기</button>
    </div>}
    {externalUpdate && <div className="visit-plan-warning" role="status">
      <p>다른 화면에서 저장한 목록이 바뀌었어요. 작성 중인 입력은 유지했어요. 불러오면 현재 입력이 저장된 목록으로 바뀝니다.</p>
      <button type="button" onClick={loadSavedList}>저장된 목록 불러오기</button>
    </div>}
    <div className="visit-plan-field">
      <label htmlFor={`${id}-note`}>메모</label>
      <textarea id={`${id}-note`} ref={noteRef} aria-label={`${place.name} 방문 메모`} placeholder="문의한 내용이나 챙길 것을 적어 보세요." aria-invalid={Boolean(noteError)} rows={3} maxLength={maxNoteLength} value={editor.note} onChange={event => updateDraft({ note: event.target.value })} />
      {noteError && <p className="visit-plan-error">{noteError}</p>}
    </div>
    <details className="visit-plan-edit" open={editingQuestions} onToggle={event => setEditingQuestions(event.currentTarget.open)}>
      <summary>체크리스트 항목 편집</summary>
      <div className="visit-plan-field">
        <label htmlFor={`${id}-questions`}>항목 입력</label>
        <textarea id={`${id}-questions`} ref={questionsRef} aria-label={`${place.name} 확인할 질문`} aria-invalid={Boolean(questionsError)} rows={4} maxLength={maxQuestions * maxQuestionLength + maxQuestions - 1} value={editor.questionsText} onChange={event => updateDraft({ questionsText: event.target.value })} />
        <small>한 줄에 한 항목씩 적어 주세요.</small>
        {questionsError && <p className="visit-plan-error">{questionsError}</p>}
      </div>
      <div className="visit-plan-actions">
        <button type="button" onClick={addQuestions}>현재 조건 질문 추가</button>
        {beforeAdd && <button type="button" onClick={() => updateDraft(beforeAdd)}>추가 되돌리기</button>}
        <button type="button" onClick={() => void copyQuestions()} disabled={!editor.questionsText.trim()}>질문 복사</button>
        {callHref && <a href={callHref}>전화 문의</a>}
      </div>
      {questionMessage && <p className="visit-plan-meta" role="status">{questionMessage}</p>}
    </details>
    {!formId && <div className="visit-plan-actions"><button type="submit" disabled={saving}>{saving ? '저장 중…' : '체크리스트·메모 저장'}</button></div>}
    {saveError && <p className="visit-plan-error" role="alert">{saveError}</p>}
    {saveMessage && <div className="visit-plan-success"><p className="visit-plan-status" role="status">{saveMessage}</p>{onOpenSaved && <button type="button" onClick={() => onOpenSaved(place.id)}>저장한 준비 카드 보기</button>}</div>}
    {copyMessage && <p className="visit-plan-status" role="status">{copyMessage}</p>}
  </form>;
}
