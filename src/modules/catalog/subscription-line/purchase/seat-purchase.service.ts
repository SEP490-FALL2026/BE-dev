import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { SeatPurchaseRepo } from './seat-purchase.repo';
import type { NewSeatPurchase, SeatPurchaseRecord } from './seat-purchase.types';

/** Capability-internal entry for `subscription-line/purchase/` used by sibling ledger flows. */
@Injectable()
export class SeatPurchaseService {
  constructor(private readonly repo: SeatPurchaseRepo) {}

  insert(tx: DbTx, input: NewSeatPurchase): Promise<SeatPurchaseRecord> {
    return this.repo.insert(tx, input);
  }
}
