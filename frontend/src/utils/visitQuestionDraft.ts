import { buildVisitQuestions, type Preferences } from './suitability';

export type AddVisitQuestionsResult =
  | { ok: true; text: string; added: number; total: number }
  | { ok: false; total: number };

/** Add missing generated questions without rewriting any part of the user's draft. */
export function addCurrentVisitQuestions(
  currentText: string,
  preferences: Preferences,
  maxQuestions = 20,
): AddVisitQuestionsResult {
  return appendVisitQuestions(currentText, buildVisitQuestions(preferences), maxQuestions);
}

export function appendVisitQuestions(currentText: string, requestedQuestions: string[], maxQuestions = 20): AddVisitQuestionsResult {
  const currentQuestions = currentText.split(/\r\n|\n|\r/).map(line => line.trim()).filter(Boolean);
  const present = new Set(currentQuestions);
  const additions: string[] = [];
  for (const question of requestedQuestions) {
    const comparison = question.trim();
    if (!present.has(comparison)) {
      additions.push(question);
      present.add(comparison);
    }
  }
  const total = currentQuestions.length + additions.length;
  if (total > maxQuestions) return { ok: false, total };
  const separator = currentText.length && !/[\r\n]$/.test(currentText) ? '\n' : '';
  return {
    ok: true,
    text: additions.length ? currentText + separator + additions.join('\n') : currentText,
    added: additions.length,
    total,
  };
}
