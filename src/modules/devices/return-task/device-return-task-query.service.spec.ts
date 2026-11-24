import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import { DeviceReturnTaskNotFoundError } from './device-return-task.errors';
import { DeviceReturnTaskQueryService } from './device-return-task-query.service';
import type { DeviceReturnTaskRepo } from './device-return-task.repo';
import type { ReturnTaskListRow } from './device-return-task.types';

const principal = (employeeId: string, roles: readonly string[] = ['IT_ADMIN']): AuthenticatedPrincipal => ({
  subject: `user-${employeeId}`,
  appUserId: `user-${employeeId}`,
  sessionId: 'sess-1',
  employeeId,
  directRoles: roles,
  roles,
});

const listRow = (overrides: Partial<ReturnTaskListRow> = {}): ReturnTaskListRow => ({
  id: 'task-1',
  organizationId: 'org-1',
  deviceId: 'dev-1',
  registrationId: 'reg-1',
  employeeId: 'emp-1',
  offboardingCaseId: 'case-1',
  departmentId: 'dep-1',
  dueOn: '2026-11-20',
  state: 'OPEN',
  conditionOnReceipt: null,
  softwareRemoval: null,
  softwareRemovalNote: null,
  outcomeNote: null,
  handledByAppUserId: null,
  handledAt: null,
  overdueNoticedOn: null,
  createdAt: new Date('2026-11-15T00:00:00.000Z'),
  deviceAssetCode: 'LAP-26-0001',
  deviceHostname: 'DES-01',
  ...overrides,
});

function buildQueryService(rows: ReturnTaskListRow[]) {
  const page = jest.fn().mockResolvedValue({ rows, total: rows.length });
  const findDetailById = jest.fn().mockResolvedValue(rows[0] ?? null);
  const repo = { page, findDetailById } as unknown as DeviceReturnTaskRepo;

  const getItAdminActingScope = jest.fn().mockResolvedValue(['dep-1']);
  const getItAdminScope = jest.fn().mockResolvedValue(['dep-1', 'dep-2']);
  const getDepartmentBriefs = jest.fn().mockResolvedValue([{ id: 'dep-1', name: 'Design' }]);
  const itAdminsActingFor = jest
    .fn()
    .mockResolvedValue(
      new Map([['dep-1', { inCharge: 'it-in-charge', substitute: 'it-sub', actors: ['it-in-charge', 'it-sub'] }]]),
    );
  const getEmployees = jest.fn().mockResolvedValue([
    { id: 'emp-1', employeeCode: 'NV-01', fullName: 'Holder One' },
    { id: 'it-in-charge', employeeCode: 'NV-02', fullName: 'InCharge IT' },
    { id: 'it-sub', employeeCode: 'NV-03', fullName: 'Sub IT' },
    { id: 'it-des', employeeCode: 'NV-04', fullName: 'Designee IT' },
  ]);
  const findActiveUnplacedWorkIdsForDesignee = jest.fn().mockResolvedValue([]);
  const itAdminsActingForUnplacedWork = jest.fn().mockResolvedValue(new Map());
  const organizationReads = {
    getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
    businessToday: jest.fn().mockResolvedValue('2026-11-25'),
    getItAdminActingScope,
    getItAdminScope,
    getDepartmentBriefs,
    itAdminsActingFor,
    findActiveUnplacedWorkIdsForDesignee,
    itAdminsActingForUnplacedWork,
    getEmployees,
  } as unknown as OrganizationReadApi;

  const identity = {
    findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['it-in-charge', 'it-sub', 'it-des'])),
  } as unknown as IdentityAccessApi;

  const service = new DeviceReturnTaskQueryService(repo, organizationReads, identity);

  return {
    service,
    page,
    getItAdminActingScope,
    getItAdminScope,
    itAdminsActingFor,
    findActiveUnplacedWorkIdsForDesignee,
    itAdminsActingForUnplacedWork,
  };
}

