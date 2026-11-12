import type { BusinessDate } from '../../../core/business-date';
import type { AssignmentDateBasis, AssignmentRecord, AssignmentView } from '../public/licensing.types';

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
