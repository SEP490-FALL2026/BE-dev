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

const waiting = (
  routingRow: number,
  waitingReason: NonNullable<NewNeedStep['waitingReason']>,
  slaWorkingDays: number,
): NewNeedStep => ({
  state: 'WAITING',
  assigneeEmployeeId: null,
  routingRow,
  waitingReason,
  samePersonAsSpend: false,
  slaWorkingDays,
});

export function planNeedSteps<Line extends { employeeId: string }>(
  input: NeedRoutingInput<Line>,
): PlannedNeedStep<Line>[] {
  const { headEmployeeId, slaWorkingDays } = input;
  const others = input.lines.filter((line) => line.employeeId !== headEmployeeId);
  const own = input.lines.filter((line) => line.employeeId === headEmployeeId);
  const planned: PlannedNeedStep<Line>[] = [];

  if (others.length > 0) {
    if (input.senderIsHead) {
      planned.push({
        lines: others,
        confirmedBySending: true,
        step: held(input.senderEmployeeId, SENT_BY_HEAD_ROW, slaWorkingDays),
      });
    } else {
      const decision = routeNeedStep(input.facts);
      // The one who would decide the people is never one of them: a fallback approver named among them leaves the step waiting.
      const named =
        decision.outcome === 'ASSIGNED' && others.some((line) => line.employeeId === decision.assigneeEmployeeId);
      planned.push({
        lines: others,
        confirmedBySending: false,
        step:
          decision.outcome === 'ASSIGNED' && !named
            ? held(
                decision.assigneeEmployeeId,
                decision.row === 1 ? SENT_BY_EMPLOYEE_ROW : decision.row,
                slaWorkingDays,
              )
            : waiting(8, decision.outcome === 'WAITING' ? decision.reason : 'FALLBACK_IS_REQUESTER', slaWorkingDays),
      });
    }
  }
  if (own.length > 0 && headEmployeeId !== null) {
    const decision = routeNeedStep({ ...input.facts, requesterEmployeeId: headEmployeeId });
    planned.push({
      lines: own,
      confirmedBySending: false,
      step:
        decision.outcome === 'ASSIGNED'
          ? held(decision.assigneeEmployeeId, decision.row, slaWorkingDays)
          : waiting(decision.row, decision.reason, slaWorkingDays),
    });
  }

  return planned;
}
