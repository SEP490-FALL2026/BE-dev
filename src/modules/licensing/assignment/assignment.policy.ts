import type { BusinessDate } from '../../../core/business-date';
import type { EmployeeWorkState } from '../../organization/public/organization.types';
import {
  AssignmentEffectiveDateInvalidError,
  AssignmentExpectedEndRequiredError,
  AssignmentNotOpenError,
  AssignmentNotServiceAccountError,
  AssignmentResponsibleInvalidError,
} from '../public/licensing.errors';
import type { AssignmentDateBasis, AssignmentRecord, AssignmentView } from '../public/licensing.types';
import { AssignmentResponsibleAfterDeadlineError } from './service-account.errors';

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

const TIME_LIMITED = new Set(['CONTRACTOR', 'FREELANCER', 'INTERN']);

/**
 * The rules of passing a service account to another responsible person (`AC-10`, `QĐ-43a`), in a fixed order: it is a
 * service account and still open; the day it takes effect is after the day the account began and not in the past, and no later
 * than the day the file of the current person takes effect while that day has not come (`US-03-01` AC-9: a file that is past its
 * day or gone binds nothing); the person is found, still working and not handing over, not the one already responsible and in the
 * department that owns the account (`US-03-08` AC-7); the expected end date, which time-limited staff must have (`INV-07`), is not
 * before the day the change takes effect. Throws the matching error from `licensing.errors` and `service-account.errors`.
 */
export function assertResponsibleChange(
  current: AssignmentRecord,
  change: { employeeId: string; effectiveFrom: BusinessDate; expectedEndDate: BusinessDate | null },
  holder: { status: string; workState: EmployeeWorkState; employmentType: string; departmentId: string | null } | null,
  today: BusinessDate,
  deadline: BusinessDate | null = null,
): void {
  if (current.kind !== 'SERVICE') throw new AssignmentNotServiceAccountError();
  if (current.validUntil !== null) throw new AssignmentNotOpenError();
  if (change.effectiveFrom <= current.effectiveFrom) throw new AssignmentEffectiveDateInvalidError('NOT_AFTER_START');
  if (change.effectiveFrom < today) throw new AssignmentEffectiveDateInvalidError('IN_THE_PAST');
  if (deadline !== null && deadline >= today && change.effectiveFrom > deadline) {
    throw new AssignmentResponsibleAfterDeadlineError(deadline);
  }

  if (!holder) throw new AssignmentResponsibleInvalidError('NOT_FOUND');
  if (holder.status !== 'ACTIVE') throw new AssignmentResponsibleInvalidError('NOT_ACTIVE');
  if (holder.workState === 'HANDING_OVER') throw new AssignmentResponsibleInvalidError('HANDING_OVER');
  if (change.employeeId === current.employeeId) throw new AssignmentResponsibleInvalidError('SAME_PERSON');
  // A service account stays in the department that owns it (`QĐ-86c`): the person responsible is chosen among the people of that department.
  if (holder.departmentId !== current.owningDepartmentId) {
    throw new AssignmentResponsibleInvalidError('OUTSIDE_OWNING_DEPARTMENT');
  }

  if (change.expectedEndDate !== null && change.expectedEndDate < change.effectiveFrom) {
    throw new AssignmentEffectiveDateInvalidError('EXPECTED_END_BEFORE_START');
  }
  if (TIME_LIMITED.has(holder.employmentType) && change.expectedEndDate === null) {
    throw new AssignmentExpectedEndRequiredError();
  }
}
