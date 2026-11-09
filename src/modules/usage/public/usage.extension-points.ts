import { Injectable } from '@nestjs/common';
import { Listeners } from '../../../core/extension/listeners';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** A report of a vendor was confirmed: the usage it brings is written and the people who hold the application were told. */
export interface UsageImportConfirmedEvent {
  moment: 'CONFIRMED';
  importId: string;
  sourceId: string;
  applicationId: string;
  /** The last day the report covers: the day its freshness starts from (`QĐ-101b`). */
  coverageTo: BusinessDate;
}

/**
 * The modules that act on a confirmed report, told in the order they were added, inside the transaction of the confirmation (a listener that
 * throws stops the confirmation). The rules of wasted seats bind it to close a recommendation the new usage disproves
 * (`qd103-ghost-seat-g3-g4`).
 */
@Injectable()
export class UsageImportListeners extends Listeners<UsageImportConfirmedEvent, DbTx> {
  constructor() {
    super('usage.import-confirmed');
  }
}
