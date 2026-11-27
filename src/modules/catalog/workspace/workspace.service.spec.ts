import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { VendorNotFoundError } from '../vendor/vendor.errors';
import {
  WorkspaceLimitExceededError,
  WorkspaceNameTakenError,
  WorkspaceNotFoundError,
  WorkspaceNotResponsibleError,
  WorkspaceStaleError,
  WorkspaceTextInvalidError,
} from './workspace.errors';
import type { WorkspaceRepo } from './workspace.repo';
import { WorkspaceService } from './workspace.service';
import type { WorkspaceViewService } from './workspace-view.service';
import type { WorkspaceRecord } from './workspace.types';

describe('WorkspaceService', () => {
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

  function setup(
    options: { locked?: Partial<WorkspaceRecord> | null; vendor?: string | null; insertFails?: Error } = {},
  ) {
    const locked =
      options.locked === null
        ? null
        : ({
            id: 'ws-1',
            name: 'Anthropic',
            responsibleItAdminEmployeeId: 'emp-khoa',
            ownerLimit: null,
            adminLimit: null,
            ownerAccountEmail: null,
            adminNote: null,
            ownerTransferProcedure: null,
            emergencyAccount: null,
            admins: [
              { employeeId: 'emp-khoa', role: 'OWNER' },
              { employeeId: 'emp-nam', role: 'OWNER' },
            ],
            updatedAt: version,
            ...options.locked,
          } as WorkspaceRecord);
    const repo = {
      lock: jest.fn().mockResolvedValue(locked),
      find: jest.fn().mockResolvedValue(locked ?? { id: 'ws-1' }),
      update: jest.fn().mockResolvedValue(undefined),
      insert: options.insertFails
        ? jest.fn().mockRejectedValue(options.insertFails)
        : jest.fn().mockResolvedValue('ws-new'),
      findVendorName: jest.fn().mockResolvedValue(options.vendor === undefined ? 'Anthropic' : options.vendor),
      page: jest.fn().mockResolvedValue({ items: [{ id: 'ws-1' }], total: 1 }),
    } as unknown as WorkspaceRepo;
    const requireItAdmin = jest.fn().mockResolvedValue(undefined);
    const requireItAdmins = jest.fn().mockResolvedValue(undefined);
    const views = {
      requireItAdmin,
      requireItAdmins,
      detail: jest.fn().mockResolvedValue({ id: 'ws-1' }),
      summaries: jest.fn().mockResolvedValue([{ id: 'ws-1', flags: [] }]),
    } as unknown as WorkspaceViewService;
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
    } as unknown as OrganizationReadApi;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;

    return {
      service: new WorkspaceService(repo, views, organizationReads, audit, runner),
      repo: repo as unknown as Record<string, jest.Mock>,
      views: views as unknown as Record<string, jest.Mock>,
      audit: audit as unknown as { record: jest.Mock },
    };
  }

  describe('create', () => {
    it('makes the workspace with the creator as the IT Admin who answers for it, and audits it', async () => {
      const { service, repo, audit } = setup();

      await service.create(khoa, { vendorId: 'v-1', name: '  Anthropic  ', ownerAccountEmail: 'it@acme.vn' });

      expect(repo.insert).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          organizationId: 'org-1',
          vendorId: 'v-1',
          name: 'Anthropic',
          normalizedName: 'anthropic',
          ownerAccountEmail: 'it@acme.vn',
          adminNote: null,
          responsibleItAdminEmployeeId: 'emp-khoa',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'WORKSPACE.CREATED',
          resourceId: 'ws-new',
          after: expect.objectContaining({ responsibleItAdminEmployeeId: 'emp-khoa' }) as unknown,
        }),
      );
    });

    it('refuses a vendor that does not exist and a name that is already taken at the vendor', async () => {
      await expect(setup({ vendor: null }).service.create(khoa, { vendorId: 'v-9', name: 'X' })).rejects.toBeInstanceOf(
        VendorNotFoundError,
      );
      await expect(
        setup({ insertFails: new WorkspaceNameTakenError() }).service.create(khoa, {
          vendorId: 'v-1',
          name: 'Anthropic',
        }),
      ).rejects.toBeInstanceOf(WorkspaceNameTakenError);
    });

    it('refuses a name that is only blanks and a note over 2000 characters, writing nothing', async () => {
      const { service, repo } = setup();

      await expect(service.create(khoa, { vendorId: 'v-1', name: '   ' })).rejects.toBeInstanceOf(
        WorkspaceTextInvalidError,
      );
      await expect(
        service.create(khoa, { vendorId: 'v-1', name: 'X', adminNote: 'x'.repeat(2001) }),
      ).rejects.toBeInstanceOf(WorkspaceTextInvalidError);
      expect(repo.insert).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('locks the emergency account holder via requireItAdmin (tier 1) before locking the workspace (tier 5b)', async () => {
      const order: string[] = [];
      const { service, repo, views } = setup();
      views.requireItAdmin.mockImplementation((_tx: unknown, employeeId: string) => {
        order.push(`requireItAdmin:${employeeId}`);
        return Promise.resolve();
      });
      repo.lock.mockImplementation(() => {
        order.push('repo.lock');
        return Promise.resolve({
          id: 'ws-1',
          name: 'Anthropic',
          responsibleItAdminEmployeeId: 'emp-khoa',
          ownerLimit: null,
          adminLimit: null,
          ownerAccountEmail: null,
          adminNote: null,
          ownerTransferProcedure: null,
          emergencyAccount: null,
          admins: [
            { employeeId: 'emp-khoa', role: 'OWNER' },
            { employeeId: 'emp-nam', role: 'OWNER' },
          ],
          updatedAt: version,
        });
      });

      await service.update(khoa, 'ws-1', {
        expectedUpdatedAt: version,
        emergencyAccount: {
          identity: 'break-glass',
          occupiesSeat: false,
          holderEmployeeId: 'emp-nam',
          lastReviewedOn: '2026-12-01',
        },
      });

      expect(order).toEqual(['requireItAdmin:emp-nam', 'repo.lock']);
    });

    it('writes the fields named on the version read, with the search key of a new name, and audits the profile before and after', async () => {
      const { service, repo, audit } = setup();

      await service.update(khoa, 'ws-1', { expectedUpdatedAt: version, name: 'Anthropic EU', adminNote: ' note ' });

      expect(repo.update).toHaveBeenCalledWith(tx, 'ws-1', {
        name: 'Anthropic EU',
        normalizedName: 'anthropic eu',
        adminNote: 'note',
      });
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'WORKSPACE.UPDATED',
          before: expect.any(Object) as unknown,
          after: expect.any(Object) as unknown,
        }),
      );
    });

    it('refuses an IT Admin who does not answer for the workspace (403) before it looks at the version', async () => {
      const { service, repo } = setup();

      await expect(service.update(nam, 'ws-1', { expectedUpdatedAt: new Date(0), name: 'X' })).rejects.toBeInstanceOf(
        WorkspaceNotResponsibleError,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('refuses a stale version (409) and one that does not exist (404)', async () => {
      await expect(
        setup().service.update(khoa, 'ws-1', { expectedUpdatedAt: new Date(0), name: 'X' }),
      ).rejects.toBeInstanceOf(WorkspaceStaleError);
      await expect(
        setup({ locked: null }).service.update(khoa, 'ws-9', { expectedUpdatedAt: version, name: 'X' }),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    });

    it('refuses a limit below the administrators already named, and an emergency account held by someone who is not an IT Admin', async () => {
      const { service, repo, views } = setup();

      await expect(service.update(khoa, 'ws-1', { expectedUpdatedAt: version, ownerLimit: 1 })).rejects.toBeInstanceOf(
        WorkspaceLimitExceededError,
      );
      views.requireItAdmin.mockRejectedValueOnce(new Error('not an IT Admin'));
      await expect(
        service.update(khoa, 'ws-1', {
          expectedUpdatedAt: version,
          emergencyAccount: {
            identity: 'break-glass',
            occupiesSeat: false,
            holderEmployeeId: 'emp-fin',
            lastReviewedOn: '2026-12-01',
          },
        }),
      ).rejects.toThrow('not an IT Admin');
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('clears an optional field when the change says null', async () => {
      const { service, repo } = setup();

      await service.update(khoa, 'ws-1', {
        expectedUpdatedAt: version,
        ownerAccountEmail: null,
        emergencyAccount: null,
      });

      expect(repo.update).toHaveBeenCalledWith(tx, 'ws-1', { ownerAccountEmail: null, emergencyAccount: null });
    });
  });

  describe('list', () => {
    it('answers a page with its snapshot total, and cuts the whole list by a flag', async () => {
      const { service, repo, views } = setup();

      const page = await service.list({ page: 1, pageSize: 20 });
      expect(page).toMatchObject({ pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
      expect(repo.page).toHaveBeenCalledWith({ vendorId: undefined }, { skip: 0, take: 20 });

      views.summaries.mockResolvedValueOnce([
        { id: 'a', flags: ['NO_RESPONSIBLE'] },
        { id: 'b', flags: [] },
        { id: 'c', flags: ['NO_RESPONSIBLE'] },
      ]);
      const flagged = await service.list({ flag: 'NO_RESPONSIBLE', page: 2, pageSize: 1 });
      expect(repo.page).toHaveBeenLastCalledWith({ vendorId: undefined }, 'all');
      expect(flagged.items.map((item) => (item as { id: string }).id)).toEqual(['c']);
      expect(flagged.pagination).toEqual({ page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
    });
  });

  it('answers 404 for a detail that does not exist', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValueOnce(null);

    await expect(service.get('ws-9')).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });

  describe('updateInTx and requireItAdmins', () => {
    it('delegates requireItAdmins to WorkspaceViewService', async () => {
      const { service, views } = setup();

      await service.requireItAdmins(tx as never, ['emp-nam', 'emp-khoa', 'emp-nam']);

      expect(views.requireItAdmins).toHaveBeenCalledWith(tx, ['emp-nam', 'emp-khoa', 'emp-nam']);
    });

    it('updates inside caller tx using provided current record without re-locking when employeeChecked is true', async () => {
      const { service, repo, views } = setup();
      const current = {
        id: 'ws-1',
        name: 'Anthropic',
        responsibleItAdminEmployeeId: 'emp-khoa',
        ownerLimit: null,
        adminLimit: null,
        ownerAccountEmail: null,
        adminNote: null,
        ownerTransferProcedure: null,
        emergencyAccount: null,
        admins: [
          { employeeId: 'emp-khoa', role: 'OWNER' as const },
          { employeeId: 'emp-nam', role: 'ADMIN' as const },
        ],
        updatedAt: version,
      } as WorkspaceRecord;

      await service.updateInTx(
        tx as never,
        khoa,
        'org-1',
        'ws-1',
        {
          expectedUpdatedAt: version,
          adminLimit: 1,
          emergencyAccount: {
            identity: 'break-glass',
            occupiesSeat: false,
            holderEmployeeId: 'emp-nam',
            lastReviewedOn: '2026-12-01',
          },
        },
        { current, employeeChecked: true },
      );

      expect(views.requireItAdmin).not.toHaveBeenCalled();
      expect(repo.lock).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith(tx, 'ws-1', expect.objectContaining({ adminLimit: 1 }));
    });
  });
});
