import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import { TransactionRunner, toTransientError } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { RecoveryTicketService } from '../recovery/recovery-ticket.service';
import { PasswordResetMailService } from './password-reset-mail.service';
import { canReceiveResetMail } from './password-reset.policy';

/**
 * Forgot a password (slice 1c): a reset link for an account that may use one, and the same answer for every email. It
 * takes the AppUser row lock first and re-reads what it decides on (lock protocol rules 1 and 2).
 */
@Injectable()
export class PasswordResetRequestService {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly organization: OrganizationService,
    private readonly recoveryTickets: RecoveryTicketService,
    private readonly mail: PasswordResetMailService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Issues a reset link when, and only when, the email belongs to an account that may use one. It
   * returns the same (nothing) for every other case, so the caller learns nothing about which emails
   * exist (AC-3). Only a database failure surfaces, as TransientDatabaseError.
   */
  async requestReset(email: string): Promise<void> {
    try {
      await this.performRequest(email);
    } catch (error) {
      throw toTransientError(error) ?? error;
    }
  }

  private async performRequest(email: string): Promise<void> {
    const normalized = this.tryNormalize(email);
    if (normalized === null) return;
    const organization = await this.organization.getOrganization();
    if (!organization) return;
    // Unlocked: decides whether there is anyone to issue a link to. Everything that matters is re-read under the lock.
    const found = await this.accounts.findAccountByLoginEmail(organization.id, normalized);
    if (!found) {
      // The same two reads an existing address costs, so "nobody here" is not faster than "here but refused".
      await this.organization.getEmployee(randomUUID());
      return;
    }
    // An account that cannot use a link (invited, locked, employee left) leaves here without opening a transaction,
    // so only an address that gets a link takes longer than the rest (spec Q-6).
    if (!canReceiveResetMail(found, await this.organization.getEmployee(found.employeeId))) return;

    await this.runner.run(async (tx) => {
      if (!(await this.accounts.lockAppUser(tx, found.id, 'UPDATE'))) return;
      const account = await this.accounts.readAccount(tx, found.id);
      const employee = account ? await this.organization.getEmployee(account.employeeId, tx) : null;
      if (!account || !canReceiveResetMail(account, employee) || !employee) return;
      // An operator's credential reset is waiting (US-01-10 AC-10): its link stays the only one, and nothing is sent.
      if (await this.recoveryTickets.hasWaitingCredentialReset(tx, account.organizationId, account.id)) return;

      const now = new Date();
      if (!(await this.mail.send(tx, account, employee, now))) return;
      // Anyone may ask for a link for any email, so the requester is the system, not the account owner.
      await this.audit.record(tx, {
        organizationId: account.organizationId,
        actorKind: 'SYSTEM',
        action: 'APP_USER.PASSWORD_RESET_REQUESTED',
        resourceType: 'AppUser',
        resourceId: account.id,
        before: null,
        after: { event: 'PASSWORD_RESET_REQUESTED', at: now.toISOString() },
        correlationId: account.id,
      });
    });
  }

  private tryNormalize(email: string): string | null {
    try {
      return normalizeEmail(email);
    } catch (error) {
      if (error instanceof InvalidEmailError) return null;
      throw error;
    }
  }
}
