import {
  AssignmentEffectiveDateInvalidError,
  AssignmentExpectedEndRequiredError,
  AssignmentNotOpenError,
  AssignmentNotServiceAccountError,
} from '../licensing.errors';
import type { ResponsibleHolder } from '../licensing-service-account.types';
import type { AssignmentRecord } from '../licensing.types';
import { AssignmentResponsibleAfterDeadlineError } from './service-account.errors';
import { assertMoveProposal, confirmerRoleOf, type MoveTarget } from './service-account-move.policy';

const bot: AssignmentRecord = {
  id: 'a1',
  source: 'BASELINE',
  kind: 'SERVICE',
  planId: 'p1',
  subscriptionId: 's1',
  employeeId: 'e1',
  accountIdentifier: 'ci-bot',
  reason: 'CI pipeline',
  costCenterId: 'cc-des',
  owningDepartmentId: 'd-des',
  effectiveFrom: '2026-06-01',
  effectiveFromBasis: 'ACTUAL',
  validUntil: null,
  expectedEndDate: null,
  predecessorId: null,
  failedAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
};
const fin: MoveTarget = { id: 'd-fin', active: true, costCenterActive: true };
const e6: ResponsibleHolder = {
  status: 'ACTIVE',
  workState: 'WORKING',
  employmentType: 'STAFF',
  departmentId: 'd-fin',
  costCenterId: 'cc-fin',
};
const proposal = {
  current: bot,
  today: '2026-10-10',
  effectiveFrom: '2026-10-16',
  expectedEndDate: null,
  deadline: null,
  toDepartmentId: 'd-fin',
  target: fin,
  responsible: e6,
} as const;

const refused = (problem: string, reason?: string) =>
  expect.objectContaining({ problem, ...(reason ? { reason } : {}) }) as Error;

