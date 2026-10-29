import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { ActionTokenSnapshot } from '../public/identity-access.types';
import { RecoveryRepo } from './recovery.repo';

/**
 * What the forgotten-password flow needs from the recovery of the Super Admin role (US-01-09, US-01-10 AC-10): whether
 * an operator's credential reset is waiting for the account, and the completion of a ticket when its link is used. The
 * tickets stay private to recovery (A4-20); everything runs in the caller's transaction, under its AppUser lock.
 */
@Injectable()
export class RecoveryTicketService {
  constructor(
    private readonly tickets: RecoveryRepo,
    private readonly accounts: AccountDirectoryService,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Whether the account is waiting for an operator's credential reset. The caller holds the AppUser row lock, which the
   * recovery also takes before it writes the ticket, so a ticket committed meanwhile is seen here.
   */
  hasWaitingCredentialReset(tx: DbTx, organizationId: string, appUserId: string): Promise<boolean> {
    return this.tickets.hasWaitingCredentialReset(tx, organizationId, appUserId);
  }

  /**
   * Completes the ticket a recovery link belonged to, and moves the login email if the ticket carried a new one. The
   * address is moved only now, when the link is used (AC-10); 'taken' when someone took it since the link was sent.
   */
  async completeForLink(
    tx: DbTx,
    appUserId: string,
    organizationId: string,
    token: ActionTokenSnapshot,
    fullName: string,
    now: Date,
  ): Promise<'done' | 'taken'> {
    const ticket = token.recoveryTicketId ? await this.tickets.lockById(tx, token.recoveryTicketId) : null;
    let changedTo: string | null = null;
    if (token.newLoginEmail && token.newNormalizedLoginEmail) {
      const other = await this.accounts.findAccountByLoginEmail(organizationId, token.newNormalizedLoginEmail);
      // Someone took the address since the link was sent: the link no longer works as it was approved.
      if (other && other.id !== appUserId) return 'taken';
      await this.accounts.changeLoginEmail(tx, appUserId, {
        loginEmail: token.newLoginEmail,
        normalizedLoginEmail: token.newNormalizedLoginEmail,
        now,
      });
      changedTo = token.newLoginEmail;
    }
    if (ticket) await this.tickets.setStatus(tx, ticket.id, 'COMPLETED', now);
    await this.audit.record(tx, {
      organizationId,
      actorKind: 'USER',
      actorAppUserId: appUserId,
      actorRoles: [],
      action: 'SUPER_ADMIN.RECOVERY_COMPLETED',
      resourceType: 'AppUser',
      resourceId: appUserId,
      before: null,
      after: { ticket: ticket?.ticketRef ?? null, loginEmailChanged: changedTo !== null, fullName },
      correlationId: ticket?.id ?? appUserId,
    });

    return 'done';
  }
}
