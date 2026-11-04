import { hasSpendStep, type RequestPolicy } from '../access-request/access-request.policy';
import { LONG_TERM_MONTHS } from '../access-request/need-decision.policy';
import type { RoutedRole, RoutingDecision, RoutingFacts, WaitingReason } from '../access-request/routing.policy';

/**
 * What a person is shown before they send a request (`US-05-01`): the chain of people who will decide it and how long each
 * step may take, as a pure reading of the policy and the routing table. It is the same table that gives the need step to
 * a person when the request is sent, so the chain shown is the chain made (`US-05-01` AC-11).
 */

export type PreviewStepKind = 'NEED' | 'SPEND_SUBMISSION' | 'SPEND_APPROVAL' | 'IT_EXECUTION';

/** Why the need step names this person (`US-05-01` AC-5): the row of the routing table, in words a screen can show. */
export type NeedExplanation =
  'DEPARTMENT_HEAD' | 'HEAD_ASKS_FOR_SELF' | 'WAITS_FOR_DEPARTMENT_HEAD' | 'WAITING_FOR_AN_APPROVER';

export interface PreviewStep {
  sequence: number;
  kind: PreviewStepKind;
  /** The role the step is held in; the IT Admin is a role of the team, so no one person is named for it. */
  role: RoutedRole | 'IT_ADMIN';
  assigneeEmployeeId: string | null;
  /** How long the step may wait, in working days, as the policy fixes it. */
  expectedWorkingDays: number;
  /** Only the need step has one. */
  explanation: NeedExplanation | null;
  /** Why nobody is named for a step that needs a person. */
  waitingReason: WaitingReason | null;
}

const NEED_EXPLANATION: Readonly<Record<1 | 2 | 4 | 8, NeedExplanation>> = {
  1: 'DEPARTMENT_HEAD',
  2: 'HEAD_ASKS_FOR_SELF',
  4: 'WAITS_FOR_DEPARTMENT_HEAD',
  8: 'WAITING_FOR_AN_APPROVER',
};

export function buildChain(policy: RequestPolicy, decision: RoutingDecision, facts: RoutingFacts): PreviewStep[] {
  const days = policy.slaWorkingDays;
  const need: Omit<PreviewStep, 'sequence'> =
    decision.outcome === 'ASSIGNED'
      ? {
          kind: 'NEED',
          role: decision.role,
          assigneeEmployeeId: decision.assigneeEmployeeId,
          expectedWorkingDays: days,
          explanation: NEED_EXPLANATION[decision.row],
          waitingReason: null,
        }
      : {
          kind: 'NEED',
          role: 'MANAGER',
          assigneeEmployeeId: null,
          expectedWorkingDays: days,
          explanation: NEED_EXPLANATION[decision.row],
          waitingReason: decision.reason,
        };
  const steps: Array<Omit<PreviewStep, 'sequence'>> = [need];

  if (hasSpendStep(policy)) {
    // The head of the department sends the request on to be decided as spend, then the spending approver decides it.
    steps.push({
      kind: 'SPEND_SUBMISSION',
      role: 'MANAGER',
      assigneeEmployeeId: facts.departmentHeadEmployeeId,
      expectedWorkingDays: days,
      explanation: facts.departmentHeadEmployeeId === null ? 'WAITS_FOR_DEPARTMENT_HEAD' : 'DEPARTMENT_HEAD',
      waitingReason: null,
    });
    steps.push({
      kind: 'SPEND_APPROVAL',
      role: 'SPENDING_APPROVER',
      assigneeEmployeeId: facts.spendingApproverEmployeeId,
      expectedWorkingDays: days,
      explanation: null,
      waitingReason: facts.spendingApproverEmployeeId === null ? 'NO_SPENDING_APPROVER' : null,
    });
  }
  steps.push({
    kind: 'IT_EXECUTION',
    role: 'IT_ADMIN',
    assigneeEmployeeId: null,
    expectedWorkingDays: days,
    explanation: null,
    waitingReason: null,
  });

  return steps.map((step, index) => ({ sequence: index + 1, ...step }));
}

/**
 * Whether the request, once sent and approved as a need, can be sent on to be decided as spend (`US-05-02` AC-4,
 * `US-05-01` AC-14): internal software has no spend; paid software with no price is sent and decided as a need, but waits
 * for the IT Admin to give the price before it can go on.
 */
export type SpendSubmission = 'NOT_NEEDED' | 'ALLOWED' | 'BLOCKED_UNTIL_PRICED';

export function spendSubmissionOf(
  policy: Pick<RequestPolicy, 'chain'>,
  pricingStatus: 'NOT_APPLICABLE' | 'PRICED' | 'MISSING',
): SpendSubmission {
  if (!hasSpendStep(policy)) return 'NOT_NEEDED';

  return pricingStatus === 'PRICED' ? 'ALLOWED' : 'BLOCKED_UNTIL_PRICED';
}

/** A term over twelve months needs the head to confirm it in so many words; the chain gains no step (`US-05-01` AC-4, OI-07a). */
export const termNeedsConfirmation = (termMonths: number): boolean => termMonths > LONG_TERM_MONTHS;
