import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { WorkspaceNotFoundError, WorkspaceResponsibleNotItAdminError } from './workspace.errors';
import type { WorkspaceRepo } from './workspace.repo';
import { WorkspaceResponsibleService } from './workspace-responsible.service';
import type { WorkspaceViewService } from './workspace-view.service';
import type { WorkspaceRecord } from './workspace.types';

describe('WorkspaceResponsibleService', () => {
  const tx = { tag: 'tx' };
  const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
  const actor = {
    subject: 'app-sa',
    appUserId: 'app-sa',
    sessionId: 'sess-1',
    employeeId: 'emp-sa',
    directRoles: ['SUPER_ADMIN'],
    roles: ['SUPER_ADMIN'],
  } as AuthenticatedPrincipal;

  function setup(options: { locked?: Partial<WorkspaceRecord> | null; usable?: boolean } = {}) {
    const locked =
      options.locked === null
        ? null
        : ({ id: 'ws-1', responsibleItAdminEmployeeId: 'emp-khoa', ...options.locked } as WorkspaceRecord);
    const repo = {
      lock: jest.fn().mockResolvedValue(locked),
      setResponsible: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue({ id: 'ws-1' }),
    } as unknown as WorkspaceRepo;
    const detail = { id: 'ws-1', name: 'Anthropic' };
    const views = {
      isUsableItAdmin: jest.fn().mockResolvedValue(options.usable ?? true),
      detail: jest.fn().mockResolvedValue(detail),
    } as unknown as WorkspaceViewService;
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
    } as unknown as OrganizationReadApi;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;

    return {
      service: new WorkspaceResponsibleService(repo, views, organizationReads, audit, runner),
      repo,
      views,
      audit,
      detail,
    };
  }

  it('names the IT Admin, audits who changed it from whom to whom and why, and answers changed true', async () => {
    const { service, repo, audit, detail } = setup();

    const result = await service.change(actor, 'ws-1', { employeeId: 'emp-nam', reason: 'Khoa leaves' });

    expect(result).toEqual({ workspace: detail, changed: true });
    expect((repo as unknown as { setResponsible: jest.Mock }).setResponsible).toHaveBeenCalledWith(
      tx,
      'ws-1',
      'emp-nam',
    );
    expect((audit as unknown as { record: jest.Mock }).record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'WORKSPACE.RESPONSIBLE_CHANGED',
        resourceType: 'Workspace',
        resourceId: 'ws-1',
        before: { responsibleItAdminEmployeeId: 'emp-khoa' },
        after: { responsibleItAdminEmployeeId: 'emp-nam', reason: 'Khoa leaves' },
      }),
    );
  });

  it('writes and audits nothing when the one named already answers for the workspace', async () => {
    const { service, repo, audit } = setup();

    const result = await service.change(actor, 'ws-1', { employeeId: 'emp-khoa', reason: 'Same' });

    expect(result.changed).toBe(false);
    expect((repo as unknown as { setResponsible: jest.Mock }).setResponsible).not.toHaveBeenCalled();
    expect((audit as unknown as { record: jest.Mock }).record).not.toHaveBeenCalled();
  });

  it('names someone for a workspace nobody answers for', async () => {
    const { service, repo } = setup({ locked: { responsibleItAdminEmployeeId: null } });

    await expect(service.change(actor, 'ws-1', { employeeId: 'emp-nam', reason: 'First' })).resolves.toMatchObject({
      changed: true,
    });
    expect((repo as unknown as { setResponsible: jest.Mock }).setResponsible).toHaveBeenCalled();
  });

  it('refuses a person who is not an IT Admin who works now, whatever they already are, and writes nothing', async () => {
    const { service, repo } = setup({ usable: false });

    await expect(service.change(actor, 'ws-1', { employeeId: 'emp-fin', reason: 'x' })).rejects.toBeInstanceOf(
      WorkspaceResponsibleNotItAdminError,
    );
    await expect(service.change(actor, 'ws-1', { employeeId: 'emp-khoa', reason: 'x' })).rejects.toBeInstanceOf(
      WorkspaceResponsibleNotItAdminError,
    );
    expect((repo as unknown as { setResponsible: jest.Mock }).setResponsible).not.toHaveBeenCalled();
  });

  it('refuses a workspace that does not exist', async () => {
    const { service } = setup({ locked: null });

    await expect(service.change(actor, 'ws-9', { employeeId: 'emp-nam', reason: 'x' })).rejects.toBeInstanceOf(
      WorkspaceNotFoundError,
    );
  });
});
