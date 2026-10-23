import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { normalizeDisplayName } from '../../../core/display-name';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { organizationAuditEvent } from '../mappers/audit-event.mapper';
import { OrganizationService } from '../organization.service';
import { ProjectInvalidError, ProjectNotFoundError } from './project.errors';
import { ProjectRepo } from './project.repo';
import { PROFILE_PROJECT_LIMIT, ProjectRecord, ProjectStatus, ProjectSummaryRecord } from './project.types';

export const PROJECT_NAME_MAX_LENGTH = 200;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 2000;

/**
 * Projects are text on department profiles (`US-03-06` AC-14): a name, what it is, which departments take part and
 * whether it is running. They are not cost centers, have no members and are no step of any approval.
 */
@Injectable()
export class ProjectService {
  constructor(
    private readonly repo: ProjectRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /** One page of projects by name, the description left to `get` (`LD-12`). */
  async list(query: { departmentId?: string; page: number; pageSize: number }): Promise<Page<ProjectSummaryRecord>> {
    const { items, total } = await this.repo.page(
      query.departmentId,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** One project in full. Throws ProjectNotFoundError. */
  async get(id: string): Promise<ProjectRecord> {
    const project = await this.repo.findProject(id);
    if (!project) throw new ProjectNotFoundError();

    return project;
  }

  /** The projects a department profile shows: the first {@link PROFILE_PROJECT_LIMIT} in full and how many there are. */
  forProfile(departmentId: string): Promise<{ items: ProjectRecord[]; total: number }> {
    return this.repo.forDepartment(departmentId, PROFILE_PROJECT_LIMIT);
  }

  async create(
    actor: AuthenticatedPrincipal,
    input: { name: string; description?: string | null; status?: ProjectStatus; departmentIds: string[] },
  ): Promise<ProjectRecord> {
    const name = this.requireName(input.name);
    const description = this.normalizeDescription(input.description);
    const organization = await this.requireOrganization();
    const departmentIds = [...new Set(input.departmentIds)];

    const id = await this.runner.run(async (tx) => {
      await this.assertDepartmentsExist(tx, departmentIds);
      const created = await this.repo.insertProject(tx, {
        organizationId: organization.id,
        name,
        description,
        status: input.status ?? 'RUNNING',
        departmentIds,
      });
      await this.audit.record(
        tx,
        organizationAuditEvent(actor, organization.id, 'PROJECT.CREATED', 'Project', created, null, {
          name,
          status: input.status ?? 'RUNNING',
          departmentIds,
        }),
      );

      return created;
    });

    return (await this.repo.findProject(id)) as ProjectRecord;
  }

  async update(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { name?: string; description?: string | null; status?: ProjectStatus; departmentIds?: string[] },
  ): Promise<ProjectRecord> {
    const organization = await this.requireOrganization();
    const name = input.name === undefined ? undefined : this.requireName(input.name);
    const description = input.description === undefined ? undefined : this.normalizeDescription(input.description);
    const departmentIds = input.departmentIds ? [...new Set(input.departmentIds)] : undefined;

    await this.runner.run(async (tx) => {
      const current = await this.repo.lockProject(tx, id);
      if (!current) throw new ProjectNotFoundError();
      if (departmentIds) await this.assertDepartmentsExist(tx, departmentIds);

      const changes: { name?: string; description?: string | null; status?: ProjectStatus; departmentIds?: string[] } =
        {};
      const before: Record<string, string | null | string[]> = {};
      const after: Record<string, string | null | string[]> = {};
      if (name !== undefined && name !== current.name) {
        changes.name = name;
        before.name = current.name;
        after.name = name;
      }
      if (description !== undefined && description !== current.description) {
        changes.description = description;
        before.description = current.description;
        after.description = description;
      }
      if (input.status !== undefined && input.status !== current.status) {
        changes.status = input.status;
        before.status = current.status;
        after.status = input.status;
      }
      const currentIds = current.departments.map((department) => department.id).sort();
      if (departmentIds && JSON.stringify([...departmentIds].sort()) !== JSON.stringify(currentIds)) {
        changes.departmentIds = departmentIds;
        before.departmentIds = currentIds;
        after.departmentIds = [...departmentIds].sort();
      }
      if (Object.keys(changes).length === 0) return;

      await this.repo.updateProject(tx, id, changes, new Date());
      await this.audit.record(
        tx,
        organizationAuditEvent(actor, organization.id, 'PROJECT.UPDATED', 'Project', id, before, after),
      );
    });

    return (await this.repo.findProject(id)) as ProjectRecord;
  }

  private async assertDepartmentsExist(tx: Parameters<ProjectRepo['existingDepartmentIds']>[0], ids: string[]) {
    if (ids.length === 0) return;
    const existing = await this.repo.existingDepartmentIds(tx, ids);
    if (ids.some((id) => !existing.has(id))) throw new ProjectInvalidError('DEPARTMENT_NOT_FOUND');
  }

  private requireName(raw: string): string {
    const name = normalizeDisplayName(raw);
    if (name === '' || [...name].length > PROJECT_NAME_MAX_LENGTH) throw new ProjectInvalidError('NAME');

    return name;
  }

  private normalizeDescription(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined) return null;
    // Free text keeps its line breaks: accents composed, the ends trimmed, nothing else.
    const text = raw.normalize('NFC').trim();
    if (text === '') return null;
    if ([...text].length > PROJECT_DESCRIPTION_MAX_LENGTH) throw new ProjectInvalidError('DESCRIPTION');

    return text;
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('Projects were used before installation');

    return organization;
  }
}
