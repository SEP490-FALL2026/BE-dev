import type { BusinessDate } from '../../../core/business-date';
import { DONG, formatAmount } from '../../../core/money/money';
import type { SubscriptionLineRecord } from './subscription-line.types';

export interface SubscriptionLineDetailView {
  id: string;
  plan: { id: string; name: string };
  monthlyUnitPrice: { amount: string; currency: string };
  minimumSeats: number | null;
  seatsToday: number;
  assignedToday: number;
  freeToday: number;
  closedOn: BusinessDate | null;
  closedReason: 'RENEWED' | 'ENDED' | 'REMOVED' | null;
  updatedAt: string;
}

export interface SeatChangeListRow {
  id: string;
  effectiveOn: BusinessDate;
  delta: number;
  reason: string;
  source: string;
  basis: string;
  requestId: string | null;
  beneficiaryEmployeeId: string | null;
  seatPurchase: { id: string; code: string } | null;
  note: string | null;
  outOfProcess: boolean;
  autoRecorded: boolean;
  recordedByEmployeeId: string | null;
  recordedAt: Date;
}

export interface SeatChangeItemView {
  id: string;
  effectiveOn: BusinessDate;
  delta: number;
  reason: string;
  source: string;
  basis: string;
  request: { id: string; code: string | null } | null;
  beneficiary: { employeeId: string; employeeCode: string; fullName: string } | null;
  seatPurchase: { id: string; code: string } | null;
  note: string | null;
  outOfProcess: boolean;
  autoRecorded: boolean;
  recordedBy: { employeeId: string; fullName: string } | null;
  recordedAt: string;
}

/** Maps a stored subscription line and today's seat counts into the wire line detail shape. */
export function toSubscriptionLineDetail(
  line: SubscriptionLineRecord,
  plan: { id: string; name: string },
  seatsToday: number,
  assignedToday: number,
): SubscriptionLineDetailView {
  return {
    id: line.id,
    plan: { id: plan.id, name: plan.name },
    monthlyUnitPrice: { amount: formatAmount(line.monthlyUnitPriceMinor, 0), currency: DONG },
    minimumSeats: line.minimumSeats,
    seatsToday,
    assignedToday,
    freeToday: Math.max(0, seatsToday - assignedToday),
    closedOn: line.closedOn,
    closedReason: line.closedReason,
    updatedAt: line.updatedAt.toISOString(),
  };
}

/** Maps a persisted `seat_changes` row and pre-loaded employees into the seat-change list wire item. */
export function toSeatChangeItem(
  row: SeatChangeListRow,
  employees: ReadonlyMap<string, { id: string; employeeCode: string; fullName: string }>,
): SeatChangeItemView {
  const beneficiary = row.beneficiaryEmployeeId ? employees.get(row.beneficiaryEmployeeId) : undefined;
  const recorder = row.recordedByEmployeeId ? employees.get(row.recordedByEmployeeId) : undefined;

  return {
    id: row.id,
    effectiveOn: row.effectiveOn,
    delta: row.delta,
    reason: row.reason,
    source: row.source,
    basis: row.basis,
    request: row.requestId ? { id: row.requestId, code: null } : null,
    beneficiary: beneficiary
      ? { employeeId: beneficiary.id, employeeCode: beneficiary.employeeCode, fullName: beneficiary.fullName }
      : null,
    seatPurchase: row.seatPurchase ? { id: row.seatPurchase.id, code: row.seatPurchase.code } : null,
    note: row.note,
    outOfProcess: row.outOfProcess,
    autoRecorded: row.autoRecorded,
    recordedBy: recorder ? { employeeId: recorder.id, fullName: recorder.fullName } : null,
    recordedAt: row.recordedAt.toISOString(),
  };
}
