import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { DepartmentRecordService } from '../department/department-record.service';
import { DepartmentNotFoundError } from '../department/department.errors';
import type { EmployeeRecordService } from '../employee/employee-record.service';
import type { OrganizationContextService } from '../organization-context.service';
import { EmployeeNotFoundError } from '../public/organization.errors';
import { EmployeeAccountsHook, type EmployeeAccounts } from '../public/organization.extension-points';
import {
  DepartmentItSubstituteAlreadyActiveError,
  DepartmentItSubstituteAlreadyEndedError,
  DepartmentItSubstituteDepartmentInactiveError,
  DepartmentItSubstituteForbiddenError,
  DepartmentItSubstituteIsInChargeError,
  DepartmentItSubstituteNotFoundError,
  DepartmentItSubstituteNotUsableError,
} from './department-it-substitute.errors';
import type { DepartmentItSubstituteRepo } from './department-it-substitute.repo';
import { DepartmentItSubstituteService } from './department-it-substitute.service';

const containing = (fields: object): unknown => expect.objectContaining(fields);

const principal = (role: string, employeeId = 'emp-actor'): AuthenticatedPrincipal => ({
  subject: 'app-user-1',
  appUserId: 'app-user-1',
  sessionId: 'session-1',
  employeeId,
  directRoles: [role],
  roles: [role],
});

