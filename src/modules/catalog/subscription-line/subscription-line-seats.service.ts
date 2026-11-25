import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SeatLedgerService } from './ledger/seat-ledger.service';

/**
 * Capability-root read service for line seat totals on a day, hiding `ledger/` group internals from sibling capabilities
 * such as `catalog/subscription/`.
 */
@Injectable()
export class SubscriptionLineSeatsService {
  constructor(private readonly ledger: SeatLedgerService) {}

  seatsOn(lineId: string, day: BusinessDate, tx?: DbTx): Promise<number> {
    return this.ledger.seatsOn(lineId, day, tx);
  }

  seatsOnOfLines(lineIds: readonly string[], day: BusinessDate, tx?: DbTx): Promise<Map<string, number>> {
    return this.ledger.seatsOnOfLines(lineIds, day, tx);
  }
}
