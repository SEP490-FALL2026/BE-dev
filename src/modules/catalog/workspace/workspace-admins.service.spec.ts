import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  WorkspaceAdminNotItAdminError,
  WorkspaceAdminsTooFewError,
  WorkspaceNotFoundError,
  WorkspaceNotResponsibleError,
  WorkspacePrimaryOwnerNotAdminError,
  WorkspaceStaleError,
} from './workspace.errors';
import type { WorkspaceRepo } from './workspace.repo';
import { WorkspaceAdminsService } from './workspace-admins.service';
import type { WorkspaceViewService } from './workspace-view.service';
import type { WorkspaceRecord } from './workspace.types';

describe('WorkspaceAdminsService', () => {
  const tx = { tag: 'tx' };
  const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
  const khoa = {
    subject: 'u-khoa',
    appUserId: 'u-khoa',
    sessionId: 's-1',
    employeeId: 'emp-khoa',
    directRoles: ['IT_ADMIN'],
    roles: ['IT_ADMIN'],
  } as AuthenticatedPrincipal;
  const nam = { ...khoa, appUserId: 'u-nam', employeeId: 'emp-nam' };
  const version = new Date('2026-12-01T00:00:00.000Z');
  const body = {
    admins: [
      { employeeId: 'emp-khoa', role: 'OWNER' as const },
      { employeeId: 'emp-nam', role: 'ADMIN' as const },
    ],
    primaryOwnerEmployeeId: 'emp-khoa',
    expectedUpdatedAt: version,
  };

  function setup(options: { locked?: Partial<WorkspaceRecord> | null; notItAdmin?: string } = {}) {
    const locked =
      options.locked === null
        ? null
        : ({
            id: 'ws-1',
            responsibleItAdminEmployeeId: 'emp-khoa',
            primaryOwnerEmployeeId: 'emp-khoa',
            ownerLimit: null,
            adminLimit: null,
            admins: [{ employeeId: 'emp-khoa', role: 'OWNER' }],
            updatedAt: version,
            ...options.locked,
          } as WorkspaceRecord);
    const repo = {
      lock: jest.fn().mockResolvedValue(locked),
      replaceAdmins: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue({ id: 'ws-1' }),
    } as unknown as WorkspaceRepo;
    const requireItAdmins = jest.fn((_tx: unknown, employeeIds: readonly string[]) =>
      options.notItAdmin && employeeIds.includes(options.notItAdmin)
        ? Promise.reject(new WorkspaceAdminNotItAdminError(options.notItAdmin))
        : Promise.resolve(),
    );
    const detail = { id: 'ws-1' };
    const views = { requireItAdmins, detail: jest.fn().mockResolvedValue(detail) } as unknown as WorkspaceViewService;
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
    } as unknown as OrganizationReadApi;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;

    return {
      service: new WorkspaceAdminsService(repo, views, organizationReads, audit, runner),
      repo,
      requireItAdmins,
      audit,
      detail,
    };
  }

  it('locks employees via requireItAdmins (tier 1) before locking the workspace (tier 5b)', async () => {
    const order: string[] = [];
    const { service, repo, requireItAdmins } = setup();
    (repo.lock as jest.Mock).mockImplementation(() => {
      order.push('repo.lock');
      return Promise.resolve({
        id: 'ws-1',
        responsibleItAdminEmployeeId: 'emp-khoa',
        primaryOwnerEmployeeId: 'emp-khoa',
        ownerLimit: null,
        adminLimit: null,
        admins: [{ employeeId: 'emp-khoa', role: 'OWNER' }],
        updatedAt: version,
      } as WorkspaceRecord);
    });
    requireItAdmins.mockImplementation((_tx: unknown, employeeIds: readonly string[]) => {
      order.push(`requireItAdmins:${employeeIds.join(',')}`);
      return Promise.resolve();
    });

    await service.set(khoa, 'ws-1', {
      ...body,
      admins: [
        { employeeId: 'emp-nam', role: 'ADMIN' },
        { employeeId: 'emp-khoa', role: 'OWNER' },
        { employeeId: 'emp-nam', role: 'ADMIN' },
      ],
    });

    expect(order).toEqual(['requireItAdmins:emp-nam,emp-khoa,emp-nam', 'repo.lock']);
  });

  it('replaces the administrators as a whole, judges each person and audits the change', async () => {
    const { service, repo, requireItAdmins, audit, detail } = setup();

    await expect(service.set(khoa, 'ws-1', body)).resolves.toBe(detail);

    expect((repo as unknown as { replaceAdmins: jest.Mock }).replaceAdmins).toHaveBeenCalledWith(
      tx,
      'ws-1',
      body.admins,
      'emp-khoa',
    );
    expect(requireItAdmins).toHaveBeenCalledWith(tx, ['emp-khoa', 'emp-nam']);
    expect((audit as unknown as { record: jest.Mock }).record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'WORKSPACE.ADMINS_SET',
        before: { admins: ['emp-khoa:OWNER'], primaryOwnerEmployeeId: 'emp-khoa' },
        after: { admins: ['emp-khoa:OWNER', 'emp-nam:ADMIN'], primaryOwnerEmployeeId: 'emp-khoa' },
      }),
    );
  });

  it('refuses an IT Admin who does not answer for the workspace (403), before the version and the shape are judged', async () => {
    const { service, repo } = setup();

    await expect(service.set(nam, 'ws-1', { ...body, expectedUpdatedAt: new Date(0) })).rejects.toBeInstanceOf(
      WorkspaceNotResponsibleError,
    );
    expect((repo as unknown as { replaceAdmins: jest.Mock }).replaceAdmins).not.toHaveBeenCalled();
  });

  it('refuses a version other than the one stored (409) and says the current one', async () => {
    const { service } = setup();

    await expect(service.set(khoa, 'ws-1', { ...body, expectedUpdatedAt: new Date(0) })).rejects.toMatchObject({
      currentUpdatedAt: version,
    });
    await expect(service.set(khoa, 'ws-1', { ...body, expectedUpdatedAt: new Date(0) })).rejects.toBeInstanceOf(
      WorkspaceStaleError,
    );
  });

  it('refuses fewer than two different people and a primary owner who is not an owner on the list, with nothing written', async () => {
    const { service, repo } = setup();

    await expect(
      service.set(khoa, 'ws-1', { ...body, admins: [{ employeeId: 'emp-khoa', role: 'OWNER' }] }),
    ).rejects.toBeInstanceOf(WorkspaceAdminsTooFewError);
    await expect(service.set(khoa, 'ws-1', { ...body, primaryOwnerEmployeeId: 'emp-nam' })).rejects.toBeInstanceOf(
      WorkspacePrimaryOwnerNotAdminError,
    );
    expect((repo as unknown as { replaceAdmins: jest.Mock }).replaceAdmins).not.toHaveBeenCalled();
  });

  it('refuses a person who is not an IT Admin (a Finance account) and names them', async () => {
    const { service, repo } = setup({ notItAdmin: 'emp-nam' });

    await expect(service.set(khoa, 'ws-1', body)).rejects.toMatchObject({ employeeId: 'emp-nam' });
    await expect(service.set(khoa, 'ws-1', body)).rejects.toBeInstanceOf(WorkspaceAdminNotItAdminError);
    expect((repo as unknown as { replaceAdmins: jest.Mock }).replaceAdmins).not.toHaveBeenCalled();
  });

  it('refuses a workspace that does not exist', async () => {
    const { service } = setup({ locked: null });

    await expect(service.set(khoa, 'ws-9', body)).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });

  describe('setInTx', () => {
    it('validates against caller-supplied limits and skips employee re-locking when employeesChecked is true', async () => {
      const { service, repo, requireItAdmins } = setup({
        locked: { adminLimit: 1 },
      });
      const current = {
        id: 'ws-1',
        responsibleItAdminEmployeeId: 'emp-khoa',
        primaryOwnerEmployeeId: 'emp-khoa',
        ownerLimit: 1,
        adminLimit: 1,
        admins: [{ employeeId: 'emp-khoa', role: 'OWNER' as const }],
        updatedAt: version,
      } as WorkspaceRecord;
      const fourAdmins = [
        { employeeId: 'emp-khoa', role: 'OWNER' as const },
        { employeeId: 'emp-nam', role: 'ADMIN' as const },
        { employeeId: 'emp-lan', role: 'ADMIN' as const },
        { employeeId: 'emp-minh', role: 'ADMIN' as const },
      ];

      await service.setInTx(
        tx as never,
        khoa,
        'org-1',
        'ws-1',
        { admins: fourAdmins, primaryOwnerEmployeeId: 'emp-khoa', expectedUpdatedAt: version },
        { current, limits: { ownerLimit: 1, adminLimit: 3 }, employeesChecked: true },
      );

      expect(requireItAdmins).not.toHaveBeenCalled();
      expect((repo as unknown as { lock: jest.Mock }).lock).not.toHaveBeenCalled();
      expect((repo as unknown as { replaceAdmins: jest.Mock }).replaceAdmins).toHaveBeenCalledWith(
        tx,
        'ws-1',
        fourAdmins,
        'emp-khoa',
      );
    });
  });
});
