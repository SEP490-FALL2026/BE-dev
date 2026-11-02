import { Test } from '@nestjs/testing';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationContextService } from '../organization-context.service';
import { HR_BASIS } from '../../../../test/support/hr-basis';
import { ProjectForbiddenError, ProjectInvalidError, ProjectNotFoundError } from './project.errors';
import { ProjectRepo } from './project.repo';
import { ProjectService } from './project.service';
import { ProjectRecord } from './project.types';

/**
 * What the project service does around its repository (`US-03-06` AC-14), pinned before the project capability moved
 * out of the module root: the order of lock, check, write and audit inside one transaction, the read-back after
 * it, and the cases that write nothing. Driven through the public methods with an in-memory repository.
 */
describe('ProjectService', () => {
  const tx = { name: 'tx' };
  const actor: AuthenticatedPrincipal = {
    subject: 'app-user-1',
    appUserId: 'app-user-1',
    sessionId: 'session-1',
    employeeId: 'emp-actor',
    directRoles: ['SUPER_ADMIN'],
    roles: ['SUPER_ADMIN'],
  };
  const itAdmin: AuthenticatedPrincipal = {
    ...actor,
    directRoles: ['IT_ADMIN'],
    roles: ['IT_ADMIN'],
  };
  const stored: ProjectRecord = {
    id: 'project-1',
    name: 'Alpha',
    description: 'Portal',
    status: 'RUNNING',
    departments: [
      { id: 'dep-a', code: 'A', name: 'Design' },
      { id: 'dep-b', code: 'B', name: 'Finance' },
    ],
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };

  let calls: string[];
  const repo = {
    page: jest.fn(),
    forDepartment: jest.fn(),
    insertProject: jest.fn(),
    lockProject: jest.fn(),
    findProject: jest.fn(),
    updateProject: jest.fn(),
    existingDepartmentIds: jest.fn(),
  };
  const organization = { getOrganization: jest.fn() };
  const audit = { record: jest.fn() };
  const runner = {
    run: jest.fn(async (work: (transaction: unknown) => Promise<unknown>) => {
      calls.push('begin');
      const result = await work(tx);
      calls.push('commit');

      return result;
    }),
  };

  async function service(): Promise<ProjectService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: ProjectRepo, useValue: repo },
        { provide: OrganizationContextService, useValue: { findOrganization: organization.getOrganization } },
        { provide: AuditApi, useValue: audit },
        { provide: TransactionRunner, useValue: runner },
      ],
    }).compile();

    return moduleRef.get(ProjectService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    calls = [];
    organization.getOrganization.mockResolvedValue({ id: 'org-1' });
    repo.existingDepartmentIds.mockImplementation((_tx: unknown, ids: string[]) => {
      calls.push(`check ${ids.join(',')}`);

      return Promise.resolve(new Set(ids.filter((id) => id !== 'dep-missing')));
    });
    repo.lockProject.mockImplementation((client: unknown, id: string) => {
      calls.push(`lock ${id}${client === tx ? ' in tx' : ''}`);

      return Promise.resolve(id === stored.id ? stored : null);
    });
    repo.insertProject.mockImplementation(() => {
      calls.push('insert');

      return Promise.resolve('project-new');
    });
    repo.updateProject.mockImplementation(() => {
      calls.push('update');

      return Promise.resolve();
    });
    repo.findProject.mockImplementation((id: string, client?: unknown) => {
      calls.push(`read ${id}${client === undefined ? '' : ' in tx'}`);

      return Promise.resolve(stored);
    });
    audit.record.mockImplementation(() => {
      calls.push('audit');

      return Promise.resolve();
    });
  });

  it('lists a page through the repository, for every project or for one department, and cuts the profile at 20', async () => {
    const summary = { id: stored.id, name: stored.name, status: stored.status, departments: [], updatedAt: new Date() };
    repo.page.mockResolvedValue({ items: [summary], total: 41 });
    repo.forDepartment.mockResolvedValue({ items: [stored], total: 30 });
    const projects = await service();

    await expect(projects.list(actor, { page: 2, pageSize: 20 })).resolves.toEqual({
      items: [summary],
      pagination: { page: 2, pageSize: 20, totalItems: 41, totalPages: 3 },
    });
    await projects.list(actor, { departmentId: 'dep-a', page: 1, pageSize: 50 });
    await expect(projects.forProfile('dep-a')).resolves.toEqual({ items: [stored], total: 30 });
    expect(repo.page.mock.calls).toEqual([
      [undefined, 20, 20],
      ['dep-a', 0, 50],
    ]);
    expect(repo.forDepartment).toHaveBeenCalledWith('dep-a', 20);
  });

  it('reads one project in full, and says when it does not exist', async () => {
    const projects = await service();

    await expect(projects.get(actor, 'project-new')).resolves.toBe(stored);
    repo.findProject.mockResolvedValueOnce(null);
    await expect(projects.get(actor, 'missing')).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('creates with the departments once each, RUNNING by default, checked and audited in one transaction', async () => {
    const created = await (
      await service()
    ).create(actor, {
      name: ' Beta ',
      description: '  Plan  ',
      departmentIds: ['dep-a', 'dep-b', 'dep-a'],
      hrBasis: HR_BASIS,
    });

    expect(created).toBe(stored);
    expect(calls).toEqual(['begin', 'check dep-a,dep-b', 'insert', 'audit', 'commit', 'read project-new']);
    expect(repo.insertProject).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      name: 'Beta',
      description: 'Plan',
      status: 'RUNNING',
      departmentIds: ['dep-a', 'dep-b'],
    });
    expect(audit.record).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      actorKind: 'USER',
      actorAppUserId: 'app-user-1',
      actorRoles: ['SUPER_ADMIN'],
      action: 'PROJECT.CREATED',
      resourceType: 'Project',
      resourceId: 'project-new',
      before: null,
      after: { name: 'Beta', status: 'RUNNING', departmentIds: ['dep-a', 'dep-b'], hrBasis: HR_BASIS },
      correlationId: 'session-1',
    });
  });

  it('refuses a department that does not exist before writing anything', async () => {
    const created = (await service()).create(actor, {
      name: 'Beta',
      departmentIds: ['dep-a', 'dep-missing'],
      hrBasis: HR_BASIS,
    });

    await expect(created).rejects.toThrow(ProjectInvalidError);
    await expect(created).rejects.toMatchObject({ reason: 'DEPARTMENT_NOT_FOUND' });
    expect(calls).toEqual(['begin', 'check dep-a,dep-missing']);
  });

  it('locks the project in the transaction before checking departments, then writes and audits only what changed', async () => {
    await (
      await service()
    ).update(actor, stored.id, { status: 'FINISHED', departmentIds: ['dep-b', 'dep-c'], hrBasis: HR_BASIS });

    expect(calls).toEqual([
      'begin',
      'lock project-1 in tx',
      'check dep-b,dep-c',
      'update',
      'audit',
      'commit',
      'read project-1',
    ]);
    expect(repo.updateProject).toHaveBeenCalledWith(
      tx,
      stored.id,
      { status: 'FINISHED', departmentIds: ['dep-b', 'dep-c'] },
      expect.any(Date),
    );
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'PROJECT.UPDATED',
        resourceId: stored.id,
        before: { status: 'RUNNING', departmentIds: ['dep-a', 'dep-b'] },
        after: { status: 'FINISHED', departmentIds: ['dep-b', 'dep-c'], hrBasis: HR_BASIS },
      }),
    );
  });

  it('writes and audits nothing when the update changes nothing', async () => {
    await (
      await service()
    ).update(actor, stored.id, {
      name: ' Alpha ',
      description: 'Portal',
      departmentIds: ['dep-b', 'dep-a'],
      hrBasis: HR_BASIS,
    });

    expect(calls).toEqual(['begin', 'lock project-1 in tx', 'check dep-b,dep-a', 'commit', 'read project-1']);
  });

  it('answers a project that does not exist with ProjectNotFoundError and writes nothing', async () => {
    await expect((await service()).update(actor, 'project-x', { name: 'x', hrBasis: HR_BASIS })).rejects.toThrow(
      ProjectNotFoundError,
    );
    expect(calls).toEqual(['begin', 'lock project-x in tx']);
  });

  it('is told by the service, not only by the route: an IT Admin lists, reads, creates and changes nothing (F13)', async () => {
    const projects = await service();

    await expect(projects.list(itAdmin, { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ProjectForbiddenError);
    await expect(projects.get(itAdmin, stored.id)).rejects.toBeInstanceOf(ProjectForbiddenError);
    await expect(
      projects.create(itAdmin, { name: 'Beta', departmentIds: ['dep-a'], hrBasis: HR_BASIS }),
    ).rejects.toBeInstanceOf(ProjectForbiddenError);
    await expect(projects.update(itAdmin, stored.id, { name: 'Beta', hrBasis: HR_BASIS })).rejects.toBeInstanceOf(
      ProjectForbiddenError,
    );

    // Nothing was read or written, not even a transaction opened.
    expect(calls).toEqual([]);
    expect(repo.page).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
