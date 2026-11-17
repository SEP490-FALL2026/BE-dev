import { Injectable, OnModuleInit } from '@nestjs/common';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  PendingPolicyAcknowledgements,
  type PendingPolicyAcknowledgement,
  type PendingPolicyAcknowledgementSource,
  type PolicyReader,
} from '../../identity-access/public/identity-access.extension-points';
import { AcknowledgementFactsService } from './acknowledgement-facts.service';
import { policyRolesOf } from './acknowledgement.policy';

/**
 * Tells `GET /me` which policies in force the caller has not acknowledged (`QĐ-111ar`, `QĐ-111bi`). It adds itself to the sources of
 * identity-access when the module starts, so identity-access never imports the library.
 */
@Injectable()
export class PendingPolicyAcknowledgementListener implements PendingPolicyAcknowledgementSource, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [PendingPolicyAcknowledgements] as const;

  constructor(
    private readonly facts: AcknowledgementFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly sources: PendingPolicyAcknowledgements,
  ) {}

  onModuleInit(): void {
    this.sources.add('policies.pending-acknowledgements', this);
  }

  async pendingFor(reader: PolicyReader): Promise<PendingPolicyAcknowledgement[]> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return [];

    return this.facts.pendingOf(organization.id, {
      appUserId: reader.appUserId,
      roles: policyRolesOf(reader.roles),
    });
  }
}
