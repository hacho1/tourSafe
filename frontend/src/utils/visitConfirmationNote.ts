/** The template is personal input; it never changes provider evidence or its status. */
export function appendConfirmationNote(note: string, dayLabel: string, maxLength = 2000): { ok: true; text: string; added: boolean } | { ok: false } {
  const template = `개인 확인 기록\n확인일: ${dayLabel}\n확인 방법: \n직접 확인한 내용: `;
  if (note.includes(template)) return { ok: true, text: note, added: false };
  const text = note + (note.length && !note.endsWith('\n') ? '\n\n' : '') + template;
  return text.length <= maxLength ? { ok: true, text, added: true } : { ok: false };
}
