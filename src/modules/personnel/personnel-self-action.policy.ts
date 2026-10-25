/**
 * Whether an IT Admin may record an event about their own person (`US-03-01` AC-22, `SoD-5`, `QĐ-77m`): not while another IT
 * Admin can act in their place; when they are the only one the event is allowed, and is kept as done on oneself so the Super
 * Admin can be told. A person acting on someone else is never judged here.
 */
export type SelfActionMode = 'ALLOW' | 'ALLOW_SELF_EXECUTED' | 'NEEDS_ANOTHER_IT_ADMIN';

export function selfActionMode(facts: { isSelf: boolean; otherUsableItAdmins: number }): SelfActionMode {
  if (!facts.isSelf) return 'ALLOW';

  return facts.otherUsableItAdmins > 0 ? 'NEEDS_ANOTHER_IT_ADMIN' : 'ALLOW_SELF_EXECUTED';
}
