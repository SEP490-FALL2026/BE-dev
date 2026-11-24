import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { EmployeeRecordService } from '../employee/employee-record.service';
import type { OrganizationContextService } from '../organization-context.service';
import { EmployeeNotFoundError } from '../public/organization.errors';
import { EmployeeAccountsHook, type EmployeeAccounts } from '../public/organization.extension-points';
import {
  UnplacedWorkDesignationAlreadyActiveError,
  UnplacedWorkDesignationAlreadyEndedError,
  UnplacedWorkDesignationEmployeePlacedError,
  UnplacedWorkDesignationForbiddenError,
  UnplacedWorkDesignationNotFoundError,
  UnplacedWorkDesignationNotUsableError,
} from './unplaced-work-designation.errors';
import type { UnplacedWorkDesignationRecord } from './unplaced-work-designation.mapper';
import type { UnplacedWorkDesignationRepo } from './unplaced-work-designation.repo';
import { UnplacedWorkDesignationService } from './unplaced-work-designation.service';

const containing = (fields: object): unknown => expect.objectContaining(fields);

const principal = (role: string, employeeId = 'emp-actor'): AuthenticatedPrincipal => ({
  subject: 'app-user-1',
  appUserId: 'app-user-1',
  sessionId: 'session-1',
  employeeId,
  directRoles: [role],
  roles: [role],
});

