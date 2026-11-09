import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AssignmentRenewalService } from '../assignment/renewal/assignment-renewal.service';
import type { BusinessDate } from '../../../core/business-date';
import { ExpiryRenewalWindowRepo } from '../expiry/expiry-renewal-window.repo';
import { ProvisioningExtensionService } from '../provisioning/tasks/provisioning-extension.service';
import type { AssignmentFacts, RenewAssignmentInput, RenewedAssignment } from './licensing-renewal.types';
import { RenewalHoldHook } from './licensing.extension-points';
import { AssignmentRenewalRefusedError } from './licensing.errors';

/**
 * The licensing facade for the renewal of a seat that has an end date (`US-05-14`): what the seat is judged by, the renewal itself, and
 * whether one waits for its decision.
 */
@Injectable()
export class LicensingRenewalApi {
  constructor(
    private readonly renewals: AssignmentRenewalService,
    private readonly renewalHold: RenewalHoldHook,
    private readonly extensions: ProvisioningExtensionService,
    private readonly windows: ExpiryRenewalWindowRepo,
  ) {}

  /**
   * Opens the IT task that extends a right whose renewal was approved (`BR-MF1-08d`), in the transaction of the approval, under the lock
   * of the seat. Throws AssignmentNotFoundError and AssignmentRenewalRefusedError.
   */
  openExtension(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { assignmentId: string; requestId: string; now: Date },
  ): Promise<{ taskId: string }> {
    return this.openExtensionOf(tx, actor, input);
  }

  private async openExtensionOf(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { assignmentId: string; requestId: string; now: Date },
  ): Promise<{ taskId: string }> {
    // Judged under the lock of the subscription and then of the seat, as a renewal is: a seat that ended or is being revoked is not extended.
    const facts = await this.renewals.read(tx, input.assignmentId, true);
    if (facts.kind === 'SERVICE') throw new AssignmentRenewalRefusedError('SERVICE_ACCOUNT');
    if (!facts.open) throw new AssignmentRenewalRefusedError('NOT_OPEN');
    if (facts.revocationLive) throw new AssignmentRenewalRefusedError('REVOCATION_PENDING');

    return this.extensions.open(tx, actor, { ...input, holderEmployeeId: facts.employeeId });
  }

  /**
   * The window of the renewal of the right ending on `expectedEndDate`, when it was recorded as open: the days in force when it opened and
   * the day it opened (`QĐ-108b`). Null when it has not been recorded yet: the caller judges by the parameter in force.
   */
  renewalWindowOf(
    assignmentId: string,
    expectedEndDate: BusinessDate,
    tx?: DbTx,
  ): Promise<{ windowDays: number; opensOn: BusinessDate } | null> {
    return this.windows.find(assignmentId, expectedEndDate, tx);
  }

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
