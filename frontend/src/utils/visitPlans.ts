import { NEEDS, type Preferences } from './suitability';

export const VISIT_PLANS_KEY = 'toursafe:visit-plans:v1';

export interface VisitPlan {
  placeId: string;
  savedAt: string;
  preferences: Preferences;
  questions: string[];
  note: string;
}

export type PlanStorage = Pick<Storage, 'getItem' | 'setItem'>;

const PLAN_LIMIT = 100;
const needIds = new Set<string>(NEEDS.map(([id]) => id));
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);

function invalid(): never {
  throw new Error('Invalid visit plans');
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || unsafeKeys.has(key))) return invalid();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  const ownKeys = Object.getOwnPropertyNames(value);
  if (ownKeys.length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
}

function placeId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || unsafeKeys.has(value)) return invalid();
  return value;
}

function savedAt(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return invalid();
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = parts;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]! ||
      Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59) return invalid();
  return value;
}

function validatePlan(value: unknown): VisitPlan {
  const plan = record(value);
  exactKeys(plan, ['placeId', 'savedAt', 'preferences', 'questions', 'note']);
  const preferences = record(plan.preferences);
  const selected: Preferences = {};
  for (const key of Object.getOwnPropertyNames(preferences)) {
    const preference = preferences[key];
    if (!needIds.has(key) || (preference !== 'required' && preference !== 'preferred')) invalid();
    selected[key as keyof Preferences] = preference;
  }
  const questions: unknown[] = Array.isArray(plan.questions) ? Array.from(plan.questions) : [];
  if (questions.length < 1 || questions.length > 20 ||
      !questions.every(question => typeof question === 'string' && question.trim().length > 0 && question.length <= 300)) return invalid();
  if (typeof plan.note !== 'string' || plan.note.length > 2000) return invalid();
  return {
    placeId: placeId(plan.placeId),
    savedAt: savedAt(plan.savedAt),
    preferences: selected,
    questions: questions as string[],
    note: plan.note,
  };
}

/** Throw on unreadable or malformed data so callers never replace it with an empty list. */
export function readVisitPlans(storage: PlanStorage): Record<string, VisitPlan> {
  const raw = storage.getItem(VISIT_PLANS_KEY);
  if (raw === null) return {};
  const envelope = record(JSON.parse(raw));
  exactKeys(envelope, ['version', 'plans']);
  if (envelope.version !== 1) return invalid();
  const entries = record(envelope.plans);
  const ids = Object.getOwnPropertyNames(entries);
  if (ids.length > PLAN_LIMIT) return invalid();
  const plans: Record<string, VisitPlan> = {};
  for (const id of ids) {
    placeId(id);
    const plan = validatePlan(entries[id]);
    if (plan.placeId !== id) return invalid();
    plans[id] = plan;
  }
  return plans;
}

/** Re-read immediately before writing to preserve other candidates saved by another consumer. */
export function writeVisitPlan(storage: PlanStorage, plan: VisitPlan): void {
  const validated = validatePlan(plan);
  const plans = readVisitPlans(storage);
  if (!Object.hasOwn(plans, validated.placeId) && Object.keys(plans).length >= PLAN_LIMIT) {
    throw new Error('Visit plan limit reached');
  }
  plans[validated.placeId] = validated;
  storage.setItem(VISIT_PLANS_KEY, JSON.stringify({ version: 1, plans }));
}

/** Missing plans are a no-op, including when the sidecar has never been created. */
export function removeVisitPlan(storage: PlanStorage, id: string): void {
  placeId(id);
  const plans = readVisitPlans(storage);
  if (!Object.hasOwn(plans, id)) return;
  delete plans[id];
  storage.setItem(VISIT_PLANS_KEY, JSON.stringify({ version: 1, plans }));
}
