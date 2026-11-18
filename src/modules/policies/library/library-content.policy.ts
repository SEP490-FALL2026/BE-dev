import type { PolicyContent } from './library.json';

export type ContentRefusal =
  { reason: 'STEP_SET_FIXED'; added: string[]; removed: string[] } | { reason: 'SYSTEM_ITEM_UNKNOWN'; items: string[] };

const codesOf = (content: PolicyContent): string[] => content.steps.map((step) => step.code);

const systemItemsOf = (content: PolicyContent): Set<string> =>
  new Set(
    content.steps.flatMap((step) => step.checklist.filter((item) => item.check === 'SYSTEM').map((item) => item.code)),
  );

/**
 * What a new text of a policy may not do to the one in force (`QĐ-112a`, `QĐ-111ap`, `US-01-13` AC-6): a policy states what is read, it never
 * turns a rule of the system on or off. So (a) the steps are the same set: each of the seven decision steps belongs to one policy, and the
 * decision that asks its checklist finds it there; (b) a question answered by the system (`SYSTEM`, shown as _Có_ and never changed by the
 * person) stays one that the version in force already had as such: a question a person answered cannot become one the screen ticks for
 * them, and a new question always asks the person. Words are free: titles, questions, sections, and dropping a `SYSTEM` question. The steps
 * are judged first.
 */
export function refuseContent(current: PolicyContent, next: PolicyContent): ContentRefusal | null {
  const before = new Set(codesOf(current));
  const after = new Set(codesOf(next));
  const added = [...after].filter((code) => !before.has(code));
  const removed = [...before].filter((code) => !after.has(code));
  if (added.length > 0 || removed.length > 0) return { reason: 'STEP_SET_FIXED', added, removed };

  const allowed = systemItemsOf(current);
  const unknown = [...systemItemsOf(next)].filter((code) => !allowed.has(code));

  return unknown.length > 0 ? { reason: 'SYSTEM_ITEM_UNKNOWN', items: unknown } : null;
}
