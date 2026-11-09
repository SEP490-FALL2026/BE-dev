import type { GrantRequestAnswer } from '../../licensing/public/licensing.types';
import type { LineState } from '../access-request/group-request.types';
import type { AccessRequestBranchCode } from '../access-request/access-request.policy';
import type {
  AccessRequestKind,
  AccessRequestState,
  ServiceAccountRecord,
} from '../access-request/access-request.types';

/**
 * What the state of a request says to the grant of a seat (`US-07-01` AC-3, AC-16): only a request whose need and spend
 * decisions are all taken, and that nobody has granted yet, may be granted. A request still being decided is _not
 * approved enough_; one that was refused or that has already been granted, completed or closed is _ended_. The request of
 * a service account is granted only once the IT Admin accepted that it is a non-human subject (`US-05-21` AC-3), and it is
 * granted to the person who answers for it as a service seat. The request for the renewal of a right is never granted: its
 * approval writes the record that follows the old one and ends it (`US-05-14`), so there is nothing for the IT Admin to carry out.
 * A request for a group is granted one person at a time, and what it says is what the line of that person says: approved is
 * grantable, still being decided is not approved enough, and any other state of the line means it is over (`US-05-17` AC-6).
 */
export function grantAnswerFor(
  request: {
    type?: AccessRequestKind;
    branch: AccessRequestBranchCode;
    state: AccessRequestState;
    beneficiaryEmployeeIds: readonly string[];
    planId: string | null;
    expectedEndDate: string | null;
    termMonths: number;
    departmentId: string;
    costCenterId: string | null;
    serviceAccount: ServiceAccountRecord | null;
    lines?: readonly { employeeId: string; state: LineState; expectedEndDate: string | null }[];
  },
  employeeId?: string,
): GrantRequestAnswer {
  if (request.type === 'GROUP_GRANT') return groupAnswerFor(request, employeeId);

  switch (request.state) {
    case 'AWAITING_EXECUTION': {
      if (request.type === 'RENEWAL') return { status: 'ENDED' };
      // Software that was proposed and approved has no plan until the IT Admin registers it and links it (`US-05-06` AC-8).
      if (request.planId === null) return { status: 'NOT_IN_CATALOG' };
      const { planId, expectedEndDate, serviceAccount } = request;
      if (serviceAccount === null) {
        return {
          status: 'GRANTABLE',
          seat: 'PERSONAL',
          employeeId: request.beneficiaryEmployeeIds[0],
          planId,
          departmentId: request.departmentId,
          expectedEndDate,
          termMonths: request.termMonths,
          // Free internal software has no end by term; anything that costs money ends with its term.
          termBound: request.branch !== 'INTERNAL_FREE',
        };
      }
      if (serviceAccount.boundaryState !== 'ACCEPTED') return { status: 'BOUNDARY_NOT_CHECKED' };
      // The seat of a service account is charged to the Unit of its department: the request of one always carries it (the table checks it).
      if (request.costCenterId === null) throw new Error('The request of a service account has no Cost Center.');

      return {
        status: 'GRANTABLE',
        seat: 'SERVICE',
        employeeId: serviceAccount.responsibleEmployeeId,
        planId,
        expectedEndDate,
        termMonths: request.termMonths,
        termBound: false,
        serviceAccount: {
          purpose: serviceAccount.purpose,
          expectedIdentifier: serviceAccount.expectedIdentifier,
          departmentId: request.departmentId,
          costCenterId: request.costCenterId,
        },
      };
    }
    // `DRAFT` is not readable in this release and never reaches here; if it did, nothing about it is approved.
    case 'DRAFT':
    case 'PENDING':
    case 'WAITING_CONTROLLED':
    case 'AWAITING_IT_ASSESSMENT':
    case 'AWAITING_SPEND_SUBMISSION':
    case 'AWAITING_FINANCE_REVIEW':
    case 'AWAITING_BUDGET':
    case 'AWAITING_SPEND_DECISION':
      return { status: 'NOT_APPROVED' };
    case 'REJECTED':
    case 'IT_REJECTED':
    case 'EXECUTING':
    case 'COMPLETED':
    case 'FAILED':
    case 'AWAITING_IT_CLOSE':
    case 'WITHDRAWN':
    case 'CANCELLED':
      return { status: 'ENDED' };
  }
}

function groupAnswerFor(
  request: {
    state: AccessRequestState;
    planId: string | null;
    departmentId: string;
    termMonths: number;
    lines?: readonly { employeeId: string; state: LineState; expectedEndDate: string | null }[];
  },
  employeeId: string | undefined,
): GrantRequestAnswer {
  if (employeeId === undefined) return { status: 'BENEFICIARY_REQUIRED' };
  const line = (request.lines ?? []).find((candidate) => candidate.employeeId === employeeId);
  if (!line) return { status: 'NOT_FOUND' };

  switch (line.state) {
    case 'AWAITING_NEED':
    case 'NEED_CONFIRMED':
      return { status: 'NOT_APPROVED' };
    case 'APPROVED':
      if (request.planId === null) return { status: 'NOT_IN_CATALOG' };

      return {
        status: 'GRANTABLE',
        seat: 'PERSONAL',
        employeeId: line.employeeId,
        planId: request.planId,
        departmentId: request.departmentId,
        expectedEndDate: line.expectedEndDate,
        termMonths: request.termMonths,
        // A request for a group is only for paid software.
        termBound: true,
      };
    default:
      return { status: 'ENDED' };
  }
}
