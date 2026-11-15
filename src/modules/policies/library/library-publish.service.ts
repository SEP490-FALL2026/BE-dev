import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { policiesEvent } from '../policies-audit-event.mapper';
import { PolicyDraftNotFoundError, PolicyNotFoundError } from './library.errors';
import { publishValuesOf, type PublishInput } from './library.policy';
import { LibraryRepo } from './library.repo';
import type { PublishedVersionRecord } from './library.types';

export interface PublishResult {
  version: PublishedVersionRecord;
  /** How many accounts were told, which is how many hold a role the version applies to. */
  notified: number;
}

/**
 * Publishes the draft of a policy (`QĐ-111bi`): in force at once, with the ground of the issue, the roles it applies to and whether
 * readers are asked to acknowledge it again; every account of those roles is told in the same transaction, so the notice exists exactly
 * when the version does. The published version is never changed again (a trigger refuses it).
 */
@Injectable()
export class LibraryPublishService {
  constructor(
    private readonly repo: LibraryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly notifications: NotificationsApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws PolicyNotFoundError and PolicyDraftNotFoundError. */
  async publish(
    actor: AuthenticatedPrincipal,
    code: string,
    input: PublishInput,
    now: Date = new Date(),
  ): Promise<PublishResult> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The policy library was used before installation');

    return this.runner.run(async (tx) => {
      const policy = await this.repo.lockPolicy(tx, organization.id, code);
      if (!policy) throw new PolicyNotFoundError();
      const draft = await this.repo.draft(policy.id, tx);
      if (!draft) throw new PolicyDraftNotFoundError();
      const values = publishValuesOf(await this.repo.lastNumber(tx, policy.id), input);
      const version = await this.repo.publishDraft(tx, draft.id, {
        ...values,
        publishedByAppUserId: actor.appUserId,
        publishedAt: now,
      });
      const recipients = await this.identity.findUsableEmployeeIdsHoldingRoles(version.applicableRoles, tx);
      for (const employeeId of recipients) {
        await this.notifications.notifyInApp(tx, {
          organizationId: organization.id,
          recipientEmployeeId: employeeId,
          code: 'POLICY_PUBLISHED',
          subject: { type: 'POLICY_VERSION', id: version.id },
          params: {
            policyCode: code,
            versionNumber: version.versionNumber,
            requiresReacknowledgement: version.requiresReacknowledgement,
          },
          eventKey: `policy-published:${version.id}`,
        });
      }
      await this.audit.record(
        tx,
        policiesEvent(actor, organization.id, 'POLICY_VERSION.PUBLISHED', 'PolicyVersion', version.id, null, {
          policyCode: code,
          versionNumber: version.versionNumber,
          changeNote: version.changeNote,
          applicableRoles: version.applicableRoles,
          requiresReacknowledgement: version.requiresReacknowledgement,
          notified: recipients.length,
        }),
      );

      return { version, notified: recipients.length };
    });
  }
}
