import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import {
  VendorGroupNameTakenError,
  VendorGroupNotFoundError,
  VendorServiceLineNameTakenError,
  VendorServiceLineNotFoundError,
  VendorUpdateEmptyError,
} from './vendor-dictionary.errors';
import { VendorDictionaryRepo } from './vendor-dictionary.repo';
import type { VendorGroupRecord, VendorLineRecord } from './vendor-dictionary.types';
import { cleanDomains, cleanName, cleanPatterns } from './vendor-dictionary.policy';

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const groupSnapshot = (group: VendorGroupRecord) => ({ name: group.name, brandDomains: group.brandDomains });
const lineSnapshot = (line: VendorLineRecord) => ({
  groupId: line.groupId,
  name: line.name,
  domains: line.domains,
  patterns: line.patterns,
});

/**
 * The shared vendor dictionary the IT Admin keeps (`US-04-07`): vendor groups and their separately billed service
 * lines. Every write commits with its audit event; nothing is deleted. A name is unique ignoring case, accents and
 * spacing, decided by the database rather than by a check before the insert.
 */
@Injectable()
export class VendorDictionaryService {
  constructor(
    private readonly repo: VendorDictionaryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  async listGroups(query: { search?: string; page: number; pageSize: number }): Promise<Page<VendorGroupRecord>> {
    const { items, total } = await this.repo.listGroups({
      ...(query.search ? { search: query.search } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /**
   * Throws VendorNameInvalidError, VendorDomainInvalidError, VendorTooManyValuesError and VendorGroupNameTakenError.
   */
  async createGroup(
    actor: AuthenticatedPrincipal,
    input: { name: string; brandDomains?: string[] },
  ): Promise<VendorGroupRecord> {
    const name = cleanName(input.name);
    const brandDomains = cleanDomains(input.brandDomains ?? []);
    const organizationId = await this.requireOrganizationId();

    try {
      return await this.runner.run(async (tx) => {
        const group = await this.repo.createGroup(tx, { name, brandDomains });
        await this.audit.record(
          tx,
          catalogAuditEvent(
            actor,
            organizationId,
            'VENDOR_GROUP.CREATED',
            'VendorGroup',
            group.id,
            null,
            groupSnapshot(group),
          ),
        );

        return group;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'normalized_name')) throw new VendorGroupNameTakenError();
      throw error;
    }
  }

  /** As `createGroup`, plus VendorGroupNotFoundError and VendorUpdateEmptyError. A change that changes nothing is a no-op. */
  async updateGroup(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { name?: string; brandDomains?: string[] },
  ): Promise<VendorGroupRecord> {
    if (input.name === undefined && input.brandDomains === undefined) throw new VendorUpdateEmptyError();
    const name = input.name === undefined ? undefined : cleanName(input.name);
    const brandDomains = input.brandDomains === undefined ? undefined : cleanDomains(input.brandDomains);
    const organizationId = await this.requireOrganizationId();

    try {
      return await this.runner.run(async (tx) => {
        const current = await this.repo.lockGroup(tx, id);
        if (!current) throw new VendorGroupNotFoundError();
        const changes = {
          ...(name !== undefined && name !== current.name ? { name } : {}),
          ...(brandDomains !== undefined && !sameList(brandDomains, current.brandDomains) ? { brandDomains } : {}),
        };
        if (Object.keys(changes).length === 0) return current;

        const updated = await this.repo.updateGroup(tx, id, changes);
        await this.audit.record(
          tx,
          catalogAuditEvent(
            actor,
            organizationId,
            'VENDOR_GROUP.UPDATED',
            'VendorGroup',
            id,
            groupSnapshot(current),
            groupSnapshot(updated),
          ),
        );

        return updated;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'normalized_name')) throw new VendorGroupNameTakenError();
      throw error;
    }
  }

  /** Throws VendorGroupNotFoundError, the validation errors, and VendorServiceLineNameTakenError. */
  async createServiceLine(
    actor: AuthenticatedPrincipal,
    groupId: string,
    input: { name: string; domains?: string[]; patterns?: string[] },
  ): Promise<VendorLineRecord> {
    const name = cleanName(input.name);
    const domains = cleanDomains(input.domains ?? []);
    const patterns = cleanPatterns(input.patterns ?? []);
    const organizationId = await this.requireOrganizationId();

    try {
      return await this.runner.run(async (tx) => {
        if (!(await this.repo.lockGroup(tx, groupId))) throw new VendorGroupNotFoundError();
        const line = await this.repo.createLine(tx, groupId, { name, domains, patterns });
        await this.audit.record(
          tx,
          catalogAuditEvent(
            actor,
            organizationId,
            'VENDOR_SERVICE_LINE.CREATED',
            'VendorServiceLine',
            line.id,
            null,
            lineSnapshot(line),
          ),
        );

        return line;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'normalized_name')) throw new VendorServiceLineNameTakenError();
      throw error;
    }
  }

  /** As `createServiceLine`, with VendorServiceLineNotFoundError and VendorUpdateEmptyError. */
  async updateServiceLine(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { name?: string; domains?: string[]; patterns?: string[] },
  ): Promise<VendorLineRecord> {
    if (input.name === undefined && input.domains === undefined && input.patterns === undefined) {
      throw new VendorUpdateEmptyError();
    }
    const name = input.name === undefined ? undefined : cleanName(input.name);
    const domains = input.domains === undefined ? undefined : cleanDomains(input.domains);
    const patterns = input.patterns === undefined ? undefined : cleanPatterns(input.patterns);
    const organizationId = await this.requireOrganizationId();

    try {
      return await this.runner.run(async (tx) => {
        const current = await this.repo.lockLine(tx, id);
        if (!current) throw new VendorServiceLineNotFoundError();
        const changes = {
          ...(name !== undefined && name !== current.name ? { name } : {}),
          ...(domains !== undefined && !sameList(domains, current.domains) ? { domains } : {}),
          ...(patterns !== undefined && !sameList(patterns, current.patterns) ? { patterns } : {}),
        };
        if (Object.keys(changes).length === 0) return current;

        const updated = await this.repo.updateLine(tx, id, changes);
        await this.audit.record(
          tx,
          catalogAuditEvent(
            actor,
            organizationId,
            'VENDOR_SERVICE_LINE.UPDATED',
            'VendorServiceLine',
            id,
            lineSnapshot(current),
            lineSnapshot(updated),
          ),
        );

        return updated;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'normalized_name')) throw new VendorServiceLineNameTakenError();
      throw error;
    }
  }

  private async requireOrganizationId(): Promise<string> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The vendor dictionary was used before installation');

    return organization.id;
  }
}
