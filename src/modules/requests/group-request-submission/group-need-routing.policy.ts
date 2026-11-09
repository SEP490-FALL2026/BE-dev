import type { AccessRequestBranchCode } from '../access-request/access-request.policy';
import { nextRequestState } from '../access-request/need-decision.policy';
import type { NewNeedStep } from '../access-request/access-request.types';
import { routeNeedStep, type RoutingFacts } from '../access-request/routing.policy';

/**
 * The need steps the people of a request for a group go to (`US-05-03` AC-8, AC-14, `US-05-17` AC-3, AC-11, AC-16), as a pure decision.
 * The people other than the head go to a step of the head of the department; the head, when named, goes to a step of their own,
 * routed as a head's own request is, so that nobody decides their own line. A head who sends confirms the first step by sending, since
 * they are the one who would have confirmed it; an Employee who sends leaves it to the head. Each step has exactly one holder.
 */

/** The row of the routing table for a head who sends for others: the same as for a request sent for the people of a department. */
export const SENT_BY_HEAD_ROW = 5;
/** The row for the people of a group an Employee sent: the head of the department decides them. */
export const SENT_BY_EMPLOYEE_ROW = 9;

export interface PlannedNeedStep<Line extends { employeeId: string }> {
  /** The people this step holds, in the order they were named. */
  lines: Line[];
  step: NewNeedStep;
  /** Decided by sending: the head who sends for others confirms them by sending. */
  confirmedBySending: boolean;
}

export interface NeedRoutingInput<Line extends { employeeId: string }> {
  senderEmployeeId: string;
  /** The sender heads the department on the day. */
  senderIsHead: boolean;
  /** Who heads the department on the day, whether or not they can still act; null when it has none. */
  headEmployeeId: string | null;
  lines: readonly Line[];
  /** What the routing table reads on the day, for the sender as the requester. */
  facts: RoutingFacts;
  slaWorkingDays: number;
}

const held = (assigneeEmployeeId: string, routingRow: number, slaWorkingDays: number): NewNeedStep => ({
  state: 'PENDING',
  assigneeEmployeeId,
  routingRow,
  waitingReason: null,
  samePersonAsSpend: false,
  slaWorkingDays,
});

export function planNeedSteps<Line extends { employeeId: string }>(
  input: NeedRoutingInput<Line>,
): PlannedNeedStep<Line>[] {
  const { slaWorkingDays } = input;
  if (input.senderIsHead) return [{ lines: [...input.lines], confirmedBySending: true, step: held(input.senderEmployeeId, SENT_BY_HEAD_ROW, slaWorkingDays) }];
  const decision = routeNeedStep(input.facts);
  const oneStep = decision.outcome === 'NOT_REQUIRED';
  const planned: PlannedNeedStep<Line>[] = [{
    lines: [...input.lines], confirmedBySending: false,
    step: decision.outcome === 'ASSIGNED'
      ? held(decision.assigneeEmployeeId, SENT_BY_EMPLOYEE_ROW, slaWorkingDays)
      : { state: oneStep ? 'NOT_REQUIRED' : 'WAITING', assigneeEmployeeId: null, routingRow: decision.row, waitingReason: decision.reason, samePersonAsSpend: false, slaWorkingDays },
  }];

  return planned;
}

/**
 * The state the request starts in: with every person confirmed by sending it goes on to what follows the need; otherwise it waits under
 * control when every step still open waits for somebody, and is pending when any has somebody who can decide it.
 */
export function groupStartState<Line extends { employeeId: string }>(
  planned: readonly PlannedNeedStep<Line>[],
  branch: AccessRequestBranchCode,
): ReturnType<typeof nextRequestState> | 'WAITING_CONTROLLED' | 'PENDING' {
  const open = planned.filter((entry) => !entry.confirmedBySending);
  if (open.length === 0) return nextRequestState(branch);

  return open.every((entry) => entry.step.state === 'WAITING') ? 'WAITING_CONTROLLED' : 'PENDING';
}

/** The row of each person of the request: confirmed when the head confirmed them by sending, waiting for their need otherwise. */
export function groupLineRowsOf<Line extends { employeeId: string; expectedEndDate?: string | null }>(
  requestId: string,
  planned: readonly PlannedNeedStep<Line>[],
  stepIds: readonly string[],
): {
  requestId: string;
  employeeId: string;
  state: 'AWAITING_NEED' | 'NEED_CONFIRMED';
  needStepId: string;
  expectedEndDate: string | null;
}[] {
  return planned.flatMap((entry, index) =>
    entry.lines.map((line) => ({
      requestId,
      employeeId: line.employeeId,
      state: entry.confirmedBySending || entry.step.state === 'NOT_REQUIRED' ? ('NEED_CONFIRMED' as const) : ('AWAITING_NEED' as const),
      needStepId: stepIds[index],
      expectedEndDate: line.expectedEndDate ?? null,
    })),
  );
}
