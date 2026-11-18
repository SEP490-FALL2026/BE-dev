import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PolicyNotFoundError, PolicyNotPublishedError } from '../library/library.errors';
import { LibraryRepo } from '../library/library.repo';
import { policiesEvent } from '../policies-audit-event.mapper';
import { AcknowledgementFactsService } from './acknowledgement-facts.service';
import { policyRolesOf } from './acknowledgement.policy';
import { PolicyAcknowledgementNotRequiredError } from './acknowledgement.errors';
import { AcknowledgementRepo } from './acknowledgement.repo';

export interface AcknowledgementResult {
  policyCode: string;
  versionNumber: number;
  /** When it was written now; null when this account had acknowledged the policy already, so nothing was written. */
  acknowledgedAt: Date | null;
  /** True when nothing was written because the account had acknowledged already. */
  alreadyAcknowledged: boolean;
}

/**
 * The reader acknowledges the policy in force (`QĐ-111ar`): only a person of a role the version applies to, once per version, and saying it
 * twice changes nothing. A version published without asking again leaves an earlier acknowledgement standing, so there is nothing to add.
 */
@Injectable()
export class AcknowledgementService {
  constructor(
    private readonly library: LibraryRepo,
    private readonly facts: AcknowledgementFactsService,
    private readonly acknowledgements: AcknowledgementRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws PolicyNotFoundError, PolicyNotPublishedError and PolicyAcknowledgementNotRequiredError. */
  async acknowledge(
    actor: AuthenticatedPrincipal,
    code: string,
    now: Date = new Date(),
  ): Promise<AcknowledgementResult> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A policy was acknowledged before installation');

    return this.runner.run(async (tx) => {
      const policy = await this.library.findPolicy(organization.id, code, tx);
      if (!policy) throw new PolicyNotFoundError();
      const current = await this.library.current(policy.id, tx);
      if (!current) throw new PolicyNotPublishedError();
      const reader = { appUserId: actor.appUserId, roles: policyRolesOf(actor.directRoles) };
      const state = (await this.facts.statesOf(reader, [{ id: policy.id, code, current, hasDraft: false }], tx)).get(
        policy.id,
      );
      if (state === 'NOT_REQUIRED') throw new PolicyAcknowledgementNotRequiredError();
      if (state === 'DONE') {
        return {
          policyCode: code,
          versionNumber: current.versionNumber,
          acknowledgedAt: null,
          alreadyAcknowledged: true,
        };
      }
      const written = await this.acknowledgements.insertOnce(tx, {
        organizationId: organization.id,
        policyVersionId: current.id,
        employeeId: actor.employeeId,
        appUserId: actor.appUserId,
        acknowledgedAt: now,
      });
      if (written) {
        await this.audit.record(
          tx,
          policiesEvent(actor, organization.id, 'POLICY_ACKNOWLEDGEMENT.RECORDED', 'PolicyVersion', current.id, null, {
            policyCode: code,
            versionNumber: current.versionNumber,
          }),
        );
      }

      return {
        policyCode: code,
        versionNumber: current.versionNumber,
        acknowledgedAt: written ? now : null,
        alreadyAcknowledged: !written,
      };
    });
  }
}
