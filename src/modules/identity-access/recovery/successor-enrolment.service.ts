import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { EmployeeRecord } from '../../organization/public/organization.types';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { ActionLinkRevocation } from '../accounts/action-link-revocation.service';
import { SuccessorEligibility } from '../accounts/successor-eligibility.service';
import { RecoveryLinks } from './recovery-links.service';
import { operatorEvent, tryNormalize } from './recovery-procedure.policy';
import { RecoveryRefusedError } from '../public/recovery.errors';
import { RecoveryRepo, TicketRecord } from './recovery.repo';
import { RecoveryContext, RecoveryResult } from '../public/recovery.types';

/**
 * The successor's side of a role transfer (AC-12): first an account with no role and an invitation, then the wait until
 * they have activated it. Activating never grants the role; only the next run of the same ticket moves it. Every invitation goes to
 * the login email of the successor's account, never to the work email on the record as it is now (`P28-05`, `F18`): the work email
 * can change while an invitation is on its way, the account's login email does not, so a link is never sent to an address the
 * account does not have.
 */
@Injectable()
export class SuccessorEnrolment {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly eligibility: SuccessorEligibility,
    private readonly links: RecoveryLinks,
    private readonly revocation: ActionLinkRevocation,
    private readonly tickets: RecoveryRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Stage 1: the successor has no account yet. It is created with no role, and invited. */
  async createAccount(
    tx: DbTx,
    input: {
      context: RecoveryContext;
      organizationId: string;
      ticket: TicketRecord;
      successor: EmployeeRecord;
      now: Date;
    },
  ): Promise<RecoveryResult> {
    const { context, organizationId, ticket, successor, now } = input;
    if (!successor.workEmail) throw new RecoveryRefusedError('SUCCESSOR_HAS_NO_EMAIL');
    const normalized = tryNormalize(successor.workEmail);
    if (normalized === null) throw new RecoveryRefusedError('SUCCESSOR_HAS_NO_EMAIL');
    if (await this.accounts.findAccountByLoginEmail(organizationId, normalized)) {
      throw new RecoveryRefusedError('SUCCESSOR_EMAIL_TAKEN');
    }
    // The account is created with the work email as its login email, and the invitation goes to the login email it was given.
    const loginEmail = successor.workEmail;
    const created = await this.accounts.createAppUser(tx, {
      organizationId,
      employeeId: successor.id,
      loginEmail,
      normalizedLoginEmail: normalized,
      status: 'ACTIVE',
      activationState: 'INVITED',
      emailVerificationSource: null,
      emailVerifiedAt: null,
    });
    await this.links.sendInvitation(
      tx,
      {
        organizationId,
        appUserId: created.id,
        ticketId: ticket.id,
        recipient: loginEmail,
        fullName: successor.fullName,
      },
      now,
    );
    await this.tickets.setStatus(tx, ticket.id, 'AWAITING_ACTIVATION', now);
    await this.audit.record(
      tx,
      operatorEvent(context, organizationId, ticket, 'SUPER_ADMIN.RECOVERY_ACCOUNT_CREATED', created.id, null, {
        roles: [],
        activationState: 'INVITED',
      }),
    );

    return {
      ticketRef: context.ticketRef,
      mode: 'TRANSFER_ROLE',
      outcome: 'ACCOUNT_CREATED',
      sentTo: 'LOGIN_EMAIL',
    };
  }

  /**
   * Stage 2, or the wait for it: the successor has an account. While it waits for activation, an invitation still on
   * its way is left alone and a dead one is replaced; any other reason the successor cannot take the role refuses the
   * run. Null when the successor can take the role now.
   */
  async awaitActivation(
    tx: DbTx,
    input: {
      context: RecoveryContext;
      organizationId: string;
      ticket: TicketRecord;
      successorAccountId: string;
      successor: EmployeeRecord;
      now: Date;
    },
  ): Promise<RecoveryResult | null> {
    const { context, organizationId, ticket, successorAccountId, successor, now } = input;
    const problem = await this.eligibility.check(tx, successorAccountId);
    if (problem === 'NOT_ACTIVATED' && ticket.status === 'AWAITING_ACTIVATION') {
      if (await this.links.hasWorkingLink(tx, ticket, successorAccountId, now, 'INVITE')) {
        return { ticketRef: context.ticketRef, mode: 'TRANSFER_ROLE', outcome: 'INVITATION_ALREADY_SENT' };
      }
      await this.revocation.revokeUsable(tx, successorAccountId, 'SUPERSEDED', now);
      // The login email of the account, whatever the work email on the record says now (`P28-05`): never the other, never empty.
      const account = await this.accounts.findAccountById(successorAccountId);
      await this.links.sendInvitation(
        tx,
        {
          organizationId,
          appUserId: successorAccountId,
          ticketId: ticket.id,
          recipient: account?.loginEmail ?? '',
          fullName: successor.fullName,
        },
        now,
      );

      return {
        ticketRef: context.ticketRef,
        mode: 'TRANSFER_ROLE',
        outcome: 'INVITATION_REISSUED',
        sentTo: 'LOGIN_EMAIL',
      };
    }
    if (problem) throw new RecoveryRefusedError(problem);

    return null;
  }
}
