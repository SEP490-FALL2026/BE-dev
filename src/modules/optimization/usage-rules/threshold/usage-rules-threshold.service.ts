import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import type { AuditValue } from '../../../audit/public/audit.types';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { UsageRulesRepo, type ApplicationThresholdRecord } from '../usage-rules.repo';
import {
  GhostSeatThresholdApplicationInternalError,
  GhostSeatThresholdApplicationNotFoundError,
  GhostSeatThresholdOrderError,
} from './usage-rules-threshold.errors';

export interface ThresholdInput {
  monitorDays: number;
  reviewDays: number;
  actionDays: number;
}

const valueOf = (record: ApplicationThresholdRecord | null): { [key: string]: AuditValue } | null =>
  record ? { monitorDays: record.monitorDays, reviewDays: record.reviewDays, actionDays: record.actionDays } : null;

const wire = (record: ApplicationThresholdRecord, applicationName: string) => ({
  applicationId: record.applicationId,
  applicationName,
  monitorDays: record.monitorDays,
  reviewDays: record.reviewDays,
  actionDays: record.actionDays,
  updatedAt: record.updatedAt.toISOString(),
});

/**
 * The thresholds of days without use of an application (`FR-4.13`, `US-10-03` AC-6): the Super Admin sets and removes them, the IT Admin reads them.
 * They rise (`monitor < review < action`, 1 to 365), belong to the application and not to a department, and apply from the next weekly pass (`R-K03`);
 * a threshold set or removed is audited with the days before and after. Internal software has none (it has no usage evidence).
 */
@Injectable()
export class UsageRulesThresholdService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: UsageRulesRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  async list(page: { page: number; pageSize: number }) {
    const organization = await this.organizationReads.getOrganization();
    const { items, total } = organization
      ? await this.repo.listThresholds(organization.id, { skip: (page.page - 1) * page.pageSize, take: page.pageSize })
      : { items: [], total: 0 };
    const names = await this.namesOf(items.map((row) => row.applicationId));

    return {
      items: items.map((row) => wire(row, names.get(row.applicationId)?.name ?? '')),
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / page.pageSize),
      },
    };
  }

  /** Throws GhostSeatThresholdOrderError, GhostSeatThresholdApplicationInternalError and GhostSeatThresholdApplicationNotFoundError. */
  async set(actor: AuthenticatedPrincipal, applicationId: string, input: ThresholdInput) {
    if (!(input.monitorDays < input.reviewDays && input.reviewDays < input.actionDays)) {
      throw new GhostSeatThresholdOrderError();
    }
    const application = (await this.namesOf([applicationId])).get(applicationId);
    if (!application) throw new GhostSeatThresholdApplicationNotFoundError();
    if (application.kind === 'INTERNAL') throw new GhostSeatThresholdApplicationInternalError();
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new GhostSeatThresholdApplicationNotFoundError();

    return this.runner.run(async (tx) => {
      const before = (await this.repo.thresholdsOf([applicationId], tx)).get(applicationId) ?? null;
      const after = await this.repo.upsertThreshold(
        tx,
        { organizationId: organization.id, applicationId, ...input, updatedByAppUserId: actor.appUserId },
        new Date(),
      );
      await this.record(tx, actor, organization.id, 'GHOST_SEAT_THRESHOLD.SET', applicationId, before, after);

      return { threshold: wire(after, application.name) };
    });
  }

  async remove(actor: AuthenticatedPrincipal, applicationId: string) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new GhostSeatThresholdApplicationNotFoundError();

    return this.runner.run(async (tx) => {
      const before = await this.repo.deleteThreshold(tx, applicationId);
      if (!before) throw new GhostSeatThresholdApplicationNotFoundError();
      await this.record(tx, actor, organization.id, 'GHOST_SEAT_THRESHOLD.DELETED', applicationId, before, null);

      return { applicationId };
    });
  }

  private async namesOf(ids: readonly string[]) {
    return new Map(
      (await this.catalog.getCollectorApplications([...new Set(ids)])).map(
        (application) => [application.id, application] as const,
      ),
    );
  }

  private async record(
    tx: Parameters<AuditApi['record']>[0],
    actor: AuthenticatedPrincipal,
    organizationId: string,
    action: string,
    applicationId: string,
    before: ApplicationThresholdRecord | null,
    after: ApplicationThresholdRecord | null,
  ): Promise<void> {
    await this.audit.record(tx, {
      organizationId,
      action,
      resourceType: 'GHOST_SEAT_THRESHOLD',
      resourceId: applicationId,
      before: valueOf(before),
      after: valueOf(after),
      actorKind: 'USER',
      actorAppUserId: actor.appUserId,
      actorRoles: actor.roles,
      correlationId: actor.sessionId,
    });
  }
}
