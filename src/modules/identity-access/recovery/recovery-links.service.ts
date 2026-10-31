import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { ActionLinkService } from '../accounts/action-link.service';
import { TicketRecord } from './recovery.repo';

/**
 * A mail with nobody to go to is a programming error, never a silent skip or a send to somebody else: the caller
 * names the login email of the account, and an empty one stops the transaction before a link or a mail is written.
 */
function requireRecipient(recipient: string): string {
  if (recipient.trim() === '')
    throw new Error('A recovery mail needs the login email of the account as its recipient.');

  return recipient;
}

/**
 * The links a recovery sends and their mails: a reset link to the holder's mailbox (AC-9, AC-10) or an invitation to the
 * successor (AC-12). Each belongs to its ticket, and lives as long as an invitation whatever its purpose. The operator
 * never sees one: it goes to the mailbox only.
 */
@Injectable()
export class RecoveryLinks {
  constructor(
    private readonly links: ActionLinkService,
    private readonly notifications: NotificationsApi,
  ) {}

  /** Whether the ticket has a link that can still be used and whose mail has not failed: then nothing is sent again. */
  async hasWorkingLink(
    tx: DbTx,
    ticket: TicketRecord,
    appUserId: string,
    now: Date,
    purpose: 'INVITE' | 'RESET_PASSWORD' = 'RESET_PASSWORD',
  ): Promise<boolean> {
    const links = (await this.links.findUsableTokens(tx, appUserId, purpose)).filter(
      (token) => token.recoveryTicketId === ticket.id && token.expiresAt > now,
    );
    if (links.length === 0) return false;

    const states = await this.notifications.deliveryStates(links.map((link) => link.tokenHash));

    return links.some((link) => {
      const state = states.get(link.tokenHash);

      return state !== undefined && state.status !== 'FAILED' && state.status !== 'CANCELLED';
    });
  }

  /** A reset link for the holder; when the ticket moves the login email, the link carries the new address. */
  async sendResetLink(
    tx: DbTx,
    input: {
      organizationId: string;
      appUserId: string;
      ticketId: string;
      recipient: string;
      fullName: string;
      newEmail: { raw: string; normalized: string } | null;
    },
    now: Date,
  ): Promise<void> {
    const recipient = requireRecipient(input.recipient);
    const link = await this.links.issue(
      tx,
      {
        appUserId: input.appUserId,
        purpose: 'RESET_PASSWORD',
        createdBy: null,
        recoveryTicketId: input.ticketId,
        ...(input.newEmail
          ? { newLoginEmail: input.newEmail.raw, newNormalizedLoginEmail: input.newEmail.normalized }
          : {}),
      },
      'INVITATION',
      now,
    );
    await this.notifications.enqueueEmail(tx, {
      organizationId: input.organizationId,
      recipient,
      template: 'PASSWORD_RESET',
      locale: 'vi',
      actionTokenHash: link.hash,
      payload: { token: link.token, expiresAt: link.expiresAt.toISOString(), fullName: input.fullName },
    });
  }

  /** An invitation for the successor's account, which has no role (AC-12). */
  async sendInvitation(
    tx: DbTx,
    input: { organizationId: string; appUserId: string; ticketId: string; recipient: string; fullName: string },
    now: Date,
  ): Promise<void> {
    const recipient = requireRecipient(input.recipient);
    const link = await this.links.issue(
      tx,
      { appUserId: input.appUserId, purpose: 'INVITE', createdBy: null, recoveryTicketId: input.ticketId },
      'INVITATION',
      now,
    );
    await this.notifications.enqueueEmail(tx, {
      organizationId: input.organizationId,
      recipient,
      template: 'ACCOUNT_INVITATION',
      locale: 'vi',
      actionTokenHash: link.hash,
      payload: { token: link.token, expiresAt: link.expiresAt.toISOString(), fullName: input.fullName },
    });
  }
}
