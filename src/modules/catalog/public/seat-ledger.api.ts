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
  RecordTierStepInput,
  RecordVendorInput,
  RecordVendorResult,
  SeatChangeRecord,
  SeatPurchaseItemInput,
} from '../subscription-line/ledger/seat-ledger.types';
import {
  SeatLedgerBelowOccupancyError,
  SeatLedgerEffectiveInClosedMonthError,
  SubscriptionLineClosedError,
} from '../subscription-line/subscription-line.errors';
import {
  SEAT_LEDGER_ERROR_EXAMPLES,
  toSeatLedgerApiException,
} from '../subscription-line/ledger/seat-ledger.http-errors';
import { SeatLedgerService } from '../subscription-line/ledger/seat-ledger.service';
import {
  SeatPurchaseBeforePeriodError,
  SeatPurchaseConflictingModeError,
  SeatPurchaseInFutureError,
  SeatPurchaseItemNotPendingError,
  SeatPurchaseLineNotFoundError,
  SeatPurchaseLineNotPurchasableError,
  SeatPurchaseNotInChargeError,
  SeatPurchaseReplacementOneItemError,
  SeatPurchaseReplacementSameLineError,
  SeatPurchaseStockAvailableError,
  SeatPurchaseTierStepOneItemError,
  type SeatPurchaseRefItem,
} from '../subscription-line/purchase/seat-purchase.errors';
import {
  SEAT_PURCHASE_ONLY_ERROR_EXAMPLES,
  toSeatPurchaseApiException as toPurchaseOnlyApiException,
} from '../subscription-line/purchase/seat-purchase.http-errors';
import {
  assertLinePurchasableForPurchase,
  assertPurchaseDateWithinBounds,
  assertPurchaseModeValid,
  assertStockAllowsSeatPurchase,
  isSeatPurchaseInvoiceOverdue,
  overduePurchaseInvoiceRecipients,
  seatPurchaseExpectedAmount,
  seatPurchaseNetExpectedAmount,
} from '../subscription-line/purchase/seat-purchase.policy';
import type { SignedExpectedLine } from '../subscription-line/purchase/seat-purchase.policy';
import {
  SeatPurchaseService,
  type NotifySeatsBoughtInput,
  type NotifyVendorRecordedInput,
} from '../subscription-line/purchase/seat-purchase.service';
import type {
  SeatInvoiceObligation,
  SeatPurchaseKind,
  SeatPurchaseRecord,
} from '../subscription-line/purchase/seat-purchase.types';
import type { SubscriptionLineRecord } from '../subscription-line/subscription-line.types';

export type {
  BuyForItemsOptions,
  BuyForItemsResult,
  LineTargetRef,
  NotifySeatsBoughtInput,
  OpenLineItemInput,
  OpenLinesInput,
  OpenNextPeriodInput,
  OpenNextPeriodLineInput,
  RecordMemberOptions,
  RecordTierStepInput,
  RecordVendorInput,
  SignedExpectedLine,
  RecordVendorResult,
  SeatChangeRecord,
  SeatInvoiceObligation,
  SeatPurchaseItemInput,
  SeatPurchaseKind,
  SeatPurchaseRecord,
  SeatPurchaseRefItem,
  SubscriptionLineRecord,
};

export const SEAT_PURCHASE_ERROR_EXAMPLES = {
  ...SEAT_PURCHASE_ONLY_ERROR_EXAMPLES,
  BELOW_OCCUPANCY: SEAT_LEDGER_ERROR_EXAMPLES.BELOW_OCCUPANCY,
  EFFECTIVE_IN_CLOSED_MONTH: SEAT_LEDGER_ERROR_EXAMPLES.EFFECTIVE_IN_CLOSED_MONTH,
} as const;

export function toSeatPurchaseApiException(error: unknown): unknown {
  return toSeatLedgerApiException(toPurchaseOnlyApiException(error));
}

