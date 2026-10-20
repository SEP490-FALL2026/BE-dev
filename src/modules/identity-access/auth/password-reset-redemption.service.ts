import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsService } from '../../notifications/notifications.service';
import { EmployeeRecord } from '../../organization/organization.types';
import { ActionLinkService } from '../accounts/action-link.service';
import { AccountSnapshot, ActionTokenSnapshot } from '../identity-access.types';
import { RecoveryTicketService } from '../recovery/recovery-ticket.service';
import { CredentialChangeService } from './credential-change.service';

/**
 * What using a valid reset link does, once the caller has checked it under the AppUser and token locks: the link is
 * spent, the password replaced, and, for a link the recovery procedure sent, its ticket completed.
 */
@Injectable()
export class PasswordResetRedemptionService {
  constructor(
    private readonly links: ActionLinkService,
    private readonly notifications: NotificationsService,
    private readonly changes: CredentialChangeService,
    private readonly recoveryTickets: RecoveryTicketService,
  ) {}

  /**
   * 'invalid' when the recovery link carried a new address that someone took since it was sent; the caller answers as
   * for any link that does not work. It is a result, not a throw: what was written before it commits, as it always did.
   */
  async redeem(
    tx: DbTx,
    input: {
      account: AccountSnapshot;
      employee: EmployeeRecord;
      stored: ActionTokenSnapshot;
      tokenHash: string;
      hash: string;
      now: Date;
    },
  ): Promise<'reset' | 'invalid'> {
    const { account, employee, stored, tokenHash, now } = input;
    await this.links.consumeToken(tx, tokenHash, now);
    // The link is spent: the mail that carries it, if still waiting, must not go out.
    await this.notifications.cancelPendingForTokens(tx, [tokenHash]);
    await this.changes.replace(tx, {
      account,
      hash: input.hash,
      event: 'PASSWORD_RESET',
      fullName: employee.fullName,
      // The holder of the link is the owner of the mailbox, which is as close to the account owner as this gets.
      actor: { actorKind: 'USER', actorAppUserId: account.id, actorRoles: [], correlationId: account.id },
      now,
    });
    if (stored.recoveryTicketId) {
      // A link the recovery procedure sent (US-01-09): opening it completes the ticket and, if the ticket moves the
      // login email, moves it now and not before (AC-10). The notice above already went to the old address.
      const moved = await this.recoveryTickets.completeForLink(
        tx,
        account.id,
        account.organizationId,
        stored,
        employee.fullName,
        now,
      );
      if (moved === 'taken') return 'invalid';
    }

    return 'reset';
  }
}
