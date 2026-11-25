import { addDays, monthBoundsOf, type BusinessDate } from '../../../../core/business-date';
import { nthWorkingDayFrom, type NonWorkingDates } from '../../../../core/working-days';
import type { SeatInvoiceObligation } from '../purchase/seat-purchase.types';

export type LedgerBillingCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
import { SeatLedgerEffectiveInClosedMonthError, SeatLedgerInvalidEntryError } from './seat-ledger.errors';
import type { NewSeatChange } from './seat-ledger.types';

/** Default working days before a normal seat-purchase invoice is due. */
export const SEAT_PURCHASE_INVOICE_DUE_WORKING_DAYS = 5;
/** Default calendar days before a late annual seat-purchase invoice is due. */
export const SEAT_PURCHASE_LATE_INVOICE_DAYS = 95;
const MAX_LEDGER_NOTE_LENGTH = 1000;

export interface SeatPurchaseInvoiceDueInput {
  purchasedOn: BusinessDate;
  billingCycle: LedgerBillingCycle | null;
  invoicedLater: boolean;
  workingDays: number;
  lateInvoiceDays: number;
  nonWorkingDates: NonWorkingDates;
}

/** First calendar day of the business month containing `today`: earliest valid `effectiveOn` for manual ledger writes. */
export function earliestManualEffectiveOn(today: BusinessDate): BusinessDate {
  return monthBoundsOf(today).start;
}

/**
 * Enforces that a manual ledger entry takes effect in the current open month or later (`today`'s month); past months may
 * already have seat-month charges computed. Throws SeatLedgerEffectiveInClosedMonthError.
 */
export function assertManualEffectiveOn(effectiveOn: BusinessDate, today: BusinessDate): void {
  const earliestOn = earliestManualEffectiveOn(today);
  if (effectiveOn < earliestOn) {
    throw new SeatLedgerEffectiveInClosedMonthError(earliestOn);
  }
}

/**
 * Computes the invoice obligation and due date of a seat purchase: normal purchases owe an invoice within working days
 * (counting `purchasedOn` as day 1 when it is a working day); late-invoiced monthly periods fold into the next cycle (`NONE`),
 * and late-invoiced annual/non-monthly periods owe an invoice `lateInvoiceDays` calendar days later.
 */
export function seatPurchaseInvoiceDue(input: SeatPurchaseInvoiceDueInput): {
  invoiceObligation: SeatInvoiceObligation;
  invoiceDueOn: BusinessDate | null;
} {
  if (!input.invoicedLater) {
    return {
      invoiceObligation: 'WORKING_DAYS',
      invoiceDueOn: nthWorkingDayFrom(input.purchasedOn, input.workingDays, input.nonWorkingDates),
    };
  }
  if (input.billingCycle === 'MONTHLY') {
    return { invoiceObligation: 'NONE', invoiceDueOn: null };
  }

  return {
    invoiceObligation: 'LATE_INVOICE',
    invoiceDueOn: addDays(input.purchasedOn, input.lateInvoiceDays),
  };
}

interface BaseDoorInput {
  organizationId: string;
  subscriptionLineId: string;
  effectiveOn: BusinessDate;
  recordedByEmployeeId: string | null;
}

export type SeatDoorInput =
  | (BaseDoorInput & {
      source: 'ADJUSTMENT';
      reason: 'INITIAL' | 'RENEWAL';
      delta: number;
      renewalId?: string | null;
      autoRecorded?: boolean;
    })
  | (BaseDoorInput & {
      source: 'GRANT';
      requestId: string;
      beneficiaryEmployeeId: string;
      seatPurchaseId: string;
    })
  | (BaseDoorInput & {
      source: 'VENDOR_RECORD';
      delta: number;
      note: string;
      requestId?: string | null;
      beneficiaryEmployeeId?: string | null;
      seatPurchaseId?: string | null;
      refundedSeatChangeId?: string | null;
      outOfProcess?: boolean;
    })
  | (BaseDoorInput & {
      source: 'MEMBER';
      delta: 1 | -1;
    });

function buildAdjustmentRow(input: Extract<SeatDoorInput, { source: 'ADJUSTMENT' }>): NewSeatChange {
  if (input.reason !== 'INITIAL' && input.reason !== 'RENEWAL') {
    throw new SeatLedgerInvalidEntryError('ADJUSTMENT entries must have reason INITIAL or RENEWAL.');
  }
  if (!Number.isInteger(input.delta) || input.delta <= 0) {
    throw new SeatLedgerInvalidEntryError('ADJUSTMENT delta must be a positive integer.');
  }

  return {
    organizationId: input.organizationId,
    subscriptionLineId: input.subscriptionLineId,
    effectiveOn: input.effectiveOn,
    delta: input.delta,
    reason: input.reason,
    source: 'ADJUSTMENT',
    basis: 'NONE',
    seatPurchaseId: null,
    renewalId: input.renewalId ?? null,
    autoRecorded: input.autoRecorded ?? false,
    recordedByEmployeeId: input.recordedByEmployeeId,
  };
}