describe('DepartmentItSubstituteService', () => {
  const tx = { name: 'tx' };
  const superAdmin = principal('SUPER_ADMIN');
  const calls: string[] = [];

  const repo = {
    findById: jest.fn(),
    findActiveByDepartmentId: jest.fn(),
    insert: jest.fn(),
    endById: jest.fn(),
    countActiveBySubstitute: jest.fn(),
    list: jest.fn(),
  };
  const departmentRecords = {
    lockForUpdate: jest.fn(),
    countActiveInChargeExcludingStarting: jest.fn(),
    itAdminScopeOf: jest.fn(),
  };
  const employees = {
    lock: jest.fn(),
    find: jest.fn(),
  };
  const accounts = {
    inspectEmployeeAccount: jest.fn(),
    findUsableItAdminEmployeeIds: jest.fn(),
  };
  const context = { findOrganization: jest.fn() };
  const audit = { record: jest.fn() };
  const notifications = { notifyInApp: jest.fn().mockResolvedValue(true) };
  const runner = { run: jest.fn((work: (t: unknown) => Promise<unknown>) => work(tx)) };

  const makeService = () => {
    const hook = new EmployeeAccountsHook();
    hook.bind(accounts as unknown as EmployeeAccounts);

    return new DepartmentItSubstituteService(
      repo as unknown as DepartmentItSubstituteRepo,
      departmentRecords as unknown as DepartmentRecordService,
      employees as unknown as EmployeeRecordService,
      hook,
      context as unknown as OrganizationContextService,
      audit as unknown as AuditApi,
      notifications as unknown as NotificationsApi,
      runner as unknown as TransactionRunner,
    );
  };

  const activeDept = { id: 'dep-1', name: 'Design', status: 'ACTIVE', itAdmin: { employeeId: 'emp-ha' } };
  const createdSub = {
    id: 'sub-1',
    organizationId: 'org-1',
    department: { id: 'dep-1', name: 'Design' },
    substitute: { id: 'emp-minh', fullName: 'Minh' },
    replaced: { id: 'emp-ha', fullName: 'Ha' },
    reason: 'Ha on leave',
    appointedAt: new Date('2026-11-23T10:00:00.000Z'),
    appointedByAppUserId: 'app-user-1',
    endedAt: null,
    endedByAppUserId: null,
    endCause: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    context.findOrganization.mockResolvedValue({ id: 'org-1' });
    employees.lock.mockImplementation(() => {
      calls.push('lock:employee');

      return Promise.resolve();
    });
    employees.find.mockResolvedValue({ id: 'emp-minh', status: 'ACTIVE' });
    departmentRecords.lockForUpdate.mockImplementation(() => {
      calls.push('lock:department');

      return Promise.resolve(activeDept);
    });
    accounts.inspectEmployeeAccount.mockImplementation(() => {
      calls.push('inspect:account');

      return Promise.resolve({ hasAccount: true, usable: true, roles: ['IT_ADMIN'] });
    });
    accounts.findUsableItAdminEmployeeIds.mockResolvedValue(new Set(['emp-minh']));
    repo.findActiveByDepartmentId.mockResolvedValue(null);
    repo.insert.mockResolvedValue(createdSub);
    departmentRecords.countActiveInChargeExcludingStarting.mockResolvedValue(1);
    repo.countActiveBySubstitute.mockResolvedValue(1);
    repo.findById.mockResolvedValue(createdSub);
    repo.endById.mockResolvedValue({
      ...createdSub,
      endedAt: new Date(),
      endedByAppUserId: 'app-user-1',
      endCause: 'REMOVED',
    });
  });

  it.each(['IT_ADMIN', 'MANAGER', 'FINANCE', 'EMPLOYEE'])(
    'refuses %s on appoint and end before touching DB',
    async (role) => {
      const actor = principal(role);
      const service = makeService();

      await expect(
        service.appoint(actor, 'dep-1', { substituteEmployeeId: 'emp-minh', reason: 'Leave' }),
      ).rejects.toBeInstanceOf(DepartmentItSubstituteForbiddenError);
      await expect(service.end(actor, 'sub-1')).rejects.toBeInstanceOf(DepartmentItSubstituteForbiddenError);
      expect(runner.run).not.toHaveBeenCalled();
    },
  );

  it('locks employee FOR UPDATE first, then department FOR UPDATE, inspects account, inserts, computes load, and audits', async () => {
    const result = await makeService().appoint(superAdmin, 'dep-1', {
      substituteEmployeeId: 'emp-minh',
      reason: '  Ha on leave  ',
    });

    expect(calls).toEqual(['lock:employee', 'lock:department', 'inspect:account']);
    expect(employees.lock).toHaveBeenCalledWith(tx, 'emp-minh', 'UPDATE');
    expect(departmentRecords.lockForUpdate).toHaveBeenCalledWith(tx, 'dep-1');
    expect(result.substitute.id).toBe('sub-1');
    expect(result.itAdminLoad).toEqual({
      employeeId: 'emp-minh',
      inChargeCount: 1,
      substituteCount: 1,
      overLimit: false,
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      containing({
        action: 'DEPARTMENT_IT_SUBSTITUTE.APPOINTED',
        resourceType: 'DepartmentItSubstitute',
        resourceId: 'sub-1',
        after: containing({
          departmentId: 'dep-1',
          substituteEmployeeId: 'emp-minh',
          reason: 'Ha on leave',
        }),
      }),
    );
    expect(notifications.notifyInApp).toHaveBeenCalledTimes(2);
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(
      1,
      tx,
      containing({
        organizationId: 'org-1',
        recipientEmployeeId: 'emp-minh',
        code: 'DEPARTMENT_IT_SUBSTITUTE_APPOINTED',
        subject: { type: 'DEPARTMENT', id: 'dep-1' },
        eventKey: 'departmentItSubstituteAppointed:sub-1',
        params: {
          substituteId: 'sub-1',
          departmentId: 'dep-1',
          substituteEmployeeId: 'emp-minh',
          replacedEmployeeId: 'emp-ha',
        },
      }),
    );
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(
      2,
      tx,
      containing({
        recipientEmployeeId: 'emp-ha',
        code: 'DEPARTMENT_IT_SUBSTITUTE_APPOINTED',
        eventKey: 'departmentItSubstituteAppointed:sub-1',
      }),
    );
  });

  it('notifies only the substitute on appoint and end when replacedEmployeeId is null', async () => {
    departmentRecords.lockForUpdate.mockResolvedValueOnce({
      id: 'dep-1',
      name: 'Design',
      status: 'ACTIVE',
      itAdmin: null,
    });
    repo.insert.mockResolvedValueOnce({ ...createdSub, replaced: null });
    await makeService().appoint(superAdmin, 'dep-1', { substituteEmployeeId: 'emp-minh', reason: 'Cover' });

    expect(notifications.notifyInApp).toHaveBeenCalledTimes(1);
    expect(notifications.notifyInApp).toHaveBeenCalledWith(
      tx,
      containing({
        recipientEmployeeId: 'emp-minh',
        code: 'DEPARTMENT_IT_SUBSTITUTE_APPOINTED',
        params: containing({ replacedEmployeeId: null }),
      }),
    );

    notifications.notifyInApp.mockClear();
    repo.findById.mockResolvedValueOnce({ ...createdSub, replaced: null });
    repo.findById.mockResolvedValueOnce({ ...createdSub, replaced: null });
    repo.endById.mockResolvedValueOnce({
      ...createdSub,
      replaced: null,
      endedAt: new Date(),
      endedByAppUserId: 'app-user-1',
      endCause: 'REMOVED',
    });
    await makeService().end(superAdmin, 'sub-1');

    expect(notifications.notifyInApp).toHaveBeenCalledTimes(1);
    expect(notifications.notifyInApp).toHaveBeenCalledWith(
      tx,
      containing({
        recipientEmployeeId: 'emp-minh',
        code: 'DEPARTMENT_IT_SUBSTITUTE_ENDED',
        eventKey: 'departmentItSubstituteEnded:sub-1',
        params: {
          substituteId: 'sub-1',
          departmentId: 'dep-1',
          substituteEmployeeId: 'emp-minh',
          endCause: 'REMOVED',
        },
      }),
    );
  });

  it('allows over-limit substitute (>4) as warning and records overLimit: true in audit', async () => {
    departmentRecords.countActiveInChargeExcludingStarting.mockResolvedValue(4);
    repo.countActiveBySubstitute.mockResolvedValue(1);

    const result = await makeService().appoint(superAdmin, 'dep-1', {
      substituteEmployeeId: 'emp-minh',
      reason: 'Cover',
    });

    expect(result.itAdminLoad).toEqual({
      employeeId: 'emp-minh',
      inChargeCount: 4,
      substituteCount: 1,
      overLimit: true,
    });
    expect(audit.record).toHaveBeenCalledWith(tx, containing({ after: containing({ overLimit: true }) }));
  });

  it('refuses missing department, inactive department, already active, is-in-charge, and non-usable IT Admin', async () => {
    const service = makeService();

    departmentRecords.lockForUpdate.mockResolvedValueOnce(null);
    await expect(
      service.appoint(superAdmin, 'dep-1', { substituteEmployeeId: 'emp-minh', reason: 'r' }),
    ).rejects.toBeInstanceOf(DepartmentNotFoundError);

    departmentRecords.lockForUpdate.mockResolvedValueOnce({ ...activeDept, status: 'INACTIVE' });
    await expect(
      service.appoint(superAdmin, 'dep-1', { substituteEmployeeId: 'emp-minh', reason: 'r' }),
    ).rejects.toBeInstanceOf(DepartmentItSubstituteDepartmentInactiveError);

    repo.findActiveByDepartmentId.mockResolvedValueOnce(createdSub);
    await expect(
      service.appoint(superAdmin, 'dep-1', { substituteEmployeeId: 'emp-minh', reason: 'r' }),
    ).rejects.toBeInstanceOf(DepartmentItSubstituteAlreadyActiveError);

    employees.lock.mockRejectedValueOnce(new EmployeeNotFoundError('emp-minh'));
    await expect(
      service.appoint(superAdmin, 'dep-1', { substituteEmployeeId: 'emp-minh', reason: 'r' }),
    ).rejects.toBeInstanceOf(DepartmentItSubstituteNotUsableError);

    accounts.inspectEmployeeAccount.mockResolvedValueOnce({ hasAccount: true, usable: true, roles: ['EMPLOYEE'] });
    await expect(
      service.appoint(superAdmin, 'dep-1', { substituteEmployeeId: 'emp-minh', reason: 'r' }),
    ).rejects.toBeInstanceOf(DepartmentItSubstituteNotUsableError);

    await expect(
      service.appoint(superAdmin, 'dep-1', { substituteEmployeeId: 'emp-ha', reason: 'r' }),
    ).rejects.toBeInstanceOf(DepartmentItSubstituteIsInChargeError);
  });

  it('ends an active substitute by locking department FOR UPDATE, re-reading substitute, and auditing', async () => {
    const ended = await makeService().end(superAdmin, 'sub-1');

    expect(departmentRecords.lockForUpdate).toHaveBeenCalledWith(tx, 'dep-1');
    expect(repo.findById).toHaveBeenCalledTimes(2);
    expect(ended.endCause).toBe('REMOVED');
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      containing({
        action: 'DEPARTMENT_IT_SUBSTITUTE.ENDED',
        after: containing({ endCause: 'REMOVED' }),
      }),
    );
    expect(notifications.notifyInApp).toHaveBeenCalledTimes(2);
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(
      1,
      tx,
      containing({
        recipientEmployeeId: 'emp-minh',
        code: 'DEPARTMENT_IT_SUBSTITUTE_ENDED',
        subject: { type: 'DEPARTMENT', id: 'dep-1' },
        eventKey: 'departmentItSubstituteEnded:sub-1',
        params: {
          substituteId: 'sub-1',
          departmentId: 'dep-1',
          substituteEmployeeId: 'emp-minh',
          endCause: 'REMOVED',
        },
      }),
    );
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(
      2,
      tx,
      containing({
        recipientEmployeeId: 'emp-ha',
        code: 'DEPARTMENT_IT_SUBSTITUTE_ENDED',
        eventKey: 'departmentItSubstituteEnded:sub-1',
      }),
    );
  });

  it('refuses missing or already ended substitute on end', async () => {
    const service = makeService();
    repo.findById.mockResolvedValueOnce(null);
    await expect(service.end(superAdmin, 'sub-1')).rejects.toBeInstanceOf(DepartmentItSubstituteNotFoundError);

    repo.findById.mockResolvedValueOnce(createdSub);
    repo.findById.mockResolvedValueOnce({ ...createdSub, endedAt: new Date(), endCause: 'REMOVED' });
    await expect(service.end(superAdmin, 'sub-1')).rejects.toBeInstanceOf(DepartmentItSubstituteAlreadyEndedError);
  });

  it('lists substitutes scoped by read scope or self-substitute for IT_ADMIN and batches usability lookup', async () => {
    departmentRecords.itAdminScopeOf.mockResolvedValue(['dep-1']);
    repo.list.mockResolvedValue({ items: [createdSub], total: 1 });

    const page = await makeService().list(principal('IT_ADMIN', 'emp-it'), { state: 'ACTIVE', page: 1, pageSize: 20 });

    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        readableDepartmentIds: ['dep-1'],
        callerSubstituteEmployeeId: 'emp-it',
        state: 'ACTIVE',
      }),
    );
    expect(accounts.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['emp-minh']);
    expect(page.items[0].substituteUsable).toBe(true);
  });
});
