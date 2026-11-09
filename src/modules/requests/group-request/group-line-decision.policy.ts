import type { LineState } from '../access-request/group-request.types';

/**
 * The rules of deciding the lines of a request for a group (`US-05-17` AC-4, AC-9, AC-15), as pure decisions: who may decide the
 * lines of a step, that the decision covers exactly the lines of the step, and what a decision leads to. One decision covers all
 * the lines of one step, never some of them (`US-05-04` AC-14: the head sees three people, approves two and refuses one).
 */

export type LineDecisionRefusal =
  /** The one who decides is not the one who asked or a person of the lines of this step, whatever role they hold (`SoD-4`). */
  'OWN_REQUEST' | 'NOT_THE_ASSIGNEE' | 'STEP_NOT_PENDING';

export interface LineDeciderFacts {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  /** The people of the lines the step holds: a head named among the people of another step still decides this one. */
  stepEmployeeIds: readonly string[];
  /** Who holds the step; null while it waits for somebody. */
  assigneeEmployeeId: string | null;
  stepState: 'PENDING' | 'WAITING' | 'APPROVED' | 'REJECTED' | 'CLOSED' | 'NOT_REQUIRED';
  /** Whether the decision approves at least one line. */
  approves: boolean;
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

/**
 * The step the person decides: the one they hold, a pending one before a decided one; otherwise the one of their own line or the
 * first, so that the refusal says why they may not (they are one of the people, or do not hold it).
 */
export function needStepOf<S extends { id: string; assigneeEmployeeId: string | null; state: string }>(
  steps: readonly S[],
  lines: readonly { employeeId: string; needStepId: string }[],
  employeeId: string,
): S {
  const held = steps.filter((step) => step.assigneeEmployeeId === employeeId);
  const named = lines.find((line) => line.employeeId === employeeId);

  return (
    held.find((step) => step.state === 'PENDING') ??
    held[0] ??
    steps.find((step) => step.id === named?.needStepId) ??
    steps[0]
  );
}

/** The verdicts of the lines that still wait, in the order of the lines (the caller has checked that each was answered once). */
export const verdictsOf = (open: readonly { employeeId: string }[], given: readonly LineVerdict[]): LineVerdict[] =>
  open.map((line) => given.find((verdict) => verdict.employeeId === line.employeeId) as LineVerdict);

/** What the record of approval of the step keeps: what was decided and the reason when it is a refusal. */
export function needRecordOf(verdicts: readonly LineVerdict[]): {
  decision: 'APPROVED' | 'REJECTED';
  reason: string | null;
} {
  const decision = stepOutcomeOf(verdicts);

  return { decision, reason: decision === 'REJECTED' ? stepRefusalReason(verdicts) : null };
}

/** What the audit entry `ACCESS_REQUEST.LINE_SPEND_DECIDED` says of one person: approved or refused, the reason trimmed, and by whom. */
export function lineSpendDecidedDetail(
  request: { id: string; requesterEmployeeId: string },
  stepId: string,
  verdict: LineVerdict,
  by: { actorEmployeeId: string; deciderRole: string },
): { [key: string]: string | null } {
  const rejected = verdict.decision === 'REJECT';

  return {
    requestId: request.id,
    stepId,
    beneficiaryEmployeeId: verdict.employeeId,
    decision: rejected ? 'REJECTED' : 'APPROVED',
    decidedByEmployeeId: by.actorEmployeeId,
    deciderRole: by.deciderRole,
    reason: rejected ? (verdict.reason ?? '').trim() : null,
    requesterEmployeeId: request.requesterEmployeeId,
  };
}

/** What the audit entry of the whole spend decision says: what was checked, the reserve it used, who was approved and who refused. */
export function groupSpendDecidedDetail(
  request: { id: string; routing?: { mode: string } },
  step: { id: string; samePersonAsSpend?: boolean },
  decided: {
    verdicts: readonly LineVerdict[];
    checkId: string | null;
    usesReserve: boolean;
    reserveReason: string | null;
    decision: 'APPROVED' | 'REJECTED';
    deciderRole: string;
  },
): { [key: string]: string | number | boolean | string[] | null } {
  return {
    requestId: request.id,
    checkId: decided.checkId,
    oneStep: request.routing?.mode === 'ONE_STEP',
    decision: decided.decision,
    deciderRole: decided.deciderRole,
    usesReserve: decided.usesReserve,
    reserveReason: decided.reserveReason,
    requestState: decided.decision === 'APPROVED' ? 'AWAITING_EXECUTION' : 'REJECTED',
    lineCount: decided.verdicts.length,
    approvedEmployeeIds: decided.verdicts.filter((v) => v.decision === 'APPROVE').map((v) => v.employeeId),
    rejectedEmployeeIds: decided.verdicts.filter((v) => v.decision === 'REJECT').map((v) => v.employeeId),
  };
}
