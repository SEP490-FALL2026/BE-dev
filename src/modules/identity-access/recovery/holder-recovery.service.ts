import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { employeeHasNotLeft } from '../policies/account-policy';
import { HolderCredentialReset } from './holder-credential-reset.service';
import { RecoveryLinks } from './recovery-links.service';
import { assertContext, assertSeparation, checkSameTicket, operatorEvent, parseNewEmail } from './recovery-procedure';
import { RecoveryTargets } from './recovery-targets.service';
import { RecoveryRefusedError } from './recovery.errors';
import { RecoveryRepo } from './recovery.repo';
import { RecoveryContext, RecoveryResult } from './recovery.types';

/**
 * Recovering the Super Admin role while its holder still works (`US-01-09` AC-9 → AC-11, AC-14), run by an operator
 * outside the application: reset the holder's credentials, or open their locked account. Nothing here is reachable over
 * HTTP (AC-13). The ticket reference is the idempotency key: running it again never acts twice (AC-11). The operator
 * never sees a password or a link. Locks follow the protocol (employee, then account, then ticket); what is decided on
 * is read again under them.
 */
@Injectable()
export class HolderRecoveryService {
  constructor(
    private readonly targets: RecoveryTargets,
    private readonly tickets: RecoveryRepo,
    private readonly credentialReset: HolderCredentialReset,
    private readonly links: RecoveryLinks,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  // --- AC-9, AC-10, AC-11: the holder lost the password ---------------------------------

  /**
   * The holder is still working and can sign in in principle, but lost the password and the mailbox, or only the
   * password. Their old credential is made unusable, every session and link ends, and one link goes to the address
   * the ticket names: the holder sets a new password with it, and the address changes only once they have used it.
   */
  async resetCredentials(
    context: RecoveryContext,
    input: { accountEmail: string; newLoginEmail?: string },
  ): Promise<RecoveryResult> {
    assertContext(context);
    const organization = await this.targets.requireOrganization();
    const located = await this.targets.locateByEmail(organization.id, input.accountEmail);
    const newEmail = input.newLoginEmail === undefined ? null : parseNewEmail(input.newLoginEmail);
    assertSeparation(context, [input.accountEmail, newEmail?.raw ?? '']);
    const unknownHash = await this.credentialReset.prepareUnknownCredential();

    return this.runner.run(async (tx) => {
      const { account, employee } = await this.targets.lockHolder(tx, located);
      if (
        account.status !== 'ACTIVE' ||
        account.activationState !== 'ACTIVATED' ||
        !employeeHasNotLeft(employee) ||
        !employee
      ) {
        throw new RecoveryRefusedError('TARGET_NOT_USABLE');
      }
      if (newEmail && (await this.targets.isLoginEmailTakenByOther(organization.id, newEmail.normalized, account.id))) {
        throw new RecoveryRefusedError('NEW_EMAIL_TAKEN');
      }

      const { ticket, created } = await this.tickets.openAndLock(tx, {
        organizationId: organization.id,
        ticketRef: context.ticketRef,
        mode: 'RESET_CREDENTIALS',
        targetAppUserId: account.id,
        successorEmployeeId: null,
        recipientEmail: newEmail?.raw ?? account.loginEmail,
        newLoginEmail: newEmail?.raw ?? null,
        approverRef: context.approverRef,
        operatorRef: context.operatorRef,
        identityCheckRef: context.identityCheckRef ?? null,
        environment: context.environment,
      });
      if (!created) {
        const verdict = checkSameTicket(ticket, 'RESET_CREDENTIALS', { targetAppUserId: account.id });
        if (verdict) return verdict;
        if ((ticket.newLoginEmail ?? null) !== (newEmail?.raw ?? null)) {
          throw new RecoveryRefusedError('TICKET_PARAMETERS_DIFFER');
        }
      }

      const now = new Date();
      // A newer ticket for the same account replaces an older one that is still waiting (AC-11).
      for (const older of await this.tickets.pendingForTarget(tx, account.id, ticket.id)) {
        await this.tickets.setStatus(tx, older.id, 'SUPERSEDED', now);
      }
      if (!created && (await this.links.hasWorkingLink(tx, ticket, account.id, now))) {
        return { ticketRef: context.ticketRef, mode: 'RESET_CREDENTIALS', outcome: 'LINK_ALREADY_SENT' };
      }

      // Every link and session of the account ends, and the old credential stops working.
      await this.credentialReset.reset(tx, account.id, unknownHash, now);
      await this.links.sendResetLink(
        tx,
        {
          organizationId: organization.id,
          appUserId: account.id,
          ticketId: ticket.id,
          recipient: newEmail?.raw ?? account.loginEmail,
          fullName: employee.fullName,
          newEmail,
        },
        now,
      );
      await this.tickets.setStatus(tx, ticket.id, 'PENDING', now);
      await this.audit.record(
        tx,
        operatorEvent(context, organization.id, ticket, 'SUPER_ADMIN.RECOVERY_LINK_ISSUED', account.id, null, {
          sentTo: newEmail ? 'NEW_EMAIL' : 'LOGIN_EMAIL',
          loginEmailChangesOnUse: newEmail !== null,
        }),
      );

      return {
        ticketRef: context.ticketRef,
        mode: 'RESET_CREDENTIALS',
        outcome: 'LINK_SENT',
        sentTo: newEmail ? 'NEW_EMAIL' : 'LOGIN_EMAIL',
      };
    });
  }

  // --- AC-14: the holder's account is locked -------------------------------------------

  /** Opens the locked account of the holder, who is still working. No grant changes: there is still one Super Admin. */
  async unlock(context: RecoveryContext, input: { accountEmail: string }): Promise<RecoveryResult> {
    assertContext(context);
    const organization = await this.targets.requireOrganization();
    const located = await this.targets.locateByEmail(organization.id, input.accountEmail);
    assertSeparation(context, [input.accountEmail]);

    return this.runner.run(async (tx) => {
      const { account, employee } = await this.targets.lockHolder(tx, located);
      // A person who has left is not brought back (QĐ-41b); that is a role transfer, not an unlock.
      if (!employee || !employeeHasNotLeft(employee)) throw new RecoveryRefusedError('TARGET_EMPLOYEE_LEFT');
      if (account.activationState !== 'ACTIVATED') throw new RecoveryRefusedError('TARGET_NOT_USABLE');

      const { ticket, created } = await this.tickets.openAndLock(tx, {
        organizationId: organization.id,
        ticketRef: context.ticketRef,
        mode: 'UNLOCK',
        targetAppUserId: account.id,
        successorEmployeeId: null,
        recipientEmail: null,
        newLoginEmail: null,
        approverRef: context.approverRef,
        operatorRef: context.operatorRef,
        identityCheckRef: context.identityCheckRef ?? null,
        environment: context.environment,
      });
      if (!created) {
        const verdict = checkSameTicket(ticket, 'UNLOCK', { targetAppUserId: account.id });
        if (verdict) return verdict;
      }

      const now = new Date();
      const wasLocked = account.status === 'LOCKED';
      if (wasLocked) await this.targets.reopen(tx, account.id);
      await this.tickets.setStatus(tx, ticket.id, 'COMPLETED', now);
      await this.audit.record(
        tx,
        operatorEvent(
          context,
          organization.id,
          ticket,
          'SUPER_ADMIN.RECOVERY_UNLOCKED',
          account.id,
          { status: account.status },
          { status: 'ACTIVE', changed: wasLocked },
        ),
      );

      return {
        ticketRef: context.ticketRef,
        mode: 'UNLOCK',
        outcome: wasLocked ? 'UNLOCKED' : 'NOTHING_TO_UNLOCK',
      };
    });
  }
}
