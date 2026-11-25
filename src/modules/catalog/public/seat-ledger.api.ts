import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  BuyForItemsOptions,
  BuyForItemsResult,
  LineTargetRef,
  OpenLineItemInput,
  OpenLinesInput,
  OpenNextPeriodInput,
  OpenNextPeriodLineInput,
  RecordMemberOptions,
  RecordVendorInput,
  RecordVendorResult,
  SeatChangeRecord,
  SeatPurchaseItemInput,
} from '../subscription-line/ledger/seat-ledger.types';
import { SeatLedgerService } from '../subscription-line/ledger/seat-ledger.service';

export type {
  BuyForItemsOptions,
  BuyForItemsResult,
  LineTargetRef,
  OpenLineItemInput,
  OpenLinesInput,
  OpenNextPeriodInput,
  OpenNextPeriodLineInput,
  RecordMemberOptions,
  RecordVendorInput,
  RecordVendorResult,
  SeatChangeRecord,
  SeatPurchaseItemInput,
};

/**
 * Public facade for `seat_changes` and `seat_purchases` (`catalog` → `licensing` / `budgets`).
 * Every write runs inside the caller's transaction and locks the target line `FOR UPDATE` (tier 6c) if not already locked.
 */
@Injectable()
export class SeatLedgerApi {
  constructor(private readonly ledger: SeatLedgerService) {}

  openLines(tx: DbTx, input: OpenLinesInput): Promise<SeatChangeRecord[]> {
    return this.ledger.openLines(tx, input);
  }

  buyForItems(
    tx: DbTx,
    line: LineTargetRef,
    items: readonly SeatPurchaseItemInput[],
    effectiveOn: BusinessDate,
    options: BuyForItemsOptions,
  ): Promise<BuyForItemsResult> {
    return this.ledger.buyForItems(tx, line, items, effectiveOn, options);
  }

  recordVendor(tx: DbTx, line: LineTargetRef, input: RecordVendorInput): Promise<RecordVendorResult> {
    return this.ledger.recordVendor(tx, line, input);
  }

  openNextPeriod(tx: DbTx, input: OpenNextPeriodInput): Promise<SeatChangeRecord[]> {
    return this.ledger.openNextPeriod(tx, input);
  }

  recordMember(
    tx: DbTx,
    line: LineTargetRef,
    delta: 1 | -1,
    effectiveOn: BusinessDate,
    options?: RecordMemberOptions,
  ): Promise<SeatChangeRecord> {
    return this.ledger.recordMember(tx, line, delta, effectiveOn, options);
  }

  seatsOnDays(
    lineIds: readonly string[],
    from: BusinessDate,
    until: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, ReadonlyMap<BusinessDate, number | null>>> {
    return this.ledger.seatsOnDays(lineIds, from, until, tx);
  }
}
