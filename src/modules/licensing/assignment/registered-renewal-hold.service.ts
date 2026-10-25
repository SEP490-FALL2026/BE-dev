import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { PendingRenewal, RenewalHold } from '../licensing-renewal.types';

/**
 * The hold the module of requests registers with the facade when it starts, so licensing never imports it: whether a seat has a
 * renewal waiting for its decision (`US-05-14` AC-4). Until a hold is registered no seat has one.
 */
@Injectable()
export class RegisteredRenewalHold implements RenewalHold {
  private delegate: RenewalHold | null = null;

  register(hold: RenewalHold): void {
    this.delegate = hold;
  }

  async hasPendingRenewal(assignmentId: string, tx?: DbTx): Promise<boolean> {
    return (await this.delegate?.hasPendingRenewal(assignmentId, tx)) ?? false;
  }

  async pendingRenewalsOf(assignmentIds: readonly string[], tx?: DbTx): Promise<Map<string, PendingRenewal>> {
    if (assignmentIds.length === 0) return new Map();

    return (await this.delegate?.pendingRenewalsOf(assignmentIds, tx)) ?? new Map();
  }
}
