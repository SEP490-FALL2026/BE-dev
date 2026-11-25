import type { BusinessDate } from '../../../../core/business-date';

export type SeatChangeReason = 'INITIAL' | 'TOP_UP' | 'RENEWAL' | 'REDUCE';
/** The door a row came through: a grant of a request item, an adjustment by the system, the vendor's own record, or a member the vendor counted. */
export type SeatChangeSource = 'GRANT' | 'ADJUSTMENT' | 'VENDOR_RECORD' | 'MEMBER';
export type SeatChangeBasis = 'REQUEST_ITEM' | 'NONE';

/** One row of the append-only ledger of the seats of a line. */
export interface SeatChangeRecord {
  id: string;
  organizationId: string;
  subscriptionLineId: string;
  effectiveOn: BusinessDate;
  delta: number;
  reason: SeatChangeReason;
  source: SeatChangeSource;
  basis: SeatChangeBasis;
  requestId: string | null;
  beneficiaryEmployeeId: string | null;
  seatPurchaseId: string | null;
  renewalId: string | null;
  refundedSeatChangeId: string | null;
  note: string | null;
  outOfProcess: boolean;
  autoRecorded: boolean;
  /** Null = recorded by the system. */
  recordedByEmployeeId: string | null;
  recordedAt: Date;
}

export interface NewSeatChange {
  organizationId: string;
  subscriptionLineId: string;
  effectiveOn: BusinessDate;
  delta: number;
  reason: SeatChangeReason;
  source: SeatChangeSource;
  basis?: SeatChangeBasis;
  requestId?: string | null;
  beneficiaryEmployeeId?: string | null;
  seatPurchaseId?: string | null;
  renewalId?: string | null;
  refundedSeatChangeId?: string | null;
  note?: string | null;
  outOfProcess?: boolean;
  autoRecorded?: boolean;
  recordedByEmployeeId?: string | null;
}
