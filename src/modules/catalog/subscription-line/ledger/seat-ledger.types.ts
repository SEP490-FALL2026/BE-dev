import type { BusinessDate } from '../../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { SeatPurchaseRecord } from '../purchase/seat-purchase.types';
import type { SubscriptionLineRecord } from '../subscription-line.types';

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

export interface OpenLineItemInput {
  lineId: string;
  quantity: number;
  effectiveOn: BusinessDate;
  recordedByEmployeeId?: string | null;
}

export interface OpenLinesInput {
  lines: readonly OpenLineItemInput[];
}

export interface SeatPurchaseItemInput {
  requestId: string;
  beneficiaryEmployeeId: string;
}

export interface BuyForItemsOptions {
  actor: AuthenticatedPrincipal;
  alreadyLocked?: boolean;
  /** True by default for manual purchases; false for system renewal-carry purchases. */
  checkClosedMonth?: boolean;
  today?: BusinessDate;
}

export interface BuyForItemsResult {
  purchase: SeatPurchaseRecord;
  changes: SeatChangeRecord[];
}

export interface RecordVendorInput {
  delta: number;
  effectiveOn: BusinessDate;
  note: string;
  actor: AuthenticatedPrincipal;
  requestId?: string | null;
  beneficiaryEmployeeId?: string | null;
  refundedSeatChangeId?: string | null;
  outOfProcess?: boolean;
  tierStep?: boolean;
  alreadyLocked?: boolean;
  checkClosedMonth?: boolean;
  today?: BusinessDate;
}

export interface RecordVendorResult {
  purchase: SeatPurchaseRecord | null;
  change: SeatChangeRecord;
}

export interface OpenNextPeriodLineInput {
  lineId: string;
  quantity: number;
  effectiveOn: BusinessDate;
  renewalId: string | null;
  autoRecorded?: boolean;
  recordedByEmployeeId?: string | null;
}

export interface OpenNextPeriodInput {
  lines: readonly OpenNextPeriodLineInput[];
}

export interface RecordMemberOptions {
  recordedByEmployeeId?: string | null;
  alreadyLocked?: boolean;
}

export type LineTargetRef = SubscriptionLineRecord | string;