describe('UnplacedWorkDesignationService', () => {
  const tx = { name: 'tx' };
  const superAdmin = principal('SUPER_ADMIN');
  const calls: string[] = [];

  const repo = {
    lockEmployeesForUpdate: jest.fn(),
    findById: jest.fn(),
    findActiveByWorks: jest.fn(),
    insertMany: jest.fn(),
    endById: jest.fn(),
    list: jest.fn(),
  };
  const employees = {
    lock: jest.fn(),
    findMany: jest.fn(),
    unplacedAmong: jest.fn(),
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

    return new UnplacedWorkDesignationService(
      repo as unknown as UnplacedWorkDesignationRepo,
      employees as unknown as EmployeeRecordService,
      hook,
      context as unknown as OrganizationContextService,
      audit as unknown as AuditApi,
      notifications as unknown as NotificationsApi,
      runner as unknown as TransactionRunner,
    );
  };

  const makeRecord = (overrides: Partial<UnplacedWorkDesignationRecord> = {}): UnplacedWorkDesignationRecord => ({
    id: 'des-1',
    organizationId: 'org-1',
    workKind: 'PROVISIONING_TASK',
    workId: 'work-1',
    employee: { id: 'emp-binh', fullName: 'Binh' },
    designee: { id: 'emp-it-b', fullName: 'IT B' },
    designeeStatus: 'ACTIVE',
    reason: 'Never placed in a department',
    appointedAt: new Date('2026-11-24T10:00:00.000Z'),
    appointedByAppUserId: 'app-user-1',
    endedAt: null,
    endedByAppUserId: null,
    endCause: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    context.findOrganization.mockResolvedValue({ id: 'org-1' });
    repo.lockEmployeesForUpdate.mockImplementation((_tx, ids: string[]) => {
      calls.push(`lockMany:${ids.join(',')}`);
      return Promise.resolve(ids);
    });
    employees.lock.mockImplementation((_tx, id: string) => {
      calls.push(`lock:${id}`);
      return Promise.resolve();
    });
    employees.findMany.mockResolvedValue([
      { id: 'emp-binh', status: 'ACTIVE' },
      { id: 'emp-it-b', status: 'ACTIVE' },
    ]);
    employees.unplacedAmong.mockResolvedValue(new Set(['emp-binh']));
    accounts.inspectEmployeeAccount.mockImplementation(() => {
      calls.push('inspect:account');
      return Promise.resolve({ hasAccount: true, usable: true, roles: ['IT_ADMIN'] });
    });
    accounts.findUsableItAdminEmployeeIds.mockResolvedValue(new Set(['emp-it-b']));
    repo.findActiveByWorks.mockResolvedValue([]);
    repo.insertMany.mockResolvedValue([
      makeRecord({ id: 'des-1', workKind: 'OFFBOARDING_CASE', workId: 'work-1' }),
      makeRecord({ id: 'des-2', workKind: 'DEVICE_RETURN_TASK', workId: 'work-2' }),
    ]);
    repo.findById.mockResolvedValue(makeRecord());
    repo.endById.mockResolvedValue(
      makeRecord({
        endedAt: new Date('2026-11-24T12:00:00.000Z'),
        endedByAppUserId: 'app-user-1',
        endCause: 'REMOVED',
      }),
    );
  });

  it.each(['IT_ADMIN', 'MANAGER', 'FINANCE', 'EMPLOYEE'])(
    'refuses %s on appoint and end before touching DB',
    async (role) => {
      const actor = principal(role);
      const service = makeService();

      await expect(
        service.appoint(actor, {
          employeeId: 'emp-binh',
          designeeEmployeeId: 'emp-it-b',
          reason: 'Cover',
          works: [{ workKind: 'PROVISIONING_TASK', workId: 'work-1' }],
        }),
      ).rejects.toBeInstanceOf(UnplacedWorkDesignationForbiddenError);
      await expect(service.end(actor, 'des-1')).rejects.toBeInstanceOf(UnplacedWorkDesignationForbiddenError);
      expect(runner.run).not.toHaveBeenCalled();
    },
  );

  it('locks both employees in one query, inserts all works, audits each, and notifies the designee per work', async () => {
    const result = await makeService().appoint(superAdmin, {
      employeeId: 'emp-binh',
      designeeEmployeeId: 'emp-it-b',
      reason: '  Never placed in a department  ',
      works: [
        { workKind: 'OFFBOARDING_CASE', workId: 'work-1' },
        { workKind: 'DEVICE_RETURN_TASK', workId: 'work-2' },
      ],
    });

    expect(calls).toEqual(['lockMany:emp-binh,emp-it-b', 'inspect:account']);
    expect(repo.lockEmployeesForUpdate).toHaveBeenCalledWith(tx, ['emp-binh', 'emp-it-b']);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].designeeUsable).toBe(true);
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenNthCalledWith(
      1,
      tx,
      containing({
        action: 'UNPLACED_WORK_DESIGNATION.APPOINTED',
        resourceType: 'UnplacedWorkItDesignation',
        resourceId: 'des-1',
        after: containing({
          workKind: 'OFFBOARDING_CASE',
          workId: 'work-1',
          employeeId: 'emp-binh',
          designeeEmployeeId: 'emp-it-b',
          reason: 'Never placed in a department',
        }),
      }),
    );
    expect(notifications.notifyInApp).toHaveBeenCalledTimes(2);
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(
      1,
      tx,
      containing({
        organizationId: 'org-1',
        recipientEmployeeId: 'emp-it-b',
        code: 'UNPLACED_WORK_DESIGNATED',
        subject: { type: 'UNPLACED_WORK_DESIGNATION', id: 'des-1' },
        eventKey: 'unplacedWorkDesignated:des-1',
        params: {
          designationId: 'des-1',
          workKind: 'OFFBOARDING_CASE',
          workId: 'work-1',
          employeeId: 'emp-binh',
        },
      }),
    );
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(
      2,
      tx,
      containing({
        recipientEmployeeId: 'emp-it-b',
        code: 'UNPLACED_WORK_DESIGNATED',
        subject: { type: 'UNPLACED_WORK_DESIGNATION', id: 'des-2' },
        eventKey: 'unplacedWorkDesignated:des-2',
      }),
    );
  });

  it('deduplicates employee ids when employeeId equals designeeEmployeeId', async () => {
    employees.findMany.mockResolvedValueOnce([{ id: 'emp-same', status: 'ACTIVE' }]);
    employees.unplacedAmong.mockResolvedValueOnce(new Set(['emp-same']));
    repo.insertMany.mockResolvedValueOnce([
      makeRecord({
        employee: { id: 'emp-same', fullName: 'Same' },
        designee: { id: 'emp-same', fullName: 'Same' },
      }),
    ]);

    await makeService().appoint(superAdmin, {
      employeeId: 'emp-same',
      designeeEmployeeId: 'emp-same',
      reason: 'Self',
      works: [{ workKind: 'DEVICE', workId: 'work-1' }],
    });

    expect(repo.lockEmployeesForUpdate).toHaveBeenCalledWith(tx, ['emp-same']);
  });

  it('refuses missing employee (404), placed employee (409), unusable designee (422), and active work (409)', async () => {
    const service = makeService();
    const input = {
      employeeId: 'emp-binh',
      designeeEmployeeId: 'emp-it-b',
      reason: 'Cover',
      works: [{ workKind: 'PROVISIONING_TASK' as const, workId: 'work-1' }],
    };

    employees.findMany.mockResolvedValueOnce([{ id: 'emp-it-b', status: 'ACTIVE' }]);
    await expect(service.appoint(superAdmin, input)).rejects.toBeInstanceOf(EmployeeNotFoundError);

    employees.unplacedAmong.mockResolvedValueOnce(new Set());
    await expect(service.appoint(superAdmin, input)).rejects.toBeInstanceOf(UnplacedWorkDesignationEmployeePlacedError);

    employees.findMany.mockResolvedValueOnce([{ id: 'emp-binh', status: 'ACTIVE' }]);
    await expect(service.appoint(superAdmin, input)).rejects.toBeInstanceOf(UnplacedWorkDesignationNotUsableError);

    employees.findMany.mockResolvedValueOnce([
      { id: 'emp-binh', status: 'ACTIVE' },
      { id: 'emp-it-b', status: 'TERMINATED' },
    ]);
    await expect(service.appoint(superAdmin, input)).rejects.toBeInstanceOf(UnplacedWorkDesignationNotUsableError);

    accounts.inspectEmployeeAccount.mockResolvedValueOnce({ hasAccount: true, usable: true, roles: ['EMPLOYEE'] });
    await expect(service.appoint(superAdmin, input)).rejects.toBeInstanceOf(UnplacedWorkDesignationNotUsableError);

    repo.findActiveByWorks.mockResolvedValueOnce([{ workKind: 'PROVISIONING_TASK', workId: 'work-1' }]);
    await expect(service.appoint(superAdmin, input)).rejects.toBeInstanceOf(UnplacedWorkDesignationAlreadyActiveError);
  });

  it('ends an active designation by locking tier 1 employee FOR UPDATE, updating endCause REMOVED, and auditing', async () => {
    const ended = await makeService().end(superAdmin, 'des-1');

    expect(employees.lock).toHaveBeenCalledWith(tx, 'emp-binh', 'UPDATE');
    expect(repo.findById).toHaveBeenCalledTimes(2);
    expect(ended.endCause).toBe('REMOVED');
    expect(ended.designeeUsable).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      containing({
        action: 'UNPLACED_WORK_DESIGNATION.ENDED',
        resourceType: 'UnplacedWorkItDesignation',
        resourceId: 'des-1',
        after: containing({ endCause: 'REMOVED' }),
      }),
    );
  });

  it('refuses missing or already ended designation on end', async () => {
    const service = makeService();
    repo.findById.mockResolvedValueOnce(null);
    await expect(service.end(superAdmin, 'des-1')).rejects.toBeInstanceOf(UnplacedWorkDesignationNotFoundError);

    repo.findById.mockResolvedValueOnce(makeRecord());
    repo.findById.mockResolvedValueOnce(makeRecord({ endedAt: new Date(), endCause: 'REMOVED' }));
    await expect(service.end(superAdmin, 'des-1')).rejects.toBeInstanceOf(UnplacedWorkDesignationAlreadyEndedError);
  });

  it('lists designations scoped to designee for IT_ADMIN and checks designee ACTIVE + usable in batch', async () => {
    repo.list.mockResolvedValue({
      items: [
        makeRecord({ id: 'des-1', designee: { id: 'emp-it-b', fullName: 'IT B' }, designeeStatus: 'ACTIVE' }),
        makeRecord({ id: 'des-2', designee: { id: 'emp-it-c', fullName: 'IT C' }, designeeStatus: 'TERMINATED' }),
      ],
      total: 2,
    });
    accounts.findUsableItAdminEmployeeIds.mockResolvedValue(new Set(['emp-it-b', 'emp-it-c']));

    const page = await makeService().list(principal('IT_ADMIN', 'emp-it-b'), {
      state: 'ACTIVE',
      workKind: 'PROVISIONING_TASK',
      page: 1,
      pageSize: 20,
    });

    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'ACTIVE',
        workKind: 'PROVISIONING_TASK',
        designeeEmployeeId: 'emp-it-b',
        skip: 0,
        take: 20,
      }),
    );
    expect(accounts.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['emp-it-b', 'emp-it-c']);
    expect(page.items.map((item) => item.designeeUsable)).toEqual([true, false]);
  });

  it('lists all designations for SUPER_ADMIN without designee scope filter', async () => {
    repo.list.mockResolvedValue({ items: [], total: 0 });

    await makeService().list(superAdmin, { state: 'ALL', employeeId: 'emp-binh', page: 2, pageSize: 10 });

    expect(repo.list).toHaveBeenCalledWith({
      state: 'ALL',
      employeeId: 'emp-binh',
      skip: 10,
      take: 10,
    });
    expect(accounts.findUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });
});
