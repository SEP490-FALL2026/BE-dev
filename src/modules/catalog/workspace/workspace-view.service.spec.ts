import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { WorkspaceAdminNotItAdminError } from './workspace.errors';
import type { WorkspaceRepo } from './workspace.repo';
import { WorkspaceViewService } from './workspace-view.service';
import type { WorkspaceRecord } from './workspace.types';

describe('WorkspaceViewService', () => {
  const tx = { tag: 'tx' } as never;

  function setup(
    options: {
      usable?: string[];
      blocks?: Array<[string, string]>;
      employee?: { status: string; workState: string } | null;
      account?: { usable: boolean; roles: string[] };
      lockFails?: Error;
    } = {},
  ) {
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(options.usable ?? [])),
      findDepartureBlocks: jest
        .fn()
        .mockResolvedValue(new Map((options.blocks ?? []).map(([id, blockedFrom]) => [id, { blockedFrom }]))),
      inspectEmployeeAccount: jest.fn().mockResolvedValue(options.account ?? { usable: true, roles: ['IT_ADMIN'] }),
    } as unknown as IdentityAccessApi;
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2026-12-09'),
      getEmployee: jest
        .fn()
        .mockResolvedValue(
          options.employee === undefined ? { status: 'ACTIVE', workState: 'WORKING' } : options.employee,
        ),
      getEmployees: jest.fn().mockResolvedValue([
        { id: 'khoa', fullName: 'Khoa' },
        { id: 'nam', fullName: 'Nam' },
      ]),
      lockEmployeeForShare: options.lockFails
        ? jest.fn().mockRejectedValue(options.lockFails)
        : jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationReadApi;
    const repo = {
      subscriptionCountsOf: jest.fn().mockResolvedValue(new Map([['ws-1', 3]])),
    } as unknown as WorkspaceRepo;

    return { service: new WorkspaceViewService(repo, organizationReads, identity), identity, organizationReads };
  }

  const workspace = {
    id: 'ws-1',
    vendorId: 'v-1',
    vendorName: 'Anthropic',
    name: 'Anthropic',
    ownerAccountEmail: 'it@acme.vn',
    primaryOwnerEmployeeId: 'khoa',
    responsibleItAdminEmployeeId: 'khoa',
    admins: [
      { employeeId: 'khoa', role: 'OWNER' },
      { employeeId: 'nam', role: 'ADMIN' },
    ],
    emergencyAccount: null,
    updatedAt: new Date('2026-12-01T00:00:00.000Z'),
  } as unknown as WorkspaceRecord;

  describe('who works now as an IT Admin', () => {
    it('keeps the accounts that can act and drops a person whose departure blocks them today or earlier', async () => {
      const { service } = setup({
        usable: ['khoa', 'nam', 'lan'],
        blocks: [
          ['nam', '2026-12-09'],
          ['lan', '2026-12-10'],
        ],
      });

      expect([...(await service.workingAdminsAmong(['khoa', 'nam', 'lan', 'fin'], tx))].sort()).toEqual([
        'khoa',
        'lan',
      ]);
    });

    it('reads nothing for nobody, and reads the blocks only for the accounts that can act', async () => {
      const { service, identity } = setup({ usable: [] });

      expect((await service.workingAdminsAmong([], tx)).size).toBe(0);
      expect((await service.workingAdminsAmong(['khoa'], tx)).size).toBe(0);
      expect((identity as unknown as { findDepartureBlocks: jest.Mock }).findDepartureBlocks).not.toHaveBeenCalled();
    });

    it('counts the administrators of a workspace who work', async () => {
      const { service } = setup({ usable: ['khoa'] });

      await expect(service.workingAdminCount(workspace, tx)).resolves.toBe(1);
    });
  });

  describe('whether a person may answer for a workspace', () => {
    it('is true only for a working employee with a usable IT Admin account', async () => {
      await expect(setup({ usable: ['khoa'] }).service.isUsableItAdmin('khoa', tx)).resolves.toBe(true);
      await expect(setup({ usable: [] }).service.isUsableItAdmin('khoa', tx)).resolves.toBe(false);
      await expect(
        setup({ usable: ['khoa'], employee: { status: 'ACTIVE', workState: 'ON_LEAVE' } }).service.isUsableItAdmin(
          'khoa',
          tx,
        ),
      ).resolves.toBe(false);
    });
  });

  describe('requireItAdmin', () => {
    it('lets an active employee with a usable IT Admin account through, locking the employee first', async () => {
      const { service, organizationReads } = setup();

      await expect(service.requireItAdmin(tx, 'khoa')).resolves.toBeUndefined();
      expect(
        (organizationReads as unknown as { lockEmployeeForShare: jest.Mock }).lockEmployeeForShare,
      ).toHaveBeenCalledWith(tx, 'khoa');
    });

    it.each([
      ['an employee that does not exist', { lockFails: new EmployeeNotFoundError('fin') }],
      ['an employee who has left', { employee: { status: 'LEFT', workState: 'LEFT' } }],
      ['an account that cannot sign in', { account: { usable: false, roles: ['IT_ADMIN'] } }],
      ['an account without the IT Admin role', { account: { usable: true, roles: ['FINANCE'] } }],
    ])('refuses %s and names the person', async (_name, options) => {
      const { service } = setup(options);

      await expect(service.requireItAdmin(tx, 'fin')).rejects.toBeInstanceOf(WorkspaceAdminNotItAdminError);
      await expect(service.requireItAdmin(tx, 'fin')).rejects.toMatchObject({ employeeId: 'fin' });
    });

    it('lets any other failure of the lock through unchanged', async () => {
      const { service } = setup({ lockFails: new Error('db down') });

      await expect(service.requireItAdmin(tx, 'khoa')).rejects.toThrow('db down');
    });
  });

  it('builds the rows and the detail with the names, the accounts and the counts read once', async () => {
    const { service, organizationReads } = setup({ usable: ['khoa'] });

    const [row] = await service.summaries([workspace], tx);
    const detail = await service.detail(workspace, tx);

    expect(row).toMatchObject({
      id: 'ws-1',
      adminCount: 2,
      workingAdminCount: 1,
      subscriptionCount: 3,
      flags: ['ADMINS_BELOW_MINIMUM'],
    });
    expect(detail.admins.map((admin) => admin.name)).toEqual(['Khoa', 'Nam']);
    expect((organizationReads as unknown as { getEmployees: jest.Mock }).getEmployees).toHaveBeenCalledTimes(2);
  });
});
