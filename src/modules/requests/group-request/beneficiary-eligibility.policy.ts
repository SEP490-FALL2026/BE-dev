/**
 * What a person must have to be given access by a request somebody else sends for them (`US-03-02`, `US-05-17` AC-8), as a
 * pure decision shared by the head who sends for the people of the department and the request for a group: the person still
 * works here and has a work email. The
 * first reason is returned, in the order a caller should learn it.
 */

export type BeneficiaryRefusal =
  /** The person has left the company. */
  | 'NOT_ACTIVE'
  /** The person has no work email yet. */
  | 'EMAIL_REQUIRED';

export interface BeneficiaryFacts {
  active: boolean;
  workEmail: string | null;
  employmentType: string;
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
  return null;
}
