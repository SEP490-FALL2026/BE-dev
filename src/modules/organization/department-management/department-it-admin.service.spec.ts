import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { DepartmentItSubstituteRepo } from '../department-it-substitute/department-it-substitute.repo';
import { DepartmentItAdminInvalidError, DepartmentItAdminLimitReachedError } from '../department/department.errors';
import type { DepartmentRepo } from '../department/department.repo';
import type { EmployeeRecordService } from '../employee/employee-record.service';
import { EmployeeAccountsHook, type EmployeeAccounts } from '../public/organization.extension-points';
import { DepartmentItAdminService } from './department-it-admin.service';

/**
 * Who may be named the IT Admin in charge of one more department (`US-01-11`, `QĐ-110l`): the person is judged first (a missing, left or
 * locked employee, or an account without the role, is 422), the departments they already answer for are counted after, under the lock of
 * the employee row taken `FOR UPDATE`, so two namings of the same person queue up.
 */
describe('DepartmentItAdminService', () => {
  const tx = { name: 'tx' } as never;
  const actor: AuthenticatedPrincipal = {
    subject: 'user-1',
    appUserId: 'user-1',
    sessionId: 'sess-1',
    employeeId: 'emp-actor',
    directRoles: ['SUPER_ADMIN'],
    roles: ['SUPER_ADMIN'],
  };
  const calls: string[] = [];
  const employees = {
    lock: jest.fn((_tx: unknown, _id: string, mode: string) => {
      calls.push(`lock:${mode}`);

      return Promise.resolve();
    }),
    find: jest.fn(() => Promise.resolve({ id: 'emp-it', status: 'ACTIVE' })),
  };
  const accounts = {
    inspectEmployeeAccount: jest.fn(() => {
      calls.push('account');

      return Promise.resolve({ usable: true, roles: ['IT_ADMIN'] });
    }),
  };
  const departments = {
    countActiveInChargeOf: jest.fn(() => {
      calls.push('count');

      return Promise.resolve(3);
    }),
    countActiveInChargeExcludingStarting: jest.fn(() => Promise.resolve(3)),
  };
  const substitutes = {
    endActiveForDepartment: jest.fn(),
    countActiveBySubstitute: jest.fn(() => Promise.resolve(2)),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const notifications = { notifyInApp: jest.fn(() => Promise.resolve(true)) };

  const service = (): DepartmentItAdminService => {
    const hook = new EmployeeAccountsHook();
    hook.bind(accounts as unknown as EmployeeAccounts);

    return new DepartmentItAdminService(
      employees as unknown as EmployeeRecordService,
      hook,
      departments as unknown as DepartmentRepo,
      substitutes as unknown as DepartmentItSubstituteRepo,
      audit as unknown as AuditApi,
      notifications as unknown as NotificationsApi,
    );
  };

  beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
  });

  it('locks the employee for update, reads the account, and only then counts the departments, in the same transaction', async () => {
    await service().assertUsable(tx, 'emp-it');

    expect(calls).toEqual(['lock:UPDATE', 'account', 'count']);
    expect(departments.countActiveInChargeOf).toHaveBeenCalledWith(tx, 'emp-it');
  });

  it('judges the person before the count: an unusable account is invalid and the departments are not even counted', async () => {
    accounts.inspectEmployeeAccount.mockResolvedValueOnce({ usable: false, roles: ['IT_ADMIN'] });

    await expect(service().assertUsable(tx, 'emp-it')).rejects.toBeInstanceOf(DepartmentItAdminInvalidError);
    expect(departments.countActiveInChargeOf).not.toHaveBeenCalled();
  });

  it('refuses a person who already answers for four departments and takes one who answers for three', async () => {
    await expect(service().assertUsable(tx, 'emp-it')).resolves.toBeUndefined();

    departments.countActiveInChargeOf.mockResolvedValueOnce(4);
    await expect(service().assertUsable(tx, 'emp-it')).rejects.toBeInstanceOf(DepartmentItAdminLimitReachedError);
  });

  it('locks candidate and validates pre-locked employee identically via lockCandidate + assertUsableLocked', async () => {
    const locked = await service().lockCandidate(tx, 'emp-it');
    expect(locked).toEqual({ id: 'emp-it', status: 'ACTIVE' });
    await expect(service().assertUsableLocked(tx, 'emp-it', locked)).resolves.toBeUndefined();

    await expect(service().assertUsableLocked(tx, 'emp-it', null)).rejects.toBeInstanceOf(
      DepartmentItAdminInvalidError,
    );
    departments.countActiveInChargeOf.mockResolvedValueOnce(4);
    await expect(service().assertUsableLocked(tx, 'emp-it', locked)).rejects.toBeInstanceOf(
      DepartmentItAdminLimitReachedError,
    );
  });

  it('closes active substitute on non-null in-charge naming and computes overLimit, while leaving null untouched', async () => {
    substitutes.endActiveForDepartment.mockResolvedValueOnce({
      id: 'sub-1',
      department: { id: 'dep-1', name: 'D' },
      substitute: { id: 'emp-sub', fullName: 'S' },
      replaced: { id: 'emp-old', fullName: 'O' },
    });
    const after: Record<string, string | boolean | null> = {};
    const load = await service().onInChargeNamed(
      tx,
      actor,
      'org-1',
      'dep-1',
      'emp-it',
      after,
      new Date('2026-10-19T10:00:00Z'),
    );

    expect(substitutes.endActiveForDepartment).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ departmentId: 'dep-1', endCause: 'IN_CHARGE_NAMED' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'DEPARTMENT_IT_SUBSTITUTE.ENDED' }),
    );
    expect(notifications.notifyInApp).toHaveBeenCalledTimes(2);
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(
      1,
      tx,
      expect.objectContaining({
        organizationId: 'org-1',
        recipientEmployeeId: 'emp-sub',
        code: 'DEPARTMENT_IT_SUBSTITUTE_ENDED',
        subject: { type: 'DEPARTMENT', id: 'dep-1' },
        eventKey: 'departmentItSubstituteEnded:sub-1',
        params: {
          substituteId: 'sub-1',
          departmentId: 'dep-1',
          substituteEmployeeId: 'emp-sub',
          endCause: 'IN_CHARGE_NAMED',
        },
      }),
    );
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(
      2,
      tx,
      expect.objectContaining({
        recipientEmployeeId: 'emp-old',
        code: 'DEPARTMENT_IT_SUBSTITUTE_ENDED',
        eventKey: 'departmentItSubstituteEnded:sub-1',
      }),
    );
    expect(load).toEqual({ employeeId: 'emp-it', inChargeCount: 3, substituteCount: 2, overLimit: true });
    expect(after.overLimit).toBe(true);

    notifications.notifyInApp.mockClear();
    expect(
      await service().onInChargeNamed(tx, actor, 'org-1', 'dep-1', null, {}, new Date('2026-10-19T10:00:00Z')),
    ).toBeNull();
    expect(substitutes.endActiveForDepartment).toHaveBeenCalledTimes(1);
    expect(notifications.notifyInApp).not.toHaveBeenCalled();

    substitutes.endActiveForDepartment.mockResolvedValueOnce({
      id: 'sub-2',
      department: { id: 'dep-1', name: 'D' },
      substitute: { id: 'emp-sub', fullName: 'S' },
      replaced: null,
    });
    await service().closeActiveSubstitute(
      tx,
      actor,
      'org-1',
      'dep-1',
      'DEPARTMENT_RETIRED',
      new Date('2026-10-19T10:00:00Z'),
    );
    expect(notifications.notifyInApp).toHaveBeenCalledTimes(1);
    expect(notifications.notifyInApp).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recipientEmployeeId: 'emp-sub',
        code: 'DEPARTMENT_IT_SUBSTITUTE_ENDED',
        eventKey: 'departmentItSubstituteEnded:sub-2',
        params: {
          substituteId: 'sub-2',
          departmentId: 'dep-1',
          substituteEmployeeId: 'emp-sub',
          endCause: 'DEPARTMENT_RETIRED',
        },
      }),
    );
  });
});
