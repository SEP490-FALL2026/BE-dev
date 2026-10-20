import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EmployeeRecord } from '../../organization/organization.types';
import { accountAuditEvent } from './account-administration.policy';
import { ActionLinkRevocation } from './action-link-revocation.service';
import { ActionLinkService } from './action-link.service';

/**
 * The invitation an administrator sends (slice 1b): a new link, its mail and the audit event, in the caller's
 * transaction. Sending again first ends every link the account could still use, an expired one that still holds the
 * place included (spec base).
 */
@Injectable()
export class InvitationMailService {
  constructor(
    private readonly links: ActionLinkService,
    private readonly revocation: ActionLinkRevocation,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async send(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    appUserId: string,
    recipient: string,
    employee: EmployeeRecord,
    now: Date,
  ): Promise<void> {
    const issued = await this.links.issue(
      tx,
      { appUserId, purpose: 'INVITE', createdBy: actor.appUserId },
      'INVITATION',
      now,
    );
    await this.notifications.enqueueEmail(tx, {
      organizationId,
      recipient,
      template: 'ACCOUNT_INVITATION',
      locale: 'vi',
      actionTokenHash: issued.hash,
      payload: { token: issued.token, expiresAt: issued.expiresAt.toISOString(), fullName: employee.fullName },
    });
    await this.audit.record(
      tx,
      accountAuditEvent(actor, organizationId, 'APP_USER.INVITATION_SENT', appUserId, null, {
        expiresAt: issued.expiresAt.toISOString(),
      }),
    );
  }

  /** Ends every usable link of the account, then sends a new invitation. */
  async replace(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    appUserId: string,
    recipient: string,
    employee: EmployeeRecord,
    now: Date,
  ): Promise<void> {
    await this.revocation.revokeUsable(tx, appUserId, 'SUPERSEDED', now);
    await this.send(tx, actor, organizationId, appUserId, recipient, employee, now);
  }
}
