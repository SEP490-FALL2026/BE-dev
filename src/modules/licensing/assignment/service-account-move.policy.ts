import type { BusinessDate } from '../../../core/business-date';
import {
  AssignmentEffectiveDateInvalidError,
  AssignmentExpectedEndRequiredError,
  AssignmentNotOpenError,
  AssignmentNotServiceAccountError,
} from '../licensing.errors';
import type { ResponsibleHolder } from '../licensing-service-account.types';
import type { AssignmentRecord } from '../licensing.types';
import { AssignmentResponsibleAfterDeadlineError, ServiceAccountMoveError } from './service-account.errors';

const TIME_LIMITED = new Set(['CONTRACTOR', 'FREELANCER', 'INTERN']);

export type MoveConfirmerRole = 'DEPARTMENT_HEAD' | 'FALLBACK_APPROVER';

/** The receiving department as the rules judge it; null when it does not exist. */
export interface MoveTarget {
  id: string;
  active: boolean;
  costCenterActive: boolean;
}

/** A service account that can move: it is a service account and it is still open. */
export function assertMovable(current: AssignmentRecord): void {
  if (current.kind !== 'SERVICE') throw new AssignmentNotServiceAccountError();
  if (current.validUntil !== null) throw new AssignmentNotOpenError();
}

/**
 * The receiving department and the person who takes the account there (`US-03-08` AC-10, `QĐ-86c`): the department exists, takes
 * people in and is not the one that owns the account; the person is found, working and not handing over, and belongs to the
 * receiving department on the day the move takes effect; the expected end date, which time-limited staff must have (`INV-07`), is
 * not before that day. Throws ServiceAccountMoveError with the reason, or the errors of the assignment for the end date.
 */
export function assertMoveTarget(input: {
  current: AssignmentRecord;
  toDepartmentId: string;
  target: MoveTarget | null;
  responsible: ResponsibleHolder | null;
  effectiveFrom: BusinessDate;
  expectedEndDate: BusinessDate | null;
}): void {
  const { current, target, responsible } = input;
  if (!target) throw new ServiceAccountMoveError('TARGET_DEPARTMENT_INVALID', 'NOT_FOUND');
  if (target.id === current.owningDepartmentId) {
    throw new ServiceAccountMoveError('TARGET_DEPARTMENT_INVALID', 'SAME_AS_OWNING');
  }
  if (!target.active || !target.costCenterActive) {
    throw new ServiceAccountMoveError('TARGET_DEPARTMENT_INVALID', 'INACTIVE');
  }

  if (!responsible) throw new ServiceAccountMoveError('RESPONSIBLE_INVALID', 'NOT_FOUND');
  if (responsible.status !== 'ACTIVE') throw new ServiceAccountMoveError('RESPONSIBLE_INVALID', 'NOT_ACTIVE');
  if (responsible.workState === 'HANDING_OVER')
    throw new ServiceAccountMoveError('RESPONSIBLE_INVALID', 'HANDING_OVER');
  if (responsible.departmentId !== input.toDepartmentId || responsible.costCenterId === null) {
    throw new ServiceAccountMoveError('RESPONSIBLE_INVALID', 'OUTSIDE_TARGET_DEPARTMENT');
  }

  if (input.expectedEndDate !== null && input.expectedEndDate < input.effectiveFrom) {
    throw new AssignmentEffectiveDateInvalidError('EXPECTED_END_BEFORE_START');
  }
  if (TIME_LIMITED.has(responsible.employmentType) && input.expectedEndDate === null) {
    throw new AssignmentExpectedEndRequiredError();
  }
}

/**
 * The rules of proposing the move of a service account, in a fixed order: it can move; the day it takes effect is after the day
 * the account began, not in the past, and no later than the day the file of the current person takes effect while that day has not
 * come; then the receiving department and the person (`assertMoveTarget`). Throws the matching error.
 */
export function assertMoveProposal(input: {
  current: AssignmentRecord;
  today: BusinessDate;
  effectiveFrom: BusinessDate;
  expectedEndDate: BusinessDate | null;
  deadline: BusinessDate | null;
  toDepartmentId: string;
  target: MoveTarget | null;
  responsible: ResponsibleHolder | null;
}): void {
  assertMovable(input.current);
  if (input.effectiveFrom <= input.current.effectiveFrom)
    throw new AssignmentEffectiveDateInvalidError('NOT_AFTER_START');
  if (input.effectiveFrom < input.today) throw new AssignmentEffectiveDateInvalidError('IN_THE_PAST');
  if (input.deadline !== null && input.deadline >= input.today && input.effectiveFrom > input.deadline) {
    throw new AssignmentResponsibleAfterDeadlineError(input.deadline);
  }
  assertMoveTarget(input);
}

/**
 * Who may confirm a move (`US-03-08` AC-10): the head of the receiving department today, and only when it has none the fallback
 * approver. Anyone else is no confirmer, whatever role they hold.
 */
export function confirmerRoleOf(facts: {
  actorEmployeeId: string | null;
  headTodayId: string | null;
  fallbackApproverId: string | null;
}): MoveConfirmerRole | null {
  if (facts.actorEmployeeId === null) return null;
  if (facts.headTodayId !== null) return facts.headTodayId === facts.actorEmployeeId ? 'DEPARTMENT_HEAD' : null;

  return facts.fallbackApproverId === facts.actorEmployeeId ? 'FALLBACK_APPROVER' : null;
}
