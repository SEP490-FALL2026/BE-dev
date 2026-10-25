import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { PendingRenewal, RenewalHold } from '../../licensing/licensing-renewal.types';
import { RenewalRequestRepo } from './renewal-request.repo';

/**
 * What licensing asks of the module of requests about a seat whose right is reaching its end (`RenewalHold`, registered with
 * licensing when the module starts): does it have a renewal waiting for its decision. A request sent up to the end of the right
 * leaves the right as it is until a decision comes; refused or withdrawn, it is no longer waiting (`US-05-14` AC-4).
 */
@Injectable()
export class RenewalHoldReader implements RenewalHold {
  constructor(private readonly renewals: RenewalRequestRepo) {}

  hasPendingRenewal(assignmentId: string, tx?: DbTx): Promise<boolean> {
    return this.renewals.hasOpenFor(assignmentId, tx);
  }

  pendingRenewalsOf(assignmentIds: readonly string[], tx?: DbTx): Promise<Map<string, PendingRenewal>> {
    return this.renewals.pendingOf(assignmentIds, tx);
  }
}
