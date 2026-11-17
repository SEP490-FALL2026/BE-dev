import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { assertSubscriptionLinkable } from './contract-fields.policy';
import { ContractSubscriptionRepo, type ContractSubscriptionBrief } from './contract-subscription.repo';
import {
  ContractNotFoundError,
  ContractSubscriptionAlreadyLinkedError,
  ContractSubscriptionNotFoundError,
  ContractSubscriptionNotLinkedError,
} from './contract.errors';
import { ContractRepo } from './contract.repo';

/**
 * Which subscriptions rest on a contract (`US-04-13` AC-6, AC-7; `QĐ-111t`): only those of a shared stock (K2 or K4), of the same vendor,
 * and each on at most one contract. Both steps lock the contract, so a link and a change of its vendor queue. A link says which
 * subscription and which contract in the Audit Trail, as an unlink does.
 */
@Injectable()
export class ContractSubscriptionService {
  constructor(
    private readonly contracts: ContractRepo,
    private readonly links: ContractSubscriptionRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws ContractNotFoundError, ContractSubscriptionNotFoundError, ContractSubscriptionKindNotAllowedError, ContractIncompleteError,
   * ContractSubscriptionVendorMismatchError and ContractSubscriptionAlreadyLinkedError.
   */
  async link(
    actor: AuthenticatedPrincipal,
    contractId: string,
    subscriptionId: string,
  ): Promise<ContractSubscriptionBrief> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A subscription was linked before installation');

    try {
      return await this.runner.run(async (tx) => {
        const contract = await this.contracts.lock(tx, contractId);
        if (!contract) throw new ContractNotFoundError();
        const facts = await this.links.linkFacts(subscriptionId, tx);
        if (!facts) throw new ContractSubscriptionNotFoundError();
        assertSubscriptionLinkable({
          provisioningType: facts.provisioningType,
          subscriptionVendorId: facts.vendorId,
          contractVendorId: contract.vendorId,
        });
        if (facts.contractId !== null) throw new ContractSubscriptionAlreadyLinkedError(facts.contractId);

        await this.links.insert(tx, { contractId, subscriptionId, linkedByAppUserId: actor.appUserId });
        await this.audit.record(
          tx,
          catalogAuditEvent(actor, organization.id, 'CONTRACT.SUBSCRIPTION_LINKED', 'Contract', contractId, null, {
            subscriptionId,
          }),
        );
        const brief = await this.links.briefOf(contractId, subscriptionId, tx);
        if (!brief) throw new Error('A subscription just linked to a contract was not found on it');

        return brief;
      });
    } catch (error) {
      // Two links of one subscription at once: the unique index let one win, and the loser is told which contract has it.
      if (isUniqueViolation(error, 'subscription_id')) {
        const taken = await this.links.currentContractOf(subscriptionId);
        if (taken) throw new ContractSubscriptionAlreadyLinkedError(taken);
      }
      throw error;
    }
  }

  /** Throws ContractNotFoundError and ContractSubscriptionNotLinkedError. Answers with what was unlinked. */
  async unlink(
    actor: AuthenticatedPrincipal,
    contractId: string,
    subscriptionId: string,
  ): Promise<ContractSubscriptionBrief> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A subscription was unlinked before installation');

    return this.runner.run(async (tx) => {
      if (!(await this.contracts.lock(tx, contractId))) throw new ContractNotFoundError();
      const brief = await this.links.briefOf(contractId, subscriptionId, tx);
      if (!brief) throw new ContractSubscriptionNotLinkedError();
      await this.links.remove(tx, contractId, subscriptionId);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'CONTRACT.SUBSCRIPTION_UNLINKED',
          'Contract',
          contractId,
          { subscriptionId },
          null,
        ),
      );

      return brief;
    });
  }
}
