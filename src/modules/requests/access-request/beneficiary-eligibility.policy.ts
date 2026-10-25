import type { BusinessDate } from '../../../core/business-date';

/**
 * What a person must have to be given access by a request somebody else sends for them (`US-03-02`, `US-05-17` AC-8), as a
 * pure decision shared by the head who sends for the people of the department and the request for a group: the person still
 * works here, has a work email, and, when they are a contractor, a freelancer or an intern, has the day their access ends. The
 * first reason is returned, in the order a caller should learn it.
 */

/** The employment types that end on a day the sender must name (`INV-07`, `FR-2.8`). */
const TIME_LIMITED: ReadonlySet<string> = new Set(['CONTRACTOR', 'FREELANCER', 'INTERN']);

export type BeneficiaryRefusal =
  /** The person has left the company. */
  | 'NOT_ACTIVE'
  /** The person has no work email yet. */
  | 'EMAIL_REQUIRED'
  /** A contractor, freelancer or intern needs the day the access ends. */
  | 'END_DATE_REQUIRED'
  /** The day the access ends is before the day it can begin. */
  | 'END_DATE_TOO_EARLY';

export interface BeneficiaryFacts {
  active: boolean;
  workEmail: string | null;
  employmentType: string;
  /** The day the person starts: the access cannot begin before it. */
  hireDate: BusinessDate;
  today: BusinessDate;
  expectedEndDate: BusinessDate | undefined;
}

/**
 * The first reason the person cannot be given access by another's request, or null. `skipContact` is for the share of the head
 * in their own request, which asks for no email and no end date of anyone else (`US-03-02` AC-8).
 */
export function checkBeneficiary(
  facts: BeneficiaryFacts,
  options: { skipContact: boolean },
): BeneficiaryRefusal | null {
  if (!facts.active) return 'NOT_ACTIVE';
  if (options.skipContact) return null;

  if (facts.workEmail === null || facts.workEmail.trim() === '') return 'EMAIL_REQUIRED';
  if (TIME_LIMITED.has(facts.employmentType)) {
    if (facts.expectedEndDate === undefined) return 'END_DATE_REQUIRED';
    const begins = facts.hireDate > facts.today ? facts.hireDate : facts.today;
    if (facts.expectedEndDate < begins) return 'END_DATE_TOO_EARLY';
  }

  return null;
}