describe('DeviceReturnTaskQueryService', () => {
  it('lists MINE tasks using acting scope, excluding self, and marks waiting when leaver is sole IT Admin', async () => {
    const leaverIsItRow = listRow({ employeeId: 'it-in-charge' });
    const { service, page, getItAdminActingScope, itAdminsActingFor } = buildQueryService([leaverIsItRow]);

    const onlyInCharge = new Map([['dep-1', { inCharge: 'it-in-charge', substitute: null, actors: ['it-in-charge'] }]]);
    itAdminsActingFor.mockResolvedValue(onlyInCharge);

    const res = await service.list(principal('it-sub'), {
      scope: 'MINE',
      state: 'OPEN',
      overdue: true,
      page: 1,
      pageSize: 20,
    });

    expect(getItAdminActingScope).toHaveBeenCalledWith('it-sub', expect.any(Function));
    expect(page).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        departmentIds: ['dep-1'],
        excludeEmployeeId: 'it-sub',
        state: 'OPEN',
        overdue: true,
        today: '2026-11-25',
      },
      0,
      20,
    );
    expect(itAdminsActingFor).toHaveBeenCalledTimes(1);
    expect(res.items[0]).toMatchObject({
      id: 'task-1',
      actingItAdmins: [],
      waiting: true,
      overdue: true,
    });
  });

  it('uses getItAdminScope for ALL and lets SUPER_ADMIN ignore scope including null department tasks', async () => {
    const row = listRow({ departmentId: null });
    const { service, page, getItAdminScope, itAdminsActingFor } = buildQueryService([row]);

    await service.list(principal('it-1'), { scope: 'ALL', state: 'ALL', page: 2, pageSize: 10 });
    expect(getItAdminScope).toHaveBeenCalledWith('it-1', expect.any(Function));
    expect(page).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        departmentIds: ['dep-1', 'dep-2'],
        state: 'ALL',
        overdue: undefined,
        today: '2026-11-25',
      },
      10,
      10,
    );

    const saRes = await service.list(principal('sa-1', ['SUPER_ADMIN']), {
      scope: 'MINE',
      state: 'OPEN',
      page: 1,
      pageSize: 20,
    });
    expect(page).toHaveBeenLastCalledWith(
      {
        organizationId: 'org-1',
        state: 'OPEN',
        overdue: undefined,
        today: '2026-11-25',
      },
      0,
      20,
    );
    expect(itAdminsActingFor).not.toHaveBeenCalled();
    expect(saRes.items[0].waiting).toBe(true);
    expect(saRes.items[0].department).toBeNull();
  });

  it('throws DeviceReturnTaskNotFoundError when detail row does not exist', async () => {
    const { service } = buildQueryService([]);

    await expect(service.get('missing-id')).rejects.toThrow(DeviceReturnTaskNotFoundError);
  });

  it('includes unplaced designated return tasks in MINE and resolves their acting designee', async () => {
    const row = listRow({ id: 'task-u1', departmentId: null, employeeId: 'emp-1' });
    const {
      service,
      page,
      getItAdminActingScope,
      findActiveUnplacedWorkIdsForDesignee,
      itAdminsActingForUnplacedWork,
    } = buildQueryService([row]);
    getItAdminActingScope.mockResolvedValue([]);
    findActiveUnplacedWorkIdsForDesignee.mockResolvedValue(['task-u1']);
    itAdminsActingForUnplacedWork.mockResolvedValue(
      new Map([[unplacedWorkKey('DEVICE_RETURN_TASK', 'task-u1'), 'it-des']]),
    );

    const res = await service.list(principal('it-des'), { scope: 'MINE', state: 'OPEN', page: 1, pageSize: 20 });

    expect(findActiveUnplacedWorkIdsForDesignee).toHaveBeenCalledWith('it-des', 'DEVICE_RETURN_TASK');
    expect(page).toHaveBeenCalledWith(
      expect.objectContaining({ departmentIds: [], includeTaskIds: ['task-u1'], excludeEmployeeId: 'it-des' }),
      0,
      20,
    );
    expect(res.items[0]).toMatchObject({
      id: 'task-u1',
      waiting: false,
      actingItAdmins: [{ id: 'it-des', fullName: 'Designee IT', bySubstitute: true }],
    });
  });
});
