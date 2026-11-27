import type { BusinessDate } from '../../../../core/business-date';

/** A top-up bought for the items of a request, or a step of the vendor's tier that took more seats than asked. */
export type SeatPurchaseKind = 'TOP_UP' | 'TIER_STEP';
/** Whether the vendor's invoice for the purchase is due within working days, never, or later than the period. */
export type SeatInvoiceObligation = 'WORKING_DAYS' | 'NONE' | 'LATE_INVOICE';

/** One purchase of seats on a line, with the code people quote (`MUA-` and six digits). */
export interface SeatPurchaseRecord {
  id: string;
  organizationId: string;
  subscriptionLineId: string;
  code: string;
  kind: SeatPurchaseKind;
  purchasedOn: BusinessDate;
  quantity: number;
  invoiceObligation: SeatInvoiceObligation;
  /** Null exactly when no invoice is owed. */
  invoiceDueOn: BusinessDate | null;
  recordedByEmployeeId: string;
  recordedAt: Date;
}

export interface NewSeatPurchase {
  organizationId: string;
  subscriptionLineId: string;
  kind: SeatPurchaseKind;
  purchasedOn: BusinessDate;
  quantity: number;
  invoiceObligation: SeatInvoiceObligation;
  invoiceDueOn: BusinessDate | null;
  recordedByEmployeeId: string;
}
