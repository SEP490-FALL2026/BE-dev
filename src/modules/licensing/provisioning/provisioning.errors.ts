import type { DocumentAttachProblem } from '../../catalog/public/catalog.errors';
import type { K1ChecklistExpectation } from '../public/licensing.types';

/**
 * The person who works the provisioning queue is not an IT Admin (`QĐ-87a`, `SoD-1`): the role is checked by the policy of
 * the work itself, so no caller that skips the role guard of a route reaches a task. Answered as the guard answers it.
 */
export class ProvisioningItAdminRequiredError extends Error {
  constructor() {
    super('Only an IT Admin works the provisioning queue.');
    this.name = 'ProvisioningItAdminRequiredError';
  }
}

/**
 * The key of a K4 grant (`BR-MF1-09`, `QĐ-103d`): the completion of a K4 grant names the key of the store it gives the seat, and the
 * completion of any other kind names none.
 */
export class ProvisioningKeyError extends Error {
  constructor(readonly problem: 'KEY_REQUIRED' | 'KEY_NOT_APPLICABLE') {
    super(
      problem === 'KEY_REQUIRED'
        ? 'The grant of a K4 seat is completed with the key of the store it gives (licenseKeyId).'
        : 'Only the grant of a K4 seat is completed with a license key.',
    );
    this.name = 'ProvisioningKeyError';
  }
}

export type ProvisioningK1ChecklistProblem =
  /** A step of the checklist is missing (not ticked, or ticked with no time), or there is no evidence, or the checklist is not sent. */
  | 'K1_CHECKLIST_INCOMPLETE'
  /** A step is timed before one that comes first in the list. */
  | 'K1_CHECKLIST_OUT_OF_ORDER'
  /** A step this grant does not have, a step sent twice, or a checklist sent for a grant that has none. */
  | 'K1_CHECKLIST_NOT_ALLOWED';

/**
 * The checklist that completes the grant of a K1 seat is refused (`QĐ-111az`, `US-07-01` AC-7). A refusal of the checklist of a K1 grant carries what
 * the server expects of it (`expected`, the `details` of the answer); a grant of another kind has no checklist, so nothing is expected.
 */
export class ProvisioningK1ChecklistError extends Error {
  constructor(
    readonly problem: ProvisioningK1ChecklistProblem,
    readonly expected?: K1ChecklistExpectation,
  ) {
    super(`The checklist of the grant is not valid: ${problem}.`);
    this.name = 'ProvisioningK1ChecklistError';
  }
}

/**
 * The caller is not an acting IT Admin (neither the usable IT Admin in charge nor an appointed substitute)
 * for the department of the task's beneficiary.
 */
export class ProvisioningNotInChargeError extends Error {
  constructor() {
    super('Only the IT Admin in charge or an appointed substitute for this department may act on this task.');
    this.name = 'ProvisioningNotInChargeError';
  }
}

export type ProvisioningEvidenceFileProblem = 'TOO_MANY' | 'DUPLICATE' | DocumentAttachProblem;
export class ProvisioningEvidenceFileInvalidError extends Error {
  constructor(readonly problem: ProvisioningEvidenceFileProblem) {
    super(`The evidence file is not valid (${problem}).`);
    this.name = 'ProvisioningEvidenceFileInvalidError';
  }
}
