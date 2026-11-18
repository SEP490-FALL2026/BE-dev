import { addDays, type BusinessDate } from '../../../core/business-date';
import type {
  AssignmentDateBasis,
  AssignmentRecord,
  AssignmentRevocation,
  AssignmentView,
  ProvisioningTaskStatus,
} from '../public/licensing.types';

/** What the audit event of a new assignment says of it; the account identifier and the purpose are never written to the trail. */
export const assignmentCreatedSnapshot = (record: AssignmentRecord, importId: string | null) => ({
  source: record.source,
  kind: record.kind,
  planId: record.planId,
  subscriptionId: record.subscriptionId,
  employeeId: record.employeeId,
  effectiveFrom: record.effectiveFrom,
  effectiveFromBasis: record.effectiveFromBasis,
  importId,
});

/** `2026-10-01` as `01/10/2026`. */
const dayMonthYear = (date: BusinessDate): string => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/**
 * What to say about the start of an assignment (`AC-8`, `QĐ-43b`): nothing when the grant date is the real one; when only
 * the day of recording is known, that this is when it was recorded and that the real date is not known.
 */
export function effectiveFromLabel(basis: AssignmentDateBasis, effectiveFrom: BusinessDate): string | null {
  return basis === 'RECORDED' ? `ghi nhận từ ${dayMonthYear(effectiveFrom)} — ngày cấp thật chưa biết` : null;
}

/**
 * The assignment as it is answered. A start that is only the day of recording is never shown as the day the seat was
 * granted: `grantedOn` is empty for it, and the label says what is known.
 */
export function toAssignmentView(record: AssignmentRecord): AssignmentView {
  return {
    ...record,
    grantedOn: record.effectiveFromBasis === 'ACTUAL' ? record.effectiveFrom : null,
    effectiveFromLabel: effectiveFromLabel(record.effectiveFromBasis, record.effectiveFrom),
  };
}

/**
 * The revocation a seat has from the task that is open for it (`QĐ-111p`): the task and its state, and whether it may be taken today, which is the
 * reading the task itself gives (`claimableNow`): only a reason that asks for a day not before, still ahead, holds it back.
 */
export function revocationOf(
  task: { id: string; status: ProvisioningTaskStatus; notBefore: BusinessDate | null },
  today: BusinessDate,
): AssignmentRevocation {
  return { taskId: task.id, status: task.status, claimableNow: task.notBefore === null || task.notBefore <= today };
}

/** The day a first assignment could be used from its `valid_from` and its grant tasks that were not dropped; null while one is still open. */
export function usableDayOf(
  validFrom: BusinessDate,
  grants: readonly { status: string; completedAt: Date | null }[],
  toBusinessDate: (instant: Date) => BusinessDate,
): BusinessDate | null {
  if (grants.some((grant) => grant.status !== 'COMPLETED')) return null;
  const done = grants
    .flatMap((grant) => (grant.completedAt ? [toBusinessDate(grant.completedAt)] : []))
    .sort()
    .at(-1);

  return done !== undefined && done > validFrom ? done : validFrom;
}

/**
 * Whether the grant of a request ends the right the request replaces the day it is given (R-49, `QĐ-110q`, SPEC MF3-C.4): a person in the grace of a transfer
 * asked again for software they hold, and the grant lands on the same seat target (the same subscription, or the same plan when it has none), where the
 * database would refuse two personal rights of one person at once (`INV-02`). The old right is the person's own personal seat, still open, begun before
 * the day of the grant (it would otherwise end the day it begins), not used for a machine account, and nobody is taking it away already. A grant on
 * another subscription ends nothing: the grace does, as it does for every other right.
 */
export function replacedByGrant(
  old: Pick<
    AssignmentRecord,
    | 'kind'
    | 'employeeId'
    | 'planId'
    | 'subscriptionId'
    | 'effectiveFrom'
    | 'validUntil'
    | 'failedAt'
    | 'cancelledAt'
    | 'isMachineAccount'
  >,
  grant: {
    employeeId: string;
    target: { planId: string; subscriptionId: string | null };
    today: BusinessDate;
    revocationUnderWay: boolean;
  },
): boolean {
  const open = old.validUntil === null && old.failedAt === null && old.cancelledAt === null;

  return (
    old.kind === 'PERSONAL' &&
    !old.isMachineAccount &&
    old.employeeId === grant.employeeId &&
    open &&
    old.effectiveFrom < grant.today &&
    !grant.revocationUnderWay &&
    (old.subscriptionId ?? old.planId) === (grant.target.subscriptionId ?? grant.target.planId)
  );
}

/** What the rule of carrying a seat into a next period reads of it: the days it begins, ends and is expected to end. */
export interface CarriableSeat {
  validFrom: BusinessDate;
  validUntil: BusinessDate | null;
  expectedEndDate: BusinessDate | null;
}

/**
 * The seats that go on into the new period (`QĐ-35c`): those held on its first day — begun before it, not ended by it, and not
 * expected to end before it. A seat that ends before the new period stays where it is and is never carried. The one rule for the
 * seats held when a renewal is recorded and for a seat granted after it was.
 */
export function seatsToCarry<T extends CarriableSeat>(seats: readonly T[], startDate: BusinessDate): T[] {
  return seats.filter(
    (seat) =>
      seat.validFrom < startDate &&
      (seat.validUntil === null || seat.validUntil > startDate) &&
      (seat.expectedEndDate === null || seat.expectedEndDate >= startDate),
  );
}

/** The days a seat holds, as the rule of its last day reads them. */
export interface SeatDays {
  validUntil: BusinessDate | null;
  expectedEndDate: BusinessDate | null;
}

/** The last day of a seat: the earlier of the day before its right ends and its expected end; null when it does not end. */
export function lastDayOf(seat: SeatDays): BusinessDate | null {
  const days = [seat.validUntil === null ? null : addDays(seat.validUntil, -1), seat.expectedEndDate].filter(
    (day) => day !== null,
  );

  return days.length === 0 ? null : days.reduce((first, day) => (day < first ? day : first));
}

/**
 * The seats that go on into the new period of a renewal recorded at the point of adjustment (`QĐ-106i`(2), R2-2): the seat whose last day
 * is the renewal day or before stays on the old period to its last day, since the count of the seats needed (`SBF-20` §4.3) leaves it out.
 */
export function carriedPast<T extends SeatDays>(seats: readonly T[], endingBy: BusinessDate): T[] {
  return seats.filter((seat) => {
    const last = lastDayOf(seat);

    return last === null || last > endingBy;
  });
}

/**
 * The first day of the next period a seat granted today goes on into: the period recorded ahead of its start that continues the
 * one the seat is on, when it is active (a draft takes no seat). Null when there is none, it has begun, or it is not yet a pool.
 */
export function nextPeriodStart(
  next: { status: 'DRAFT' | 'ACTIVE'; startDate: BusinessDate | null } | undefined,
  today: BusinessDate,
): BusinessDate | null {
  if (!next || next.status !== 'ACTIVE' || next.startDate === null) return null;

  return next.startDate > today ? next.startDate : null;
}
