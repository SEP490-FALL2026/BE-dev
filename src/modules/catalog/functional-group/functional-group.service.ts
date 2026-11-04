import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { normalizeDisplayName } from '../../../core/display-name';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import {
  FunctionalGroupNameInvalidError,
  FunctionalGroupNameTakenError,
  FunctionalGroupNotFoundError,
  FunctionalGroupUpdateEmptyError,
} from './functional-group.errors';
import { FunctionalGroupRepo } from './functional-group.repo';
import type { FunctionalGroupRecord, FunctionalGroupStatus } from './functional-group.types';

const MAX_NAME_LENGTH = 200;

const snapshot = (group: FunctionalGroupRecord) => ({ name: group.name, status: group.status });

function cleanName(raw: string): string {
  const name = normalizeDisplayName(raw);
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) throw new FunctionalGroupNameInvalidError();

  return name;
}

/**
 * The functional groups the IT Admin keeps (`BR-06.9`). A group is added, renamed, switched off and on again, never
 * deleted: applications keep pointing at it. Each write commits with its audit event.
 */
@Injectable()
export class FunctionalGroupService {
  constructor(
    private readonly groups: FunctionalGroupRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  async list(query: {
    status?: FunctionalGroupStatus;
    page: number;
    pageSize: number;
  }): Promise<Page<FunctionalGroupRecord>> {
    const { items, total } = await this.groups.list({
      ...(query.status ? { status: query.status } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** Throws FunctionalGroupNameInvalidError and FunctionalGroupNameTakenError. */
  async create(actor: AuthenticatedPrincipal, input: { name: string }): Promise<FunctionalGroupRecord> {
    const name = cleanName(input.name);
    const organizationId = await this.requireOrganizationId();

    try {
      return await this.runner.run(async (tx) => {
        const group = await this.groups.create(tx, organizationId, name);
        await this.audit.record(
          tx,
          catalogAuditEvent(
            actor,
            organizationId,
            'FUNCTIONAL_GROUP.CREATED',
            'FunctionalGroup',
            group.id,
            null,
            snapshot(group),
          ),
        );

        return group;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'normalized_name')) throw new FunctionalGroupNameTakenError();
      throw error;
    }
  }

  /** As `create`, plus FunctionalGroupNotFoundError and FunctionalGroupUpdateEmptyError. A change of nothing is a no-op. */
  async update(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { name?: string; status?: FunctionalGroupStatus },
  ): Promise<FunctionalGroupRecord> {
    if (input.name === undefined && input.status === undefined) throw new FunctionalGroupUpdateEmptyError();
    const name = input.name === undefined ? undefined : cleanName(input.name);
    const organizationId = await this.requireOrganizationId();

    try {
      return await this.runner.run(async (tx) => {
        const current = await this.groups.lock(tx, id);
        if (!current) throw new FunctionalGroupNotFoundError();
        const changes = {
          ...(name !== undefined && name !== current.name ? { name } : {}),
          ...(input.status !== undefined && input.status !== current.status ? { status: input.status } : {}),
        };
        if (Object.keys(changes).length === 0) return current;

        const updated = await this.groups.update(tx, id, changes);
        await this.audit.record(
          tx,
          catalogAuditEvent(
            actor,
            organizationId,
            'FUNCTIONAL_GROUP.UPDATED',
            'FunctionalGroup',
            id,
            snapshot(current),
            snapshot(updated),
          ),
        );

        return updated;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'normalized_name')) throw new FunctionalGroupNameTakenError();
      throw error;
    }
  }

  private async requireOrganizationId(): Promise<string> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The functional groups were used before installation');

    return organization.id;
  }
}
