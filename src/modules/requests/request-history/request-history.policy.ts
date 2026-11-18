import type { RequestScope } from '../my-requests/my-requests.types';
import { REQUEST_HISTORY_FLAGS, type RequestHistoryFlag } from './request-history.types';

/**
 * What the roles of a caller of `accessRequestList` reach (`SoD-3`, `SoD-7`): an IT Admin every request sent in the organization; a
 * spending approver the requests a spend step was opened on, one-step requests included, decided or not; Finance the requests whose spend
 * was approved, so a commitment was made (released since or not). A caller who holds more than one of these roles reads the union.
 */
export function oversightScopeOf(roles: readonly string[]): Extract<RequestScope, { kind: 'OVERSIGHT' }> {
  return {
    kind: 'OVERSIGHT',
    all: roles.includes('IT_ADMIN'),
    spendStepOpened: roles.includes('SPENDING_APPROVER'),
    spendApproved: roles.includes('FINANCE'),
  };
}

/** The flags a `flag` parameter names: comma-separated, each a flag of the history, none twice. Null when it is not such a list. */
export function parseFlagList(value: string): RequestHistoryFlag[] | null {
  const names = value.split(',');
  const flags = names.filter((name): name is RequestHistoryFlag =>
    (REQUEST_HISTORY_FLAGS as readonly string[]).includes(name),
  );

  return flags.length === names.length && new Set(flags).size === flags.length ? flags : null;
}

/** Whether a `flag` parameter is such a list (the DTO refuses what is not). */
export const isFlagList = (value: string): boolean => parseFlagList(value) !== null;

/**
 * Whether a request of the department waits for its head now: the need step they hold, or the request approved and waiting in the queue
 * of the head to be sent on as spend. The head of the department today is the caller of the department history.
 */
export function awaitsHead(
  row: { state: string; needStep: { state: string; assigneeEmployeeId: string | null } },
  headEmployeeId: string,
): boolean {
  return (
    (row.needStep.state === 'PENDING' && row.needStep.assigneeEmployeeId === headEmployeeId) ||
    row.state === 'AWAITING_SPEND_SUBMISSION'
  );
}
