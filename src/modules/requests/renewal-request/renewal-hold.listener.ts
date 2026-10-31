import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RenewalHoldHook, type RenewalHold } from '../../licensing/public/licensing.extension-points';
import type { PendingRenewal } from '../../licensing/public/licensing-renewal.types';
import { RenewalRequestRepo } from '../renewal-apply/renewal-request.repo';

/**
 * What licensing asks of the module of requests about a seat whose right is reaching its end (`RenewalHold`, bound to licensing's
 * `RenewalHoldHook` when the module starts): does it have a renewal waiting for its decision. A request sent up to the end of the
 * right leaves the right as it is until a decision comes; refused or withdrawn, it is no longer waiting (`US-05-14` AC-4).
 */
@Injectable()
export class RenewalHoldReader implements RenewalHold, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [RenewalHoldHook] as const;

  constructor(
    private readonly renewals: RenewalRequestRepo,
    private readonly hook: RenewalHoldHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind(this);
  }

  hasPendingRenewal(assignmentId: string, tx?: DbTx): Promise<boolean> {
    return this.renewals.hasOpenFor(assignmentId, tx);
  }

  pendingRenewalsOf(assignmentIds: readonly string[], tx?: DbTx): Promise<Map<string, PendingRenewal>> {
    return this.renewals.pendingOf(assignmentIds, tx);
  }
}