export {
  SeatLedgerBelowOccupancyError,
  SeatLedgerEffectiveInClosedMonthError,
  SubscriptionLineClosedError,
  SeatPurchaseBeforePeriodError,
  SeatPurchaseConflictingModeError,
  SeatPurchaseInFutureError,
  SeatPurchaseItemNotPendingError,
  SeatPurchaseLineNotFoundError,
  SeatPurchaseLineNotPurchasableError,
  SeatPurchaseNotInChargeError,
  SeatPurchaseReplacementOneItemError,
  SeatPurchaseReplacementSameLineError,
  SeatPurchaseStockAvailableError,
  SeatPurchaseTierStepOneItemError,
  assertLinePurchasableForPurchase,
  assertPurchaseDateWithinBounds,
  assertPurchaseModeValid,
  assertStockAllowsSeatPurchase,
  isSeatPurchaseInvoiceOverdue,
  overduePurchaseInvoiceRecipients,
  seatPurchaseExpectedAmount,
  seatPurchaseNetExpectedAmount,
};

/**
 * Public facade for `seat_changes` and `seat_purchases` (`catalog` → `licensing` / `requests` / `budgets`).
 * Every write runs inside the caller's transaction and locks the target line `FOR UPDATE` (tier 6c) if not already locked.
 */
@Injectable()
export class SeatLedgerApi {
  constructor(
    private readonly ledger: SeatLedgerService,
    private readonly purchases: SeatPurchaseService,
  ) {}

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

  recordTierStep(tx: DbTx, line: LineTargetRef, input: RecordTierStepInput): Promise<RecordVendorResult> {
    return this.ledger.recordTierStep(tx, line, input);
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

  findWithPurchaseContext(lineId: string, tx?: DbTx) {
    return this.ledger.findWithPurchaseContext(lineId, tx);
  }

  findLineWithPeriodByPlan(subscriptionId: string, planId: string, tx?: DbTx) {
    return this.ledger.findLineWithPeriodByPlan(subscriptionId, planId, tx);
  }

  futureMemberChanges(lineId: string, afterDay: BusinessDate, tx?: DbTx) {
    return this.ledger.futureMemberChanges(lineId, afterDay, tx);
  }

  lockPeriodsAndLines(tx: DbTx, subscriptionIds: readonly string[], lineIds: readonly string[]) {
    return this.ledger.lockPeriodsAndLines(tx, subscriptionIds, lineIds);
  }

  findLinePeriodIds(lineIds: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    return this.ledger.findLinePeriodIds(lineIds, tx);
  }

  linesOfIds(lineIds: readonly string[], tx?: DbTx) {
    return this.ledger.linesOfIds(lineIds, tx);
  }

  linesOfSubscription(subscriptionId: string, tx?: DbTx) {
    return this.ledger.linesOfSubscription(subscriptionId, tx);
  }

  linesOfSubscriptions(subscriptionIds: readonly string[], tx?: DbTx) {
    return this.ledger.linesOfSubscriptions(subscriptionIds, tx);
  }

  lockPeriodAndLine(tx: DbTx, subscriptionId: string, lineId: string) {
    return this.ledger.lockPeriodAndLine(tx, subscriptionId, lineId);
  }

  existingTopUpItems(items: readonly SeatPurchaseItemInput[], tx?: DbTx): Promise<Set<string>> {
    return this.ledger.existingTopUpItems(items, tx);
  }

  topUpPurchaseIdsOfRequest(requestId: string, tx?: DbTx): Promise<string[]> {
    return this.ledger.topUpPurchaseIdsOfRequest(requestId, tx);
  }

  notifySeatsBought(tx: DbTx, input: NotifySeatsBoughtInput): Promise<number> {
    return this.purchases.notifySeatsBought(tx, input);
  }

  notifyVendorRecorded(tx: DbTx, input: NotifyVendorRecordedInput): Promise<number> {
    return this.purchases.notifyVendorRecorded(tx, input);
  }

  findSeatPurchase(id: string, tx?: DbTx): Promise<SeatPurchaseRecord | null> {
    return this.purchases.find(id, tx);
  }

  findSeatPurchases(ids: readonly string[], tx?: DbTx): Promise<SeatPurchaseRecord[]> {
    return this.purchases.findMany(ids, tx);
  }

  listAwaitingInvoicePurchases(organizationId: string, tx?: DbTx): Promise<SeatPurchaseRecord[]> {
    return this.purchases.awaitingInvoice(organizationId, tx);
  }

  ofSubscriptionMonthNoInvoice(subscriptionId: string, from: BusinessDate, untilExclusive: BusinessDate, tx?: DbTx) {
    return this.purchases.ofSubscriptionMonthNoInvoice(subscriptionId, from, untilExclusive, tx);
  }
}
