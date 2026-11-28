import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import { WorkspaceNotFoundError, WorkspaceRequiredError, WorkspaceVendorMismatchError } from './workspace.errors';
import type { WorkspaceRepo } from './workspace.repo';
import type { WorkspaceViewService } from './workspace-view.service';
import { WorkspaceForSubscriptionService } from './workspace-for-subscription.service';
import type { WorkspaceRecord } from './workspace.types';

describe('WorkspaceForSubscriptionService', () => {
  const tx = { tag: 'tx' } as unknown as DbTx;
  const actor = {
    appUserId: 'u-khoa',
    employeeId: 'emp-khoa',
    sessionId: 's-1',
    roles: ['IT_ADMIN'],
  } as unknown as AuthenticatedPrincipal;
  const record = (id: string, vendorId = 'v-1') => ({ id, vendorId }) as WorkspaceRecord;
  const claude = { vendorId: 'v-1', needsWorkspace: true };

  function setup(
    options: { ofVendor?: WorkspaceRecord[]; byId?: Record<string, WorkspaceRecord>; made?: string | null } = {},
  ) {
    const order: string[] = [];
    const repo = {
      lock: jest.fn((_tx: unknown, id: string) => {
        order.push(`lock:${id}`);

        return Promise.resolve(options.byId?.[id] ?? null);
      }),
      findOfVendor: jest.fn().mockResolvedValue(options.ofVendor ?? []),
      findVendorName: jest.fn().mockResolvedValue('Anthropic'),
      insertIfAbsent: jest.fn().mockResolvedValue(options.made === undefined ? 'ws-new' : options.made),
    } as unknown as WorkspaceRepo;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;
    const views = {
      workingAdminCount: jest.fn().mockResolvedValue(2),
      workingAdminsAmong: jest.fn().mockResolvedValue(new Set()),
    } as unknown as WorkspaceViewService;

    return {
      service: new WorkspaceForSubscriptionService(repo, audit, views),
      repo: repo as unknown as Record<string, jest.Mock>,
      audit: audit as unknown as { record: jest.Mock },
      views: views as unknown as Record<string, jest.Mock>,
      order,
    };
  }

  describe('resolveAndLock', () => {
    it('locks the workspace that is named, held at the vendor of the plan', async () => {
      const { service, repo } = setup({ byId: { 'ws-1': record('ws-1') } });

      await expect(service.resolveAndLock(tx, actor, 'org-1', claude, 'ws-1')).resolves.toBe('ws-1');
      expect(repo.lock).toHaveBeenCalledWith(tx, 'ws-1');
      expect(repo.findOfVendor).not.toHaveBeenCalled();
    });

    it('refuses a workspace held at another vendor than the plan (Jira in the workspace of Anthropic), and one that does not exist', async () => {
      const { service } = setup({ byId: { 'ws-9': record('ws-9', 'v-atlassian') } });

      await expect(service.resolveAndLock(tx, actor, 'org-1', claude, 'ws-9')).rejects.toBeInstanceOf(
        WorkspaceVendorMismatchError,
      );
      await expect(service.resolveAndLock(tx, actor, 'org-1', claude, 'ws-404')).rejects.toBeInstanceOf(
        WorkspaceNotFoundError,
      );
    });

    it('takes the only workspace of the vendor when none is named, for a plan the company administers there', async () => {
      const { service } = setup({ ofVendor: [record('ws-1')], byId: { 'ws-1': record('ws-1') } });

      await expect(service.resolveAndLock(tx, actor, 'org-1', claude, undefined)).resolves.toBe('ws-1');
    });

    it('asks the caller to choose when the vendor has several workspaces, naming them (SUBSCRIPTION.WORKSPACE_REQUIRED)', async () => {
      const { service } = setup({ ofVendor: [record('ws-1'), record('ws-2')] });

      await expect(service.resolveAndLock(tx, actor, 'org-1', claude, undefined)).rejects.toMatchObject({
        workspaceIds: ['ws-1', 'ws-2'],
      });
      await expect(service.resolveAndLock(tx, actor, 'org-1', claude, undefined)).rejects.toBeInstanceOf(
        WorkspaceRequiredError,
      );
    });

    it('makes a workspace named after the vendor, answered for by the person who writes, when the vendor has none, and audits it', async () => {
      const { service, repo, audit } = setup({ ofVendor: [], byId: { 'ws-new': record('ws-new') } });

      await expect(service.resolveAndLock(tx, actor, 'org-1', claude, undefined)).resolves.toBe('ws-new');

      expect(repo.insertIfAbsent).toHaveBeenCalledWith(tx, {
        organizationId: 'org-1',
        vendorId: 'v-1',
        name: 'Anthropic',
        normalizedName: 'anthropic',
        responsibleItAdminEmployeeId: 'emp-khoa',
      });
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: 'WORKSPACE.CREATED', resourceId: 'ws-new' }),
      );
    });

    it('finds the workspace a simultaneous write made instead of making a second one, and audits nothing', async () => {
      const { service, repo, audit } = setup({ made: null, byId: { 'ws-1': record('ws-1') } });
      repo.findOfVendor.mockResolvedValueOnce([]).mockResolvedValueOnce([record('ws-1')]);

      await expect(service.resolveAndLock(tx, actor, 'org-1', claude, undefined)).resolves.toBe('ws-1');
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('holds a plan the company does not administer at the vendor in no workspace unless one is named', async () => {
      const { service, repo } = setup({ ofVendor: [record('ws-1')] });

      await expect(
        service.resolveAndLock(tx, actor, 'org-1', { vendorId: 'v-1', needsWorkspace: false }, undefined),
      ).resolves.toBeNull();
      expect(repo.lock).not.toHaveBeenCalled();
    });

    it('holds a plan of no vendor in no workspace, and refuses to name one for it', async () => {
      const { service } = setup({ byId: { 'ws-1': record('ws-1') } });
      const internal = { vendorId: null, needsWorkspace: true };

      await expect(service.resolveAndLock(tx, actor, 'org-1', internal, undefined)).resolves.toBeNull();
      await expect(service.resolveAndLock(tx, actor, 'org-1', internal, 'ws-1')).rejects.toBeInstanceOf(
        WorkspaceVendorMismatchError,
      );
    });
  });

  describe('lockBoth', () => {
    it('locks the workspaces of a move in id order, each once, whatever the order they are named in', async () => {
      const { service, order } = setup({ byId: { 'ws-a': record('ws-a'), 'ws-b': record('ws-b') } });

      await service.lockBoth(tx, ['ws-b', null, 'ws-a', 'ws-b'], 'v-1');

      expect(order).toEqual(['lock:ws-a', 'lock:ws-b']);
    });

    it('refuses a workspace held at another vendor, or one that does not exist', async () => {
      const { service } = setup({ byId: { 'ws-a': record('ws-a', 'v-2') } });

      await expect(service.lockBoth(tx, ['ws-a'], 'v-1')).rejects.toBeInstanceOf(WorkspaceVendorMismatchError);
      await expect(service.lockBoth(tx, ['ws-404'], 'v-1')).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    });
  });
});