describe('assertMoveProposal (US-03-08 AC-10, QĐ-86c)', () => {
  it('lets an open service account go to a person who belongs to the receiving department on the day', () => {
    expect(() => assertMoveProposal(proposal)).not.toThrow();
    expect(() => assertMoveProposal({ ...proposal, effectiveFrom: proposal.today })).not.toThrow();
  });

  it('refuses a personal seat and an account that has ended', () => {
    expect(() => assertMoveProposal({ ...proposal, current: { ...bot, kind: 'PERSONAL' } })).toThrow(
      AssignmentNotServiceAccountError,
    );
    expect(() => assertMoveProposal({ ...proposal, current: { ...bot, validUntil: '2026-12-01' } })).toThrow(
      AssignmentNotOpenError,
    );
  });

  it('refuses a day that is not after the day the account began, and a day in the past', () => {
    expect(() => assertMoveProposal({ ...proposal, effectiveFrom: '2026-06-01' })).toThrow(
      AssignmentEffectiveDateInvalidError,
    );
    expect(() => assertMoveProposal({ ...proposal, effectiveFrom: '2026-10-09' })).toThrow(
      AssignmentEffectiveDateInvalidError,
    );
  });

  it('holds the day to the day the file of the current person takes effect while that day has not come', () => {
    expect(() => assertMoveProposal({ ...proposal, deadline: '2026-10-15' })).toThrow(
      AssignmentResponsibleAfterDeadlineError,
    );
    expect(() => assertMoveProposal({ ...proposal, deadline: '2026-10-16' })).not.toThrow();
    expect(() => assertMoveProposal({ ...proposal, deadline: '2026-10-09' })).not.toThrow();
  });

  it('refuses a department that does not exist, retired ones, one that cannot take people, and the one that owns the account', () => {
    expect(() => assertMoveProposal({ ...proposal, target: null })).toThrow(
      refused('TARGET_DEPARTMENT_INVALID', 'NOT_FOUND'),
    );
    expect(() => assertMoveProposal({ ...proposal, target: { ...fin, active: false } })).toThrow(
      refused('TARGET_DEPARTMENT_INVALID', 'INACTIVE'),
    );
    expect(() => assertMoveProposal({ ...proposal, target: { ...fin, costCenterActive: false } })).toThrow(
      refused('TARGET_DEPARTMENT_INVALID', 'INACTIVE'),
    );
    expect(() => assertMoveProposal({ ...proposal, toDepartmentId: 'd-des', target: { ...fin, id: 'd-des' } })).toThrow(
      refused('TARGET_DEPARTMENT_INVALID', 'SAME_AS_OWNING'),
    );
  });

  it('refuses a person who is not found, not active, handing over, or not in the receiving department on the day', () => {
    expect(() => assertMoveProposal({ ...proposal, responsible: null })).toThrow(
      refused('RESPONSIBLE_INVALID', 'NOT_FOUND'),
    );
    expect(() => assertMoveProposal({ ...proposal, responsible: { ...e6, status: 'TERMINATED' } })).toThrow(
      refused('RESPONSIBLE_INVALID', 'NOT_ACTIVE'),
    );
    expect(() => assertMoveProposal({ ...proposal, responsible: { ...e6, workState: 'HANDING_OVER' } })).toThrow(
      refused('RESPONSIBLE_INVALID', 'HANDING_OVER'),
    );
    expect(() => assertMoveProposal({ ...proposal, responsible: { ...e6, departmentId: 'd-des' } })).toThrow(
      refused('RESPONSIBLE_INVALID', 'OUTSIDE_TARGET_DEPARTMENT'),
    );
    expect(() => assertMoveProposal({ ...proposal, responsible: { ...e6, departmentId: null } })).toThrow(
      refused('RESPONSIBLE_INVALID', 'OUTSIDE_TARGET_DEPARTMENT'),
    );
    expect(() => assertMoveProposal({ ...proposal, responsible: { ...e6, workState: 'ON_LONG_LEAVE' } })).not.toThrow();
  });

  it('asks time-limited staff for an expected end date no earlier than the day of the move (INV-07)', () => {
    const intern = { ...e6, employmentType: 'INTERN' };

    expect(() => assertMoveProposal({ ...proposal, responsible: intern })).toThrow(AssignmentExpectedEndRequiredError);
    expect(() => assertMoveProposal({ ...proposal, responsible: intern, expectedEndDate: '2026-10-15' })).toThrow(
      AssignmentEffectiveDateInvalidError,
    );
    expect(() => assertMoveProposal({ ...proposal, responsible: intern, expectedEndDate: '2027-03-31' })).not.toThrow();
  });

  it('checks the account, then the day, then the deadline, then the department, then the person', () => {
    const everythingWrong = { ...proposal, target: null, responsible: null, deadline: '2026-10-12' };

    expect(() => assertMoveProposal({ ...everythingWrong, current: { ...bot, kind: 'PERSONAL' } })).toThrow(
      AssignmentNotServiceAccountError,
    );
    expect(() => assertMoveProposal({ ...everythingWrong, effectiveFrom: '2026-10-09' })).toThrow(
      AssignmentEffectiveDateInvalidError,
    );
    expect(() => assertMoveProposal(everythingWrong)).toThrow(AssignmentResponsibleAfterDeadlineError);
    expect(() => assertMoveProposal({ ...everythingWrong, deadline: null })).toThrow(
      refused('TARGET_DEPARTMENT_INVALID'),
    );
    expect(() => assertMoveProposal({ ...everythingWrong, deadline: null, target: fin })).toThrow(
      refused('RESPONSIBLE_INVALID'),
    );
  });
});

describe('confirmerRoleOf (US-03-08 AC-10)', () => {
  const facts = { actorEmployeeId: 'e6', headTodayId: 'e6', fallbackApproverId: 'e9' };

  it('is the head of the receiving department today', () => {
    expect(confirmerRoleOf(facts)).toBe('DEPARTMENT_HEAD');
  });

  it('is not another person, not even the fallback approver, while the department has a head', () => {
    expect(confirmerRoleOf({ ...facts, actorEmployeeId: 'e7' })).toBeNull();
    expect(confirmerRoleOf({ ...facts, actorEmployeeId: 'e9' })).toBeNull();
  });

  it('is the fallback approver only when the department has no head', () => {
    expect(confirmerRoleOf({ ...facts, actorEmployeeId: 'e9', headTodayId: null })).toBe('FALLBACK_APPROVER');
    expect(confirmerRoleOf({ ...facts, actorEmployeeId: 'e7', headTodayId: null })).toBeNull();
    expect(confirmerRoleOf({ ...facts, headTodayId: null, fallbackApproverId: null })).toBeNull();
  });

  it('is nobody for a caller without an employee', () => {
    expect(confirmerRoleOf({ ...facts, actorEmployeeId: null })).toBeNull();
  });
});
