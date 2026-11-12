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
 * - `NEEDS_IT_CHECK`: the grant is being carried out, so nothing is cancelled: the vendor may already have sent the invitation, and the IT
 *   Admin checks it and closes the request by hand;
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
 * The verdict on one request of the person. A request for a group is judged by the line of the person (`line`, null when they have none),
 * since the others carry on; any other request by its own state. The grant is being carried out exactly when the request is `EXECUTING`
 * (or the line is): it is the move that makes the task of the grant.
 */
export function verdictOf(scope: GoneScope, request: GoneRequestFacts, line: LineState | null): GoneVerdict {
  if (!inScope(scope, request)) return 'SKIP';
  if (request.type === 'GROUP_GRANT') return line === null ? 'SKIP' : byState(OPEN_LINE_STATES, line);
  if (request.state === 'DRAFT' || NOT_OPEN_FOR_LEAVER.includes(request.state)) return 'SKIP';

  return request.state === 'EXECUTING' ? 'NEEDS_IT_CHECK' : 'CANCEL';
}

function byState(open: readonly LineState[], line: LineState): GoneVerdict {
  if (!open.includes(line)) return 'SKIP';

  return line === 'EXECUTING' ? 'NEEDS_IT_CHECK' : 'CANCEL';
}

/** Why the request ends: the departure for the person who left, the transfer for the one who was moved. */
export function goneCauseOf(scope: GoneScope): SystemCancelCause {
  return scope.kind === 'ALL_OPEN' ? 'SYSTEM_BENEFICIARY_LEFT' : 'SYSTEM_BENEFICIARY_TRANSFERRED';
}