function buildGrantRow(input: Extract<SeatDoorInput, { source: 'GRANT' }>): NewSeatChange {
  if (!input.requestId || !input.beneficiaryEmployeeId || !input.seatPurchaseId) {
    throw new SeatLedgerInvalidEntryError(
      'GRANT entries require requestId, beneficiaryEmployeeId, and seatPurchaseId.',
    );
  }

  return {
    organizationId: input.organizationId,
    subscriptionLineId: input.subscriptionLineId,
    effectiveOn: input.effectiveOn,
    delta: 1,
    reason: 'TOP_UP',
    source: 'GRANT',
    basis: 'REQUEST_ITEM',
    requestId: input.requestId,
    beneficiaryEmployeeId: input.beneficiaryEmployeeId,
    seatPurchaseId: input.seatPurchaseId,
    recordedByEmployeeId: input.recordedByEmployeeId,
  };
}

function assertValidVendorEntry(input: Extract<SeatDoorInput, { source: 'VENDOR_RECORD' }>): string {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new SeatLedgerInvalidEntryError('VENDOR_RECORD delta must be a non-zero integer.');
  }
  const note = input.note.trim();
  if (note.length === 0 || note.length > MAX_LEDGER_NOTE_LENGTH) {
    throw new SeatLedgerInvalidEntryError('VENDOR_RECORD requires a non-empty note up to 1000 characters.');
  }
  if (input.seatPurchaseId && (input.delta < 0 || !input.requestId)) {
    throw new SeatLedgerInvalidEntryError('VENDOR_RECORD tier step requires a positive delta and requestId.');
  }
  if (input.refundedSeatChangeId && input.delta > 0) {
    throw new SeatLedgerInvalidEntryError('VENDOR_RECORD refund reduction requires a negative delta.');
  }

  return note;
}

function buildVendorRow(input: Extract<SeatDoorInput, { source: 'VENDOR_RECORD' }>): NewSeatChange {
  const note = assertValidVendorEntry(input);

  return {
    organizationId: input.organizationId,
    subscriptionLineId: input.subscriptionLineId,
    effectiveOn: input.effectiveOn,
    delta: input.delta,
    reason: input.delta > 0 ? 'TOP_UP' : 'REDUCE',
    source: 'VENDOR_RECORD',
    basis: input.requestId ? 'REQUEST_ITEM' : 'NONE',
    requestId: input.requestId ?? null,
    beneficiaryEmployeeId: input.beneficiaryEmployeeId ?? null,
    seatPurchaseId: input.seatPurchaseId ?? null,
    refundedSeatChangeId: input.refundedSeatChangeId ?? null,
    note,
    outOfProcess: input.outOfProcess ?? false,
    recordedByEmployeeId: input.recordedByEmployeeId,
  };
}

function buildMemberRow(input: Extract<SeatDoorInput, { source: 'MEMBER' }>): NewSeatChange {
  if (input.delta !== 1 && input.delta !== -1) {
    throw new SeatLedgerInvalidEntryError('MEMBER delta must be +1 or -1.');
  }

  return {
    organizationId: input.organizationId,
    subscriptionLineId: input.subscriptionLineId,
    effectiveOn: input.effectiveOn,
    delta: input.delta,
    reason: input.delta === 1 ? 'TOP_UP' : 'REDUCE',
    source: 'MEMBER',
    basis: 'NONE',
    seatPurchaseId: null,
    recordedByEmployeeId: input.recordedByEmployeeId,
  };
}

/** Validates and constructs a `NewSeatChange` matching the invariants of the four ledger doors. */
export function buildSeatChangeForDoor(input: SeatDoorInput): NewSeatChange {
  switch (input.source) {
    case 'ADJUSTMENT':
      return buildAdjustmentRow(input);
    case 'GRANT':
      return buildGrantRow(input);
    case 'VENDOR_RECORD':
      return buildVendorRow(input);
    case 'MEMBER':
      return buildMemberRow(input);
  }
}

export interface LineSeatCalculationInput {
  id: string;
  ledgerOpenedOn: BusinessDate | null;
  fallbackQuantity: number | null;
}

export interface SeatChangeDeltaInput {
  effectiveOn: BusinessDate;
  delta: number;
}

/**
 * Computes the seat count of a line for every day in `[from, until]` inclusive: uses the running sum of `seat_changes`
 * on days `>= ledgerOpenedOn` when the ledger is open, and `fallbackQuantity` on days before opening or with no ledger.
 */
export function computeSeatsOnDays(
  line: LineSeatCalculationInput,
  changes: readonly SeatChangeDeltaInput[],
  from: BusinessDate,
  until: BusinessDate,
): Map<BusinessDate, number | null> {
  const result = new Map<BusinessDate, number | null>();
  if (from > until) return result;

  const sorted = [...changes].sort((a, b) =>
    a.effectiveOn < b.effectiveOn ? -1 : a.effectiveOn > b.effectiveOn ? 1 : 0,
  );
  let running = 0;
  let index = 0;
  while (index < sorted.length && sorted[index].effectiveOn < from) {
    running += sorted[index].delta;
    index += 1;
  }

  for (let day = from; day <= until; day = addDays(day, 1)) {
    while (index < sorted.length && sorted[index].effectiveOn <= day) {
      running += sorted[index].delta;
      index += 1;
    }
    const useLedger = line.ledgerOpenedOn !== null && line.ledgerOpenedOn <= day;
    result.set(day, useLedger ? running : line.fallbackQuantity);
  }

  return result;
}
