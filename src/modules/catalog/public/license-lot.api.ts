import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicenseLotLockService } from '../license-lot/license-lot-lock.service';
import { LicenseLotCreateService } from '../license-lot/license-lot-create.service';
import { toLicenseLotApiException } from '../license-lot/license-lot.http-errors';
import type { CreateLicenseLotInput, LicenseLotView } from './license-lot.types';

/**
 * What the rest of the application reads and locks of the lots of licenses of a K4 plan. A lot is written by its own routes;
 * here it is read, and locked in the order of the lock table: the lot (6a), then the plan (7), before the keys (7b) and the activations (8).
 */
@Injectable()
export class LicenseLotApi {
  constructor(
    private readonly locks: LicenseLotLockService,
    private readonly creator: LicenseLotCreateService,
  ) {}

  /**
   * Makes a lot for the IT Admin who calls: they answer for it. The facts of other modules a purpose needs (a lot for a request needs an open grant task of that request)
   * are the caller's to check before. Returns the id of the lot. Refusals come as `ApiException`s with the codes of the lot routes (LICENSE_LOT.*).
   */
  async createLot(actor: AuthenticatedPrincipal, input: CreateLicenseLotInput, tx?: DbTx): Promise<{ id: string }> {
    try {
      const created =
        tx === undefined ? await this.creator.create(actor, input) : await this.creator.create(actor, input, tx);

      return { id: created.id };
    } catch (error) {
      // The route that calls is another module's: it gets the answer of the lot routes, not the errors of the catalog.
      throw toLicenseLotApiException(error);
    }
  }

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

  /** The ids of the lots, not bought for a request, this IT Admin answers for: whose invoices they read (`QĐ-118f`). */
  getResponsibleLotIds(employeeId: string, tx?: DbTx): Promise<string[]> {
    return this.locks.responsibleLotIds(employeeId, tx);
  }

  /** The lot with its plan and application, without a lock; null when it does not exist. */
  findLot(lotId: string, tx?: DbTx): Promise<LicenseLotView | null> {
    return this.locks.find(lotId, tx);
  }

  /** The lot bought specifically for a request (purpose = REQUEST), without a lock; null when none exists. */
  findLotOfRequest(requestId: string, tx?: DbTx): Promise<LicenseLotView | null> {
    return this.locks.findOfRequest(requestId, tx);
  }

  /** Multiple lots with their plans, without locks; missing ids are omitted. */
  findLotsByIds(lotIds: readonly string[], tx?: DbTx): Promise<Map<string, LicenseLotView>> {
    return this.locks.findMany(lotIds, tx);
  }

  /** Records Finance's confirmed invoice amount (`A`) on the lot once; throws LicenseLotAlreadyInvoicedError if already set. */
  setInvoiceActual(tx: DbTx, lotId: string, actualMinor: bigint): Promise<void> {
    return this.locks.setInvoiceActual(tx, lotId, actualMinor);
  }
}
