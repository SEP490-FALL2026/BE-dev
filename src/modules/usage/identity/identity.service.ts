import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { usageAuditEvent } from '../usage-audit-event.mapper';
import { UsageIdentityRefusedError } from './identity.errors';
import { isHandleable } from './identity.policy';
import { IdentityRepo } from './identity.repo';
import type { MappingRecord, UnmatchedRecord } from './identity.types';

/**
 * What the IT Admin does with an identifier of a vendor (`US-08-04`): says who it is (a mapping made by hand, with the identifier as the vendor
 * wrote it), dismisses it (it stays in the queue and still blocks any conclusion, `INV-12`), or takes a wrong mapping back (`DA6-11`): the days
 * of that identifier are tied to nobody until it is resolved again, and the next read ties them to the right person.
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly repo: IdentityRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws UsageIdentityRefusedError: not found, the person does not exist, already handled, the identifier is mapped already. */
  async resolve(actor: AuthenticatedPrincipal, id: string, employeeId: string): Promise<UnmatchedRecord> {
    const organization = await this.requireOrganization();
    if (!(await this.organizationReads.getEmployee(employeeId)))
      throw new UsageIdentityRefusedError('EMPLOYEE_NOT_FOUND');

    return this.runner.run(async (tx) => {
      const item = await this.repo.lockUnmatched(tx, id);
      if (!item) throw new UsageIdentityRefusedError('UNMATCHED_NOT_FOUND');
      if (!isHandleable(item.status)) throw new UsageIdentityRefusedError('ALREADY_HANDLED');
      const mappingId = await this.repo.insertMappingIfAbsent(tx, {
        organizationId: organization.id,
        applicationId: item.applicationId,
        identifierType: item.identifierType,
        normalizedIdentifier: item.normalizedIdentifier,
        rawIdentifier: item.rawIdentifier,
        employeeId,
        method: 'MANUAL',
        confidence: 'HIGH',
        confirmedByAppUserId: actor.appUserId,
      });
      if (mappingId === null) throw new UsageIdentityRefusedError('ALREADY_MAPPED');
      await this.repo.setUnmatchedHandled(tx, id, {
        status: 'RESOLVED',
        byAppUserId: actor.appUserId,
        at: new Date(),
        mappingId,
      });
      await this.audit.record(
        tx,
        usageAuditEvent(actor, organization.id, 'USAGE_IDENTITY.RESOLVED', 'UsageUnmatchedIdentity', id, null, {
          applicationId: item.applicationId,
          employeeId,
          mappingId,
        }),
      );

      return this.reread(tx, id);
    });
  }

  async dismiss(actor: AuthenticatedPrincipal, id: string, note: string): Promise<UnmatchedRecord> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const item = await this.repo.lockUnmatched(tx, id);
      if (!item) throw new UsageIdentityRefusedError('UNMATCHED_NOT_FOUND');
      if (!isHandleable(item.status)) throw new UsageIdentityRefusedError('ALREADY_HANDLED');
      await this.repo.setUnmatchedHandled(tx, id, {
        status: 'DISMISSED',
        byAppUserId: actor.appUserId,
        at: new Date(),
        note,
      });
      await this.audit.record(
        tx,
        usageAuditEvent(actor, organization.id, 'USAGE_IDENTITY.DISMISSED', 'UsageUnmatchedIdentity', id, null, {
          applicationId: item.applicationId,
          note,
        }),
      );

      return this.reread(tx, id);
    });
  }

  /** Takes a mapping back with its reason: its identifier goes back to the queue as open. */
  async endMapping(actor: AuthenticatedPrincipal, id: string, reason: string): Promise<MappingRecord> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const mapping = await this.repo.lockMapping(tx, id);
      if (!mapping) throw new UsageIdentityRefusedError('MAPPING_NOT_FOUND');
      if (mapping.endedAt !== null) throw new UsageIdentityRefusedError('MAPPING_ENDED');
      await this.repo.endMapping(tx, id, { byAppUserId: actor.appUserId, reason, at: new Date() });
      await this.repo.reopenAfterEnd(tx, mapping);
      await this.audit.record(
        tx,
        usageAuditEvent(
          actor,
          organization.id,
          'USAGE_IDENTITY.MAPPING_ENDED',
          'UsageIdentityMapping',
          id,
          { employeeId: mapping.employeeId, method: mapping.method },
          { reason },
        ),
      );
      const ended = await this.repo.findMapping(id, tx);
      if (!ended) throw new UsageIdentityRefusedError('MAPPING_NOT_FOUND');

      return ended;
    });
  }

  private async reread(tx: Parameters<IdentityRepo['findUnmatched']>[1], id: string): Promise<UnmatchedRecord> {
    const item = await this.repo.findUnmatched(id, tx);
    if (!item) throw new UsageIdentityRefusedError('UNMATCHED_NOT_FOUND');

    return item;
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A usage identity was changed before installation');

    return organization;
  }
}
