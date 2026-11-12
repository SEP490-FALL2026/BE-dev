import type { ProvisioningKind } from '../../licensing/public/licensing.types';
import type { AccessRequestState } from '../access-request/access-request.types';

/**
 * The rules of the return of a seat (`US-05-13`): who may return which seat, when a seat may be returned, and when a return
 * names the request it follows. Pure: the services read the facts and write what these decide.
 */

export type ReturnSource = 'EMPLOYEE_RETURN' | 'HEAD_CONFIRMATION';

export type SenderRefusal =
  /** Neither the holder nor the head of the department of the holder. */
  | 'NOT_HOLDER'
  /** The head of another department (`AC-5`). */
  | 'OUTSIDE_DEPARTMENT';

export type SenderVerdict = { ok: true; source: ReturnSource } | { ok: false; refusal: SenderRefusal };

/**
 * Who sends the return. The holder returns their own seat, whether or not their department has a head (`AC-9`); the head of the
 * department the holder belongs to today confirms that the seat is no longer needed (`AC-2`); nobody else does, and a head of
 * another department is told so apart from a person with no standing at all (`AC-5`).
 */
export function checkSender(facts: {
  actorEmployeeId: string;
  holderEmployeeId: string;
  holderDepartmentId: string | null;
  /** The department the actor heads today; null when they head none. */
  actorHeadedDepartmentId: string | null;
}): SenderVerdict {
  if (facts.actorEmployeeId === facts.holderEmployeeId) return { ok: true, source: 'EMPLOYEE_RETURN' };
  if (facts.actorHeadedDepartmentId === null) return { ok: false, refusal: 'NOT_HOLDER' };
  if (facts.actorHeadedDepartmentId === facts.holderDepartmentId) return { ok: true, source: 'HEAD_CONFIRMATION' };

  return { ok: false, refusal: 'OUTSIDE_DEPARTMENT' };
}

export type ReturnableProblem =
  /** Ended, failed or cancelled: no seat is held. */
  | 'NOT_OPEN'
  /** The right of a service account is answered for by a person and is not returned like a seat (`US-03-08`). */
  | 'SERVICE_ACCOUNT'
  /** K3 is not granted yet; a K4 key goes back to the store like any seat (`QĐ-103d`). */
  | 'PLAN_NOT_SUPPORTED'
  /** The grant was not carried out: a seat that is not real is withdrawn, not returned (`US-05-08`). */
  | 'GRANT_NOT_COMPLETED';

/** The first reason the seat cannot be returned, or null when it can. */
export function checkReturnable(facts: {
  open: boolean;
  kind: 'PERSONAL' | 'SERVICE';
  provisioningType: ProvisioningKind;
  grant: 'NONE' | 'COMPLETED' | 'NOT_COMPLETED';
}): ReturnableProblem | null {
  if (!facts.open) return 'NOT_OPEN';
  if (facts.kind === 'SERVICE') return 'SERVICE_ACCOUNT';
  if (facts.provisioningType === 'K3') return 'PLAN_NOT_SUPPORTED';
  if (facts.grant === 'NOT_COMPLETED') return 'GRANT_NOT_COMPLETED';

  return null;
}

/**
 * Whether a return may name the request it follows (`US-05-08`): the request exists, the person has a part in it (they sent it or
 * it is for them), it is done, and the grant that made it is the one that made this seat.
 */
export function originMatches(facts: {
  actorEmployeeId: string;
  request: { state: AccessRequestState; requesterEmployeeId: string; beneficiaryEmployeeIds: readonly string[] } | null;
  /** The request the grant of the seat answered for; null for a seat no grant made. */
  grantRequestId: string | null;
  fromRequestId: string;
}): boolean {
  const { request } = facts;
  if (request === null || request.state !== 'COMPLETED' || facts.grantRequestId !== facts.fromRequestId) return false;

  return (
    request.requesterEmployeeId === facts.actorEmployeeId ||
    request.beneficiaryEmployeeIds.includes(facts.actorEmployeeId)
  );
}

/** Who reads a return: the holder, the one who sent it, the head of the department of the holder, and the IT Admin. */
export function mayReadReturn(facts: {
  actorEmployeeId: string;
  roles: readonly string[];
  holderEmployeeId: string;
  requestedByEmployeeId: string;
  returnDepartmentId: string;
  actorHeadedDepartmentId: string | null;
}): boolean {
  return (
    facts.roles.includes('IT_ADMIN') ||
    facts.actorEmployeeId === facts.holderEmployeeId ||
    facts.actorEmployeeId === facts.requestedByEmployeeId ||
    facts.actorHeadedDepartmentId === facts.returnDepartmentId
  );
}

/**
 * Whether the person may confirm the handover of the data of a return (`US-05-13` AC-6, `QĐ-62f`): only the person who sent it, while the
 * revocation is awaited, for a plan whose removal loses data, and once. The first that is wrong, in the order a caller should learn it.
 */
export function handoverConfirmRefusal(
  actorEmployeeId: string,
  found: {
    requestedByEmployeeId: string;
    state: string;
    handoverRequired: boolean;
    handoverConfirmedAt: Date | null;
  },
): 'NOT_REQUESTER' | 'NOT_AWAITING' | 'HANDOVER_NOT_REQUIRED' | 'HANDOVER_ALREADY_CONFIRMED' | null {
  if (actorEmployeeId !== found.requestedByEmployeeId) return 'NOT_REQUESTER';
  if (found.state !== 'AWAITING_REVOCATION') return 'NOT_AWAITING';
  if (!found.handoverRequired) return 'HANDOVER_NOT_REQUIRED';
  if (found.handoverConfirmedAt !== null) return 'HANDOVER_ALREADY_CONFIRMED';

  return null;
}

/** Whether the handover is confirmed by its deadline: there is none, or today is not after it. */
export const handoverOnTime = (dueOn: string | null, today: string): boolean => dueOn === null || today <= dueOn;

/** What the audit entry `RETURN_REQUEST.SUBMITTED` says: who, which seat and which task; the reason is never in it. */
export function returnSubmittedDetail(created: {
  id: string;
  assignmentId: string;
  planId: string;
  holderEmployeeId: string;
  requestedByEmployeeId: string;
  source: string;
  departmentId: string;
  revocationTaskId: string;
  revocationTaskCreated: boolean;
  originRequestId: string | null;
}): { [key: string]: string | boolean | null } {
  return {
    returnRequestId: created.id,
    assignmentId: created.assignmentId,
    planId: created.planId,
    holderEmployeeId: created.holderEmployeeId,
    requestedByEmployeeId: created.requestedByEmployeeId,
    source: created.source,
    departmentId: created.departmentId,
    revocationTaskId: created.revocationTaskId,
    revocationTaskCreated: created.revocationTaskCreated,
    originRequestId: created.originRequestId,
  };
}
