import type { BusinessDate } from '../../../../core/business-date';
import type { SeatChangeRecord } from '../ledger/seat-ledger.types';
import {
  SubscriptionLineClosedError,
  SubscriptionLineNotResponsibleError,
  SubscriptionLineStaleError,
} from '../subscription-line.errors';
import {
  SeatLedgerInvalidRefundTargetError,
  SeatLedgerMidTermReductionNotAllowedError,
  SeatLedgerReductionExceedsPurchaseError,
} from './subscription-line-correction.errors';

const POSITIVE_PURCHASE_REASONS = new Set(['INITIAL', 'TOP_UP', 'RENEWAL']);

/** Checks line ownership, active open ledger state, and optimistic version before writing a vendor ledger change. */
export function assertLineCorrectable(input: {
  responsibleItAdminEmployeeId: string | null;
  actorEmployeeId: string;
  closedReason: string | null;
  ledgerOpenedOn: BusinessDate | null;
  periodStatus: string;
  lineUpdatedAt: Date;
  expectedUpdatedAt: Date;
}): void {
  if (input.responsibleItAdminEmployeeId !== input.actorEmployeeId) {
    throw new SubscriptionLineNotResponsibleError();
  }
  if (input.closedReason !== null || input.ledgerOpenedOn === null || input.periodStatus !== 'ACTIVE') {
    throw new SubscriptionLineClosedError();
  }
  if (input.lineUpdatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    throw new SubscriptionLineStaleError(input.lineUpdatedAt);
  }
}

/**
 * Classifies a `VENDOR_RECORD` correction (`W3-19`):
 * - `delta > 0` without `basis` on `FIXED` -> `outOfProcess = true`, notify Finance + R1
 * - `delta > 0` on `MEMBERS` -> reconciliation without `outOfProcess`
 * - `delta < 0` -> `REDUCE`, notify Finance
 */
export function judgeVendorCorrection(input: { delta: number; seatCounting: 'FIXED' | 'MEMBERS'; hasBasis: boolean }): {
  reason: 'TOP_UP' | 'REDUCE';
  outOfProcess: boolean;
  notifyFinance: boolean;
  notifyR1: boolean;
} {
  const outOfProcess = input.delta > 0 && !input.hasBasis && input.seatCounting !== 'MEMBERS';
  const reason = input.delta > 0 ? 'TOP_UP' : 'REDUCE';

  return {
    reason,
    outOfProcess,
    notifyFinance: outOfProcess || input.delta < 0,
    notifyR1: outOfProcess,
  };
}

/** Deduplicated notification recipients (R1 and/or Finance), always excluding `actor`. */
export function vendorCorrectionRecipients(input: {
  notifyFinance: boolean;
  notifyR1: boolean;
  responsible: string | null;
  responsibleUsable: boolean;
  superAdmin: string | null;
  finance: string | null;
  actor: string;
}): string[] {
  const recipients = new Set<string>();
  if (input.notifyR1) {
    const r1 = input.responsible !== null && input.responsibleUsable ? input.responsible : input.superAdmin;
    if (r1 !== null && r1 !== input.actor) recipients.add(r1);
  }
  if (input.notifyFinance && input.finance !== null && input.finance !== input.actor) {
    recipients.add(input.finance);
  }

  return [...recipients];
}

/** Rejects mid-term seat reduction when `allowsMidTermReduction` is disabled on the period (`W3-19`). */
export function assertMidTermReductionAllowed(input: { allowsMidTermReduction: boolean }): void {
  if (!input.allowsMidTermReduction) {
    throw new SeatLedgerMidTermReductionNotAllowedError();
  }
}

/** Ensures `refundedChange` is an `INITIAL`/`TOP_UP`/`RENEWAL` on `lineId` and `alreadyReduced + requestedQuantity <= delta`. */
export function assertRefundReductionWithinPurchase(input: {
  lineId: string;
  refundedChange: Pick<SeatChangeRecord, 'subscriptionLineId' | 'reason' | 'delta'> | null;
  alreadyReduced: number;
  requestedQuantity: number;
}): void {
  const target = input.refundedChange;
  if (
    !target ||
    target.subscriptionLineId !== input.lineId ||
    !POSITIVE_PURCHASE_REASONS.has(target.reason) ||
    target.delta <= 0
  ) {
    throw new SeatLedgerInvalidRefundTargetError();
  }
  const remaining = Math.max(0, target.delta - input.alreadyReduced);
  if (input.alreadyReduced + input.requestedQuantity > target.delta) {
    throw new SeatLedgerReductionExceedsPurchaseError(remaining, input.requestedQuantity);
  }
}
