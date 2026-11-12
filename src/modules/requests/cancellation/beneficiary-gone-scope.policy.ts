import type { AccessRequestBranchCode } from '../access-request/access-request.policy';
import {
  NOT_OPEN_FOR_LEAVER,
  type AccessRequestKind,
  type AccessRequestState,
} from '../access-request/access-request.types';
import { OPEN_LINE_STATES, type LineState, type SystemCancelCause } from '../access-request/group-request.types';
import type { BeneficiaryGoneScope } from '../public/requests.types';

/**
 * Which requests of a person who is gone the system closes (`BeneficiaryGoneCancellation`, `QĐ-110d`, `QĐ-110o`, M-12):
 * - `ALL_OPEN` (MF-2, the day access is blocked): every open request of the person, whatever it asks for and costs;
 * - `PAID_OLD_DEPARTMENT` (MF-3, the day the transfer takes effect): the paid requests (`GRANT`, `RENEWAL`, a group) sent from the
 *   department the person left, which keeps what it paid for; a request of the new department, a free one and a proposal of new software
 *   are not touched.
 */
export type GoneScope = BeneficiaryGoneScope;

/** The kinds of request the transfer of a person reaches: the paid ones that ask for a seat or for more time on one. */
const PAID_KINDS: readonly AccessRequestKind[] = ['GRANT', 'RENEWAL', 'GROUP_GRANT'];

/** What is known of the request when it is judged, read under its lock. */
export interface GoneRequestFacts {
  type: AccessRequestKind;
  branch: AccessRequestBranchCode;
  /** The department the request was sent from, which a paid request keeps. */
  departmentId: string;
  state: AccessRequestState;
}

/**
 * What the system does to a request, or to the line of the person in a request for a group:
 * - `CANCEL`: no grant task has begun, so the request (or the line) ends as cancelled and what was held for it goes back to the budget;
 * - `NEEDS_IT_CHECK`: a task of the grant is alive on the request (see `hasLiveTask`), so nothing is cancelled: the vendor may already have
 *   sent the invitation, and a task that stays alive under a cancelled request would be completed with nothing held for it. The IT Admin
 *   checks it and closes the request by hand, which cancels the task with the request;
 * - `SKIP`: outside the scope, or not open (over, a draft, a withdrawal waiting for the IT Admin, no line of the person).
 */
export type GoneVerdict = 'CANCEL' | 'NEEDS_IT_CHECK' | 'SKIP';

function inScope(scope: GoneScope, request: GoneRequestFacts): boolean {
  if (scope.kind === 'ALL_OPEN') return true;

  return (
    request.branch === 'PAID_IN_CATALOG' &&
    PAID_KINDS.includes(request.type) &&
    request.departmentId === scope.oldDepartmentId
  );
}

/**
 * Whether a task of the grant, or of the extension of a renewal, is alive on the request, from its state under the lock: a grant makes its
 * task in the move to `EXECUTING`, and the approval of a renewal opens the task that extends the right (`EXTEND`, `BR-MF1-08d`) in the
 * transaction that moves it to `AWAITING_EXECUTION`, where it waits for the IT Admin. A renewal never waits there without it: when the task
 * cannot be opened the request fails (`RenewalApplyService`).
 */
function hasLiveTask(request: GoneRequestFacts): boolean {
  return request.state === 'EXECUTING' || (request.type === 'RENEWAL' && request.state === 'AWAITING_EXECUTION');
}

/**
 * The verdict on one request of the person. A request for a group is judged by the line of the person (`line`, null when they have none),
 * since the others carry on; any other request by its own state. A task is alive when the request is `EXECUTING` (or the line is), or when
 * it is a renewal that waits for its extension.
 */
export function verdictOf(scope: GoneScope, request: GoneRequestFacts, line: LineState | null): GoneVerdict {
  if (!inScope(scope, request)) return 'SKIP';
  if (request.type === 'GROUP_GRANT') return line === null ? 'SKIP' : byState(OPEN_LINE_STATES, line);
  if (request.state === 'DRAFT' || NOT_OPEN_FOR_LEAVER.includes(request.state)) return 'SKIP';

  return hasLiveTask(request) ? 'NEEDS_IT_CHECK' : 'CANCEL';
}

function byState(open: readonly LineState[], line: LineState): GoneVerdict {
  if (!open.includes(line)) return 'SKIP';

  return line === 'EXECUTING' ? 'NEEDS_IT_CHECK' : 'CANCEL';
}

/** Why the request ends: the departure for the person who left, the transfer for the one who was moved. */
export function goneCauseOf(scope: GoneScope): SystemCancelCause {
  return scope.kind === 'ALL_OPEN' ? 'SYSTEM_BENEFICIARY_LEFT' : 'SYSTEM_BENEFICIARY_TRANSFERRED';
}
