import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { AuditValue } from '../../audit/public/audit.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { VendorRepo } from '../vendor/vendor.repo';
import {
  changedContractFields,
  cleanChangeReason,
  newContractFields,
  numberKeyOf,
  sameContractFields,
  type ContractChange,
  type ContractFields,
  type NewContract,
} from './contract-fields.policy';
import { ContractSubscriptionRepo } from './contract-subscription.repo';
import {
  ContractNotFoundError,
  ContractNumberTakenError,
  ContractVendorLockedError,
  ContractVendorNotFoundError,
} from './contract.errors';
import { ContractRepo, type ContractRecord } from './contract.repo';

/** What the Audit Trail keeps of a contract: the business fields, never its maker or its files. */
const auditFieldsOf = (fields: ContractFields): { [key: string]: AuditValue } => ({
  name: fields.name,
  vendorId: fields.vendorId,
  number: fields.number,
  effectiveFrom: fields.effectiveFrom,
  effectiveTo: fields.effectiveTo,
  note: fields.note,
});

/**
 * The contracts (`US-04-13`, `QĐ-111t`): the IT Admin makes one with its vendor and the days it is in effect, and changes it for a reason.
 * A contract is never deleted. Its subscriptions are linked by `ContractSubscriptionService`, its files by `DocumentService`.
 */
@Injectable()
export class ContractService {
  constructor(
    private readonly repo: ContractRepo,
    private readonly links: ContractSubscriptionRepo,
    private readonly vendors: VendorRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws ContractNameRequiredError, ContractVendorRequiredError, ContractEffectiveFromRequiredError,
   * ContractEffectiveRangeError, ContractVendorNotFoundError and ContractNumberTakenError.
   */
  async create(actor: AuthenticatedPrincipal, input: NewContract): Promise<ContractRecord> {
    const fields = newContractFields(input);
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A contract was made before installation');

    try {
      return await this.runner.run(async (tx) => {
        await this.assertVendorExists(tx, fields.vendorId);
        if (fields.number !== null && (await this.repo.numberTaken(tx, organization.id, fields.number))) {
          throw new ContractNumberTakenError();
        }
        const contract = await this.repo.insert(tx, {
          organizationId: organization.id,
          fields,
          createdByAppUserId: actor.appUserId,
        });
        await this.audit.record(
          tx,
          catalogAuditEvent(
            actor,
            organization.id,
            'CONTRACT.CREATED',
            'Contract',
            contract.id,
            null,
            auditFieldsOf(fields),
          ),
        );

        return contract;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'number_key')) throw new ContractNumberTakenError();
      throw error;
    }
  }

  /**
   * Changes the fields the change names, under a lock on the contract, and keeps the reason with the before and after in the Audit
   * Trail. A change that leaves every field as it is writes nothing. Throws ContractReasonRequiredError, ContractUpdateEmptyError,
   * ContractNotFoundError, ContractNameRequiredError, ContractEffectiveRangeError, ContractVendorLockedError,
   * ContractVendorNotFoundError and ContractNumberTakenError.
   */
  async update(
    actor: AuthenticatedPrincipal,
    id: string,
    input: ContractChange & { reason?: string },
  ): Promise<ContractRecord> {
    const { reason: rawReason, ...change } = input;
    const reason = cleanChangeReason(rawReason);
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A contract was changed before installation');

    try {
      return await this.runner.run(async (tx) => {
        const current = await this.repo.lock(tx, id);
        if (!current) throw new ContractNotFoundError();
        const next = changedContractFields(current, change);
        if (sameContractFields(next, current)) return current;

        if (next.vendorId !== current.vendorId) {
          if ((await this.links.countOf(tx, id)) > 0) throw new ContractVendorLockedError();
          await this.assertVendorExists(tx, next.vendorId);
        }
        if (
          next.number !== null &&
          (current.number === null || numberKeyOf(next.number) !== numberKeyOf(current.number))
        ) {
          if (await this.repo.numberTaken(tx, organization.id, next.number, id)) throw new ContractNumberTakenError();
        }
        const updated = await this.repo.update(tx, id, next);
        await this.audit.record(
          tx,
          catalogAuditEvent(actor, organization.id, 'CONTRACT.UPDATED', 'Contract', id, auditFieldsOf(current), {
            ...auditFieldsOf(next),
            reason,
          }),
        );

        return updated;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'number_key')) throw new ContractNumberTakenError();
      throw error;
    }
  }

  private async assertVendorExists(tx: DbTx, vendorId: string | null): Promise<void> {
    if (vendorId !== null && !(await this.vendors.find(tx, vendorId))) throw new ContractVendorNotFoundError();
  }
}
