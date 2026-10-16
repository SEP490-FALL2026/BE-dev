import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../audit/audit.service';
import {
  JobTitleNameRequiredError,
  JobTitleNameTakenError,
  JobTitleNameTooLongError,
  JobTitleNotFoundError,
} from './errors/organization.errors';
import { displayJobTitleName, isJobTitleNameTooLong, normalizeJobTitleName } from './job-title-name';
import { organizationAuditEvent } from './organization-audit';
import { OrganizationRepo } from './organization.repo';
import { OrganizationService } from './organization.service';
import { JobTitleRecord, JobTitleStatus } from './organization.types';

export interface JobTitlePage {
  items: JobTitleRecord[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * The job title catalogue an IT Admin maintains (`US-02-07`). Every change takes the title's row lock first
 * and re-reads what it decides on (lock protocol rules 1 and 2); the audit event commits with the change.
 */
@Injectable()
export class JobTitleService {
  constructor(
    private readonly repo: OrganizationRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  async list(query: {
    status?: JobTitleStatus;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<JobTitlePage> {
    const search = query.search ? normalizeJobTitleName(query.search) : '';
    const { items, total } = await this.repo.listJobTitles({
      ...(query.status ? { status: query.status } : {}),
      ...(search ? { search } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** Adds a title, `ACTIVE`. Throws JobTitleNameRequiredError, JobTitleNameTooLongError or JobTitleNameTakenError. */
  async create(actor: AuthenticatedPrincipal, rawName: string): Promise<JobTitleRecord> {
    this.assertUsableName(rawName);
    const organization = await this.requireOrganization();

    try {
      return await this.runner.run(async (tx) => {
        const title = await this.repo.insertJobTitle(tx, organization.id, rawName);
        await this.audit.record(
          tx,
          organizationAuditEvent(actor, organization.id, 'JOB_TITLE.CREATED', 'JobTitle', title.id, null, {
            name: title.name,
            status: title.status,
          }),
        );

        return title;
      });
    } catch (error) {
      throw await this.translateNameClash(error, organization.id, rawName, null);
    }
  }

  /**
   * Changes the name of a title in place. Everyone who holds it keeps it: no placement is touched. A name that
   * differs from the title's own only in case or whitespace is allowed; the same name again changes nothing.
   */
  async rename(actor: AuthenticatedPrincipal, jobTitleId: string, rawName: string): Promise<JobTitleRecord> {
    this.assertUsableName(rawName);
    const organization = await this.requireOrganization();

    try {
      return await this.runner.run(async (tx) => {
        const current = await this.repo.lockJobTitle(tx, jobTitleId, 'UPDATE');
        if (!current) throw new JobTitleNotFoundError();
        if (current.name === displayJobTitleName(rawName)) return current;

        const renamed = await this.repo.renameJobTitle(tx, jobTitleId, rawName, new Date());
        await this.audit.record(
          tx,
          organizationAuditEvent(
            actor,
            organization.id,
            'JOB_TITLE.RENAMED',
            'JobTitle',
            jobTitleId,
            { name: current.name },
            { name: renamed.name },
          ),
        );

        return renamed;
      });
    } catch (error) {
      throw await this.translateNameClash(error, organization.id, rawName, jobTitleId);
    }
  }

  /** Stops the title being chosen for new people. Nobody who holds it loses it (AC-6). Already off ⟹ no change. */
  deactivate(actor: AuthenticatedPrincipal, jobTitleId: string): Promise<JobTitleRecord> {
    return this.changeStatus(actor, jobTitleId, 'INACTIVE', 'JOB_TITLE.DEACTIVATED');
  }

  /** Makes the title choosable again (AC-8). Already on ⟹ no change. */
  reactivate(actor: AuthenticatedPrincipal, jobTitleId: string): Promise<JobTitleRecord> {
    return this.changeStatus(actor, jobTitleId, 'ACTIVE', 'JOB_TITLE.REACTIVATED');
  }

  private async changeStatus(
    actor: AuthenticatedPrincipal,
    jobTitleId: string,
    status: JobTitleStatus,
    action: string,
  ): Promise<JobTitleRecord> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const current = await this.repo.lockJobTitle(tx, jobTitleId, 'UPDATE');
      if (!current) throw new JobTitleNotFoundError();
      // Already in the state asked for: say so, write nothing, record nothing (T-13).
      if (current.status === status) return current;

      const changed = await this.repo.setJobTitleStatus(tx, jobTitleId, status, new Date());
      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          action,
          'JobTitle',
          jobTitleId,
          { status: current.status },
          { status },
        ),
      );

      return changed;
    });
  }

  private assertUsableName(rawName: string): void {
    if (displayJobTitleName(rawName) === '') throw new JobTitleNameRequiredError();
    if (isJobTitleNameTooLong(rawName)) throw new JobTitleNameTooLongError();
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('The job title catalogue was used before installation');

    return organization;
  }

  /**
   * A write that lost to the unique name becomes JobTitleNameTakenError naming the other title, found after the
   * rollback. Anything else is returned unchanged for the caller to map.
   */
  private async translateNameClash(
    error: unknown,
    organizationId: string,
    rawName: string,
    ownId: string | null,
  ): Promise<unknown> {
    if (!isUniqueViolation(error, 'normalized_name')) return error;

    const other = await this.repo.findJobTitleByNormalizedName(organizationId, normalizeJobTitleName(rawName));
    const conflict = other && other.id !== ownId ? { id: other.id, name: other.name, status: other.status } : null;

    return new JobTitleNameTakenError(conflict);
  }
}
