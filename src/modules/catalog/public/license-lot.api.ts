import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicenseLotLockService } from '../license-lot/license-lot-lock.service';
import type { LicenseLotView } from './license-lot.types';

/**
 * What the rest of the application reads and locks of the lots of licenses of a K4 plan (W3-24). A lot is written by its own routes;
 * here it is read, and locked in the order of the lock table: the lot (6a), then the plan (7), before the keys (7b) and the activations (8).
 */
@Injectable()
export class LicenseLotApi {
  constructor(private readonly locks: LicenseLotLockService) {}

  /**
   * The lot, locked `FOR UPDATE` with its plan `FOR SHARE` until the caller's transaction ends: what a grant, a key given to a person or an activation
   * on a machine takes first. Null when the lot or its plan does not exist.
   */
  lockLot(tx: DbTx, lotId: string): Promise<LicenseLotView | null> {
    return this.locks.lock(tx, lotId);
  }

  /** Which of these ids are lots, in one read: a lot born from a perpetual purchase has the id of that subscription, so a purchase of wave 2 is asked by its id. */
  idsOfLots(ids: readonly string[], tx?: DbTx): Promise<ReadonlySet<string>> {
    return this.locks.idsOfLots(ids, tx);
  }

  /** The lot with its plan and application, without a lock; null when it does not exist. */
  findLot(lotId: string, tx?: DbTx): Promise<LicenseLotView | null> {
    return this.locks.find(lotId, tx);
  }
}
