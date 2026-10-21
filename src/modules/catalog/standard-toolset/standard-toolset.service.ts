import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { readSqlState, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import type { PlanSummary } from '../catalog.types';
import { catalogAuditEvent } from '../mappers/catalog-audit-event';
import { PlanLookupService } from '../plan/plan-lookup.service';
import {
  ToolsetDepartmentInactiveError,
  ToolsetDepartmentNotFoundError,
  ToolsetJobTitleInactiveError,
  ToolsetJobTitleNotFoundError,
  ToolsetOutOfScopeError,
  ToolsetPlansNotFoundError,
} from './standard-toolset.errors';
import { cleanToolsetInput, sameToolset } from './standard-toolset.policy';
import { StandardToolsetRepo, type ToolsetVersion } from './standard-toolset.repo';

export interface ToolsetView {
  departmentId: string;
  jobTitleId: string;
  version: number;
  plans: PlanSummary[];
  reason: string;
  changedBy: string;
  changedAt: Date;
}

const snapshot = (version: ToolsetVersion) => ({
  version: version.version,
  planIds: version.planIds,
  reason: version.reason,
});

/**
 * The standard toolset of a department and job title (`US-04-10`): the plans IT keeps as the usual tools of that kind of
 * work. Every change needs a reason and is a new version recorded with its author, in one transaction with its audit event;
 * the previous versions stay as they were. Changing a toolset grants and revokes nothing. The department and the job title
 * are organization data, read through its facade; a plan is a catalog item.
 */
@Injectable()
export class StandardToolsetService {
  constructor(
    private readonly repo: StandardToolsetRepo,
    private readonly organization: OrganizationService,
    private readonly plans: PlanLookupService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Sets the plans of a pair. Throws the input errors of `cleanToolsetInput`, ToolsetPlansNotFoundError,
   * ToolsetDepartmentNotFoundError, ToolsetJobTitleNotFoundError and, for a pair that has no toolset yet, the errors of an
   * inactive department or job title (`QĐ-68d`: a pair that exists may still change). The same plans change nothing.
   */
  async set(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    jobTitleId: string,
    input: { planIds: string[]; reason: string },
  ): Promise<{ toolset: ToolsetView; changed: boolean }> {
    const cleaned = cleanToolsetInput(input);
    const organization = await this.requireOrganization();
    const known = new Set((await this.plans.summaries(cleaned.planIds)).map((plan) => plan.planId));
    const missing = cleaned.planIds.filter((id) => !known.has(id));
    if (missing.length > 0) throw new ToolsetPlansNotFoundError(missing);

    try {
      return await this.runner.run(async (tx) => {
        const department = await this.organization.lockDepartmentShared(tx, departmentId);
        if (!department) throw new ToolsetDepartmentNotFoundError();
        const jobTitle = await this.organization.lockJobTitleForShare(tx, jobTitleId);
        if (!jobTitle) throw new ToolsetJobTitleNotFoundError();

        await this.repo.ensureHead(tx, departmentId, jobTitleId, organization.id);
        const currentVersion = await this.repo.lockCurrentVersion(tx, departmentId, jobTitleId);
        if (currentVersion === 0) {
          if (!department.active) throw new ToolsetDepartmentInactiveError();
          if (jobTitle.status !== 'ACTIVE') throw new ToolsetJobTitleInactiveError();
        }
        const current =
          currentVersion > 0 ? await this.repo.readVersion(departmentId, jobTitleId, currentVersion, tx) : null;
        if (current && sameToolset(current.planIds, cleaned.planIds)) {
          return { toolset: await this.show(current), changed: false };
        }

        const created = await this.repo.insertVersion(tx, {
          departmentId,
          jobTitleId,
          version: currentVersion + 1,
          reason: cleaned.reason,
          planIds: cleaned.planIds,
          changedByAppUserId: actor.appUserId,
        });
        await this.repo.setCurrentVersion(tx, departmentId, jobTitleId, created.version);
        await this.audit.record(
          tx,
          catalogAuditEvent(
            actor,
            organization.id,
            'STANDARD_TOOLSET.CHANGED',
            'StandardToolset',
            `${departmentId}/${jobTitleId}`,
            current ? snapshot(current) : null,
            snapshot(created),
          ),
        );

        return { toolset: await this.show(created), changed: true };
      });
    } catch (error) {
      // A plan removed between the check and the write: the foreign key says it is no longer there.
      if (readSqlState(error) === '23503') throw new ToolsetPlansNotFoundError(cleaned.planIds);
      throw error;
    }
  }

  /** The current toolset of a pair, or null when it has none. Throws the not-found and out-of-scope errors. */
  async get(principal: AuthenticatedPrincipal, departmentId: string, jobTitleId: string): Promise<ToolsetView | null> {
    await this.requirePair(departmentId, jobTitleId);
    await this.assertMayRead(principal, departmentId);
    const current = await this.repo.readCurrent(departmentId, jobTitleId);

    return current ? this.show(current) : null;
  }

  /** The settings of a pair, newest first. Throws the not-found errors. */
  async history(
    departmentId: string,
    jobTitleId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<ToolsetView>> {
    await this.requirePair(departmentId, jobTitleId);
    const { items, total } = await this.repo.history(
      departmentId,
      jobTitleId,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return pageOf(await Promise.all(items.map((item) => this.show(item))), total, query.page, query.pageSize);
  }

  /** The pairs that have a toolset. A department head names, and only gets, their own department. */
  async list(
    principal: AuthenticatedPrincipal,
    query: { departmentId?: string; page: number; pageSize: number },
  ): Promise<Page<ToolsetView>> {
    if (!principal.roles.includes('IT_ADMIN')) {
      if (!query.departmentId) throw new ToolsetOutOfScopeError();
      await this.assertMayRead(principal, query.departmentId);
    }
    const { items, total } = await this.repo.listCurrent({
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await Promise.all(items.map((item) => this.show(item))), total, query.page, query.pageSize);
  }

  /** The toolset of the department and job title the employee has today; the placement and the toolset are null when none. */
  async mine(principal: AuthenticatedPrincipal): Promise<{
    department: { id: string; code: string; name: string } | null;
    jobTitle: { id: string; name: string } | null;
    toolset: ToolsetView | null;
  }> {
    const placement = await this.organization.getEmployeePlacement(principal.employeeId);
    if (!placement) return { department: null, jobTitle: null, toolset: null };
    const [department, jobTitle, current] = await Promise.all([
      this.organization.getDepartmentBrief(placement.departmentId),
      this.organization.getJobTitle(placement.jobTitleId),
      this.repo.readCurrent(placement.departmentId, placement.jobTitleId),
    ]);

    return {
      department: department ? { id: department.id, code: department.code, name: department.name } : null,
      jobTitle: jobTitle ? { id: jobTitle.id, name: jobTitle.name } : null,
      toolset: current ? await this.show(current) : null,
    };
  }

  /** How many pairs have a toolset, for the onboarding checklist. */
  countConfigured(): Promise<number> {
    return this.repo.countConfigured();
  }

  private async requirePair(departmentId: string, jobTitleId: string): Promise<void> {
    if (!(await this.organization.getDepartmentBrief(departmentId))) throw new ToolsetDepartmentNotFoundError();
    if (!(await this.organization.getJobTitle(jobTitleId))) throw new ToolsetJobTitleNotFoundError();
  }

  /** The IT Admin reads any department; a department head reads the one they head today (`SoD-2`). */
  private async assertMayRead(principal: AuthenticatedPrincipal, departmentId: string): Promise<void> {
    if (principal.roles.includes('IT_ADMIN')) return;
    const headed = await this.organization.getHeadedDepartment(principal.employeeId);
    if (headed?.departmentId !== departmentId) throw new ToolsetOutOfScopeError();
  }

  private async show(version: ToolsetVersion): Promise<ToolsetView> {
    const summaries = new Map((await this.plans.summaries(version.planIds)).map((plan) => [plan.planId, plan]));

    return {
      departmentId: version.departmentId,
      jobTitleId: version.jobTitleId,
      version: version.version,
      plans: version.planIds
        .flatMap((id) => summaries.get(id) ?? [])
        .sort((a, b) => a.planName.localeCompare(b.planName)),
      reason: version.reason,
      changedBy: version.changedByAppUserId,
      changedAt: version.changedAt,
    };
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A standard toolset was changed before installation');

    return organization;
  }
}
