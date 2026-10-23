import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { catalogAuditEvent } from '../mappers/catalog-audit-event';
import { VendorDictionaryLookupService } from '../vendor-dictionary/vendor-dictionary-lookup.service';
import { VendorProposalIntakeService } from '../vendor-dictionary/vendor-proposal-intake.service';
import { VendorDirectoryService } from '../vendor/vendor-directory.service';
import {
  ApplicationDictionaryLineMismatchError,
  ApplicationDictionaryLineNotFoundError,
  ApplicationInternalHasNoVendorError,
} from './application.errors';
import type { ApplicationRecord } from './application.types';

/**
 * What an application declaration or change does to the vendor side of the catalog, each with its own audit event
 * (`DB-11`): the vendor taking the dictionary group of a line, and the proposal raised for software outside the dictionary.
 */
@Injectable()
export class ApplicationVendorLinkService {
  constructor(
    private readonly dictionary: VendorDictionaryLookupService,
    private readonly vendors: VendorDirectoryService,
    private readonly proposals: VendorProposalIntakeService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The line must exist and sit in the dictionary group of the application's vendor, which takes the group if it has none;
   * the answer names the vendor and group when this call made the link, for the caller to record with `recordAdopted`.
   */
  async requireLine(
    tx: DbTx,
    application: ApplicationRecord,
    lineId: string,
  ): Promise<{ vendorId: string; groupId: string } | null> {
    if (!application.vendor) throw new ApplicationInternalHasNoVendorError();
    const line = await this.dictionary.findLine(tx, lineId);
    if (!line) throw new ApplicationDictionaryLineNotFoundError();
    if (application.vendor.dictionaryGroupId === line.groupId) return null;
    if (application.vendor.dictionaryGroupId !== null) throw new ApplicationDictionaryLineMismatchError();
    const adopted = await this.vendors.adoptDictionaryGroup(tx, application.vendor.id, line.groupId);
    if (!adopted) throw new ApplicationDictionaryLineMismatchError();

    return adopted.adopted ? { vendorId: application.vendor.id, groupId: line.groupId } : null;
  }

  async recordAdopted(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    vendorId: string,
    groupId: string | null,
  ): Promise<void> {
    await this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        organizationId,
        'VENDOR.DICTIONARY_GROUP_ADOPTED',
        'Vendor',
        vendorId,
        { dictionaryGroupId: null },
        { dictionaryGroupId: groupId },
      ),
    );
  }

  /** Proposes the software to the dictionary and audits the proposal it made; one already open for the name is kept. */
  async raiseProposal(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { organizationId: string; name: string; domains: string[]; sourceApplicationId: string },
  ): Promise<void> {
    const proposalId = await this.proposals.raise(tx, input);
    if (!proposalId) return;
    await this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        input.organizationId,
        'VENDOR_PROPOSAL.RAISED',
        'VendorDictionaryProposal',
        proposalId,
        null,
        { name: input.name, domains: input.domains, sourceApplicationId: input.sourceApplicationId },
      ),
    );
  }
}
