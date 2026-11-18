import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { usageAuditEvent } from '../usage-audit-event.mapper';
import {
  CollectorAllowlistApplicationNotEligibleError,
  CollectorAllowlistApplicationNotFoundError,
  CollectorAllowlistUnchangedError,
} from './allowlist.errors';
import { changeOf, isSameList, judgeApplication, type ToolMapping } from './allowlist.policy';
import { AllowlistRepo, type VersionRecord } from './allowlist.repo';

/**
 * The IT Admin says which tools a collector may report and which application of the catalog each one is (`US-09-02` AC-7). A new version
 * is made only when the list changes; nothing already sent is judged again by it, a day is judged by the versions in force that day.
 */
@Injectable()
export class AllowlistPublishService {
  constructor(
    private readonly repo: AllowlistRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws CollectorAllowlistApplicationNotFoundError, CollectorAllowlistApplicationNotEligibleError and
   * CollectorAllowlistUnchangedError.
   */
  async publish(
    actor: AuthenticatedPrincipal,
    input: { reason: string; aiTools: readonly ToolMapping[] },
  ): Promise<VersionRecord & { applications: Map<string, string> }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The allowlist was published before installation');
    const applications = await this.catalog.getCollectorApplications(input.aiTools.map((item) => item.applicationId));
    const byId = new Map(applications.map((application) => [application.id, application]));
    for (const mapping of input.aiTools) {
      const verdict = judgeApplication(byId.get(mapping.applicationId));
      if (verdict === 'NOT_FOUND') throw new CollectorAllowlistApplicationNotFoundError();
      if (verdict === 'NOT_ELIGIBLE') throw new CollectorAllowlistApplicationNotEligibleError();
    }

    const version = await this.runner.run(async (tx) => {
      await this.repo.lockNumbering(tx, organization.id);
      const current = await this.repo.current(organization.id, tx);
      const before: ToolMapping[] = current?.entries ?? [];
      if (isSameList(before, input.aiTools)) throw new CollectorAllowlistUnchangedError();
      const made = await this.repo.insert(tx, {
        organizationId: organization.id,
        reason: input.reason,
        publishedByAppUserId: actor.appUserId,
        entries: input.aiTools,
      });
      const change = changeOf(before, input.aiTools);
      await this.audit.record(
        tx,
        usageAuditEvent(
          actor,
          organization.id,
          'COLLECTOR_ALLOWLIST.PUBLISHED',
          'CollectorAllowlistVersion',
          made.id,
          null,
          {
            reason: input.reason,
            versionNumber: made.versionNumber,
            added: change.added,
            removed: change.removed,
          },
        ),
      );

      return made;
    });

    return { ...version, applications: new Map(applications.map((application) => [application.id, application.name])) };
  }
}
