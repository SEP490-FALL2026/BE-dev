import { LONG_TERM_MONTHS } from '../access-request/need-decision.policy';
import type { LineState } from './group-request.types';

/**
 * The rules of deciding the lines of a request for a group (`US-05-17` AC-4, AC-9, AC-15), as pure decisions: who may decide the
 * lines of a step, that the decision covers exactly the lines of the step, and what a decision leads to. One decision covers all
 * the lines of one step, never some of them (`US-05-04` AC-14: the head sees three people, approves two and refuses one).
 */

export type LineDecisionRefusal =
  /** The one who decides is not the one who asked or a person of the lines of this step, whatever role they hold (`SoD-4`). */
  'OWN_REQUEST' | 'NOT_THE_ASSIGNEE' | 'STEP_NOT_PENDING' | 'TERM_CONFIRMATION_REQUIRED';

export interface LineDeciderFacts {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  /** The people of the lines the step holds: a head named among the people of another step still decides this one. */
  stepEmployeeIds: readonly string[];
  /** Who holds the step; null while it waits for somebody. */
  assigneeEmployeeId: string | null;
  stepState: 'PENDING' | 'WAITING' | 'APPROVED' | 'REJECTED' | 'CLOSED';
  termMonths: number;
  /** Whether the decision approves at least one line. */
  approves: boolean;
  confirmed: boolean;
}

/** The first reason the person may not decide the lines of the step, in the order a caller should learn it, or null. */
export function checkLineNeedDecider(facts: LineDeciderFacts): LineDecisionRefusal | null {
  if (facts.actorEmployeeId === facts.requesterEmployeeId || facts.stepEmployeeIds.includes(facts.actorEmployeeId)) {
    return 'OWN_REQUEST';
  }
  if (facts.assigneeEmployeeId === null || facts.actorEmployeeId !== facts.assigneeEmployeeId) {
    return 'NOT_THE_ASSIGNEE';
  }
  if (facts.stepState !== 'PENDING') return 'STEP_NOT_PENDING';
  if (facts.approves && facts.termMonths > LONG_TERM_MONTHS && !facts.confirmed) return 'TERM_CONFIRMATION_REQUIRED';

  return null;
}

export interface LineMismatch {
  /** Lines of the step the decision left out. */
  missing: string[];
  /** People the decision names that are not lines of the step, or that it names twice. */
  extra: string[];
}

/** Whether the decision names exactly the lines of the step, each once; the people it left out or added otherwise. */
export function compareLines(expected: readonly string[], given: readonly string[]): LineMismatch | null {
  const wanted = new Set(expected);
  const seen = new Set<string>();
  const extra: string[] = [];
  for (const id of given) {
    if (!wanted.has(id) || seen.has(id)) extra.push(id);
    seen.add(id);
  }
  const missing = expected.filter((id) => !seen.has(id));

  return missing.length === 0 && extra.length === 0 ? null : { missing, extra: [...new Set(extra)] };
}

export interface LineVerdict {
  employeeId: string;
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}

/** The people whose refusal gives no reason: a refusal that is not explained is refused (`US-05-04` AC-14). */
export const refusalsWithoutReason = (verdicts: readonly LineVerdict[]): string[] =>
  verdicts
    .filter((verdict) => verdict.decision === 'REJECT' && (verdict.reason ?? '').trim() === '')
    .map((verdict) => verdict.employeeId);

/** What the decision makes of the step: approved when at least one person goes on, refused when nobody does. */
export const stepOutcomeOf = (verdicts: readonly LineVerdict[]): 'APPROVED' | 'REJECTED' =>
  verdicts.some((verdict) => verdict.decision === 'APPROVE') ? 'APPROVED' : 'REJECTED';

/** The state a person's line moves to when the need is decided. */
export const needLineState = (
  decision: 'APPROVE' | 'REJECT',
): Extract<LineState, 'NEED_CONFIRMED' | 'NEED_REJECTED'> =>
  decision === 'APPROVE' ? 'NEED_CONFIRMED' : 'NEED_REJECTED';

/** The state a person's line moves to when the spend is decided. */
export const spendLineState = (decision: 'APPROVE' | 'REJECT'): Extract<LineState, 'APPROVED' | 'SPEND_REJECTED'> =>
  decision === 'APPROVE' ? 'APPROVED' : 'SPEND_REJECTED';

/**
 * The reason a refusing step keeps on its record of approval, which refuses only with a reason: what was said of each person,
 * in the order of the lines.
 */
export function stepRefusalReason(verdicts: readonly LineVerdict[]): string {
  return verdicts
    .filter((verdict) => verdict.decision === 'REJECT')
    .map((verdict) => (verdict.reason ?? '').trim())
    .join('; ');
}
