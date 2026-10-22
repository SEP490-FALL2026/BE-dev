import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { catalogAuditEvent } from '../mappers/catalog-audit-event';
import { ContractNotFoundError } from './contract.errors';
import { cleanContractName } from './contract.policy';
import { ContractRepo, type ContractRecord } from './contract.repo';

/**
 * The contracts (`US-04-04`, `OQ-B-17`): for now a name, made by the IT Admin, that files can be attached to. A contract is
 * never changed or deleted; its link to a subscription, a vendor and its terms belong to the Story of the contract.
 */
@Injectable()
export class ContractService {
  constructor(
    private readonly repo: ContractRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws ContractNameRequiredError. */
  async create(actor: AuthenticatedPrincipal, input: { name: string }): Promise<ContractRecord> {
    const name = cleanContractName(input.name);
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A contract was made before installation');

    return this.runner.run(async (tx) => {
      const contract = await this.repo.insert(tx, {
        organizationId: organization.id,
        name,
        createdByAppUserId: actor.appUserId,
      });
      await this.audit.record(
        tx,
        catalogAuditEvent(actor, organization.id, 'CONTRACT.CREATED', 'Contract', contract.id, null, { name }),
      );

      return contract;
    });
  }

  /** Throws ContractNotFoundError. */
  async get(id: string): Promise<ContractRecord> {
    const contract = await this.repo.find(id);
    if (!contract) throw new ContractNotFoundError();

    return contract;
  }
}
