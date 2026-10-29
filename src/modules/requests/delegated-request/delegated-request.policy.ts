import type { BusinessDate } from '../../../core/business-date';
import { checkBeneficiary } from './beneficiary-eligibility.policy';

/**
 * The rules of a head sending requests for the people of the department (`US-03-02`, `US-05-03` rows 5 to 7), as pure
 * decisions: who may send them for whom, and what the person must have. A head who sends for another has the need step
 * confirmed by the sending itself, because the head is the one who would have confirmed it; the head who is among the people
 * it is for is not confirmed that way (`AC-8`).
 */

export type DelegationRefusal =
  /** The caller does not head the department they belong to today (`AC-11`). */
  | 'NOT_HEAD'
  /** The person is not in the department of the head: the request is refused at once, with no request for them (`US-05-03` row 7, `AC-5`). */
  | 'OUTSIDE_DEPARTMENT'
  /** The person has no work email yet (`AC-3`). */
  | 'EMAIL_REQUIRED'
  /** The person has left the company. */
  | 'BENEFICIARY_NOT_ACTIVE'
  /** A contractor, freelancer or intern needs the day the access ends (`AC-10`). */
  | 'END_DATE_REQUIRED'
  /** The day the access ends is before the day it can begin. */
  | 'END_DATE_TOO_EARLY'
  /** A long term is confirmed in so many words by whoever confirms the need (`OI-07a`). */
  | 'TERM_CONFIRMATION_REQUIRED';

export interface DelegationFacts {
  actorEmployeeId: string;
  /** The department the caller heads today; null when they head none. */
  actorHeadedDepartmentId: string | null;
  beneficiaryEmployeeId: string;
  /** The department of the person on the day, null when they have none. */
  beneficiaryDepartmentId: string | null;
  beneficiaryActive: boolean;
  beneficiaryWorkEmail: string | null;
  beneficiaryEmploymentType: string;
  /** The day the person starts: the access cannot begin before it. */
  beneficiaryHireDate: BusinessDate;
  today: BusinessDate;
  expectedEndDate: BusinessDate | undefined;
  termMonths: number;
  termConfirmed: boolean;
  longTermMonths: number;
}

/** Whether the person is the head themselves: their share goes the way of a head's own request, not by the sending. */
export const isHeadOwnShare = (facts: Pick<DelegationFacts, 'actorEmployeeId' | 'beneficiaryEmployeeId'>): boolean =>
  facts.actorEmployeeId === facts.beneficiaryEmployeeId;

/** The first reason the head may not send for this person, in the order a caller should learn it, or null. */
export function checkDelegation(facts: DelegationFacts): DelegationRefusal | null {
  if (facts.actorHeadedDepartmentId === null) return 'NOT_HEAD';
  if (facts.beneficiaryDepartmentId !== facts.actorHeadedDepartmentId) return 'OUTSIDE_DEPARTMENT';
  // The head's own share is a request of the head: it asks for no email and no end date of anyone else.
  const own = isHeadOwnShare(facts);
  const refusal = checkBeneficiary(
    {
      active: facts.beneficiaryActive,
      workEmail: facts.beneficiaryWorkEmail,
      employmentType: facts.beneficiaryEmploymentType,
      hireDate: facts.beneficiaryHireDate,
      today: facts.today,
      expectedEndDate: facts.expectedEndDate,
    },
    { skipContact: own },
  );
  if (refusal === 'NOT_ACTIVE') return 'BENEFICIARY_NOT_ACTIVE';
  if (refusal !== null) return refusal;
  if (!own && facts.termMonths > facts.longTermMonths && !facts.termConfirmed) return 'TERM_CONFIRMATION_REQUIRED';

  return null;
}
