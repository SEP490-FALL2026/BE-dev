import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { usageAuditEvent } from '../usage-audit-event.mapper';
import { UsageSourceRefusedError } from './vendor-source.errors';
import { judgeSourceApplication, judgeTemplate } from './vendor-source.policy';
import { VendorSourceRepo } from './vendor-source.repo';
import type { NewSource, SourceRecord } from './vendor-source.types';

export type SourceInput = Omit<NewSource, 'organizationId' | 'createdByAppUserId'>;
export type SourceChange = Partial<Omit<SourceInput, 'applicationId'>>;

const auditView = (source: SourceInput): { [key: string]: string | number | boolean | null } => ({
  applicationId: source.applicationId,
  name: source.name,
  identifierType: source.identifierType,
  reportShape: source.reportShape,
  timeZone: source.timeZone,
  activityDefinition: source.activityDefinition,
  definitionStrictness: source.definitionStrictness,
  evidenceDirection: source.evidenceDirection,
  capMemberList: source.capabilities.memberList,
  capLastActivity: source.capabilities.lastActivity,
  capEventDetail: source.capabilities.eventDetail,
  capMaxHistoryDays: source.capabilities.maxHistoryDays,
});

/** The source as it will be: what the change names, and the rest as it was. */
function merged(before: SourceRecord, change: SourceChange): SourceInput {
  return {
    applicationId: before.applicationId,
    name: change.name ?? before.name,
    identifierType: change.identifierType ?? before.identifierType,
    reportShape: change.reportShape ?? before.reportShape,
    template: change.template ?? before.template,
    timeZone: change.timeZone ?? before.timeZone,
    activityDefinition: change.activityDefinition ?? before.activityDefinition,
    definitionStrictness: change.definitionStrictness ?? before.definitionStrictness,
    evidenceDirection: change.evidenceDirection ?? before.evidenceDirection,
    capabilities: change.capabilities ?? before.capabilities,
  };
}

/**
 * The IT Admin declares where the usage of an application comes from (`FR-4.2`): a record of configuration, not code. A change reaches only
 * the imports that come after it; once an import was confirmed, who a source identifies and which application it is for are fixed.
 */
@Injectable()
export class VendorSourceService {
  constructor(
    private readonly repo: VendorSourceRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws UsageSourceRefusedError: the application, the template, the capabilities, a name that is taken. */
  async create(actor: AuthenticatedPrincipal, input: SourceInput): Promise<SourceRecord> {
    const organization = await this.requireOrganization();
    await this.requireApplication(input.applicationId);
    this.requireTemplate(input);
    if (await this.repo.nameTaken(organization.id, input.applicationId, input.name)) {
      throw new UsageSourceRefusedError('NAME_TAKEN');
    }

    return this.runner.run(async (tx) => {
      const created = await this.repo.create(tx, {
        ...input,
        organizationId: organization.id,
        createdByAppUserId: actor.appUserId,
      });
      await this.audit.record(
        tx,
        usageAuditEvent(
          actor,
          organization.id,
          'USAGE_SOURCE.CREATED',
          'UsageSource',
          created.id,
          null,
          auditView(input),
        ),
      );

      return created;
    });
  }

  async update(actor: AuthenticatedPrincipal, id: string, change: SourceChange): Promise<SourceRecord> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const before = await this.repo.lock(tx, id);
      if (!before) throw new UsageSourceRefusedError('NOT_FOUND');
      const next = merged(before, change);
      if (next.identifierType !== before.identifierType && (await this.repo.hasCompletedImport(id, tx))) {
        throw new UsageSourceRefusedError('IN_USE', { fields: ['identifierType'] });
      }
      this.requireTemplate(next);
      if (
        next.name !== before.name &&
        (await this.repo.nameTaken(organization.id, before.applicationId, next.name, id))
      ) {
        throw new UsageSourceRefusedError('NAME_TAKEN');
      }
      const updated = await this.repo.update(tx, id, next);
      await this.audit.record(
        tx,
        usageAuditEvent(
          actor,
          organization.id,
          'USAGE_SOURCE.UPDATED',
          'UsageSource',
          id,
          auditView(before),
          auditView(updated),
        ),
      );

      return updated;
    });
  }

  private async requireApplication(applicationId: string): Promise<void> {
    const [application] = await this.catalog.getCollectorApplications([applicationId]);
    const problem = judgeSourceApplication(application);
    if (problem) throw new UsageSourceRefusedError(problem);
  }

  private requireTemplate(source: SourceInput): void {
    const problem = judgeTemplate(source.reportShape, source.template, source.capabilities);
    if (problem === 'CAPABILITY_MISMATCH')
      throw new UsageSourceRefusedError('TEMPLATE_CAPABILITY_MISMATCH', { reason: problem });
    if (problem) throw new UsageSourceRefusedError('TEMPLATE_INVALID', { reason: problem });
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A usage source was declared before installation');

    return organization;
  }
}
