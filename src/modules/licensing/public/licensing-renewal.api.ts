import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AssignmentRenewalService } from '../assignment/renewal/assignment-renewal.service';
import type { AssignmentFacts, RenewAssignmentInput, RenewedAssignment } from './licensing-renewal.types';
import { RenewalHoldHook } from './licensing.extension-points';

/**
 * The licensing facade for the renewal of a seat that has an end date (`US-05-14`): what the seat is judged by, the renewal itself, and
 * whether one waits for its decision.
 */
@Injectable()
export class LicensingRenewalApi {
  constructor(
    private readonly renewals: AssignmentRenewalService,
    private readonly renewalHold: RenewalHoldHook,
  ) {}

  /**
   * A seat as the return and the renewal of it judge it: its dates, whether it is open, the chain of records before it, what the
   * grant it was made for is, and whether a revocation of it is under way. With `lock` it is read under the lock of the
   * subscription and then of the assignment, which is how a renewal is asked for. Throws AssignmentNotFoundError.
   */
  getAssignmentFacts(tx: DbTx, assignmentId: string, options: { lock?: boolean } = {}): Promise<AssignmentFacts> {
    return this.renewals.read(tx, assignmentId, options.lock ?? false);
  }

  /**
   * Renews a seat that has an end date (`US-05-14`): the old record ends where the right was expected to end, or today when the
   * decision comes later, and a new record of the same seat begins that day, chained to it; the old one keeps the end it had. The
   * seats taken on any day do not change. Done in the transaction of the request that was approved. Throws
   * AssignmentNotFoundError, AssignmentRenewalRefusedError and AssignmentConflictError.
   */
  renewAssignment(tx: DbTx, actor: AuthenticatedPrincipal, input: RenewAssignmentInput): Promise<RenewedAssignment> {
    return this.renewals.renew(tx, actor, input);
  }

  /**
   * Whether a seat has a renewal waiting for its decision: the revocation of a right that has reached its end leaves it alone
   * while one does (`US-05-14` AC-4), as the module of requests answers it (`RenewalHoldHook`).
   */
  hasPendingRenewal(assignmentId: string, tx?: DbTx): Promise<boolean> {
    return this.renewalHold.get().hasPendingRenewal(assignmentId, tx);
  }
}
