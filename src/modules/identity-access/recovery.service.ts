import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { InvalidEmailError, normalizeEmail } from '../../core/email';
import { EnvironmentVariables } from '../../infrastructure/config/env-schema';
import { DbTx, TransactionRunner, readSqlState } from '../../infrastructure/database/transaction-runner';
import { AuditService } from '../audit/audit.service';
import type { AuditEventInput, AuditValue } from '../audit/audit.types';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationService } from '../organization/organization.service';
import { AccountRepo } from './accounts/account.repo';
import { SuccessorEligibility } from './accounts/successor-eligibility';
import { newActionToken } from './auth/action-token';
import { PASSWORD_HASH_POLICY_VERSION, PasswordHasher } from './auth/password-hasher.service';
import { employeeHasNotLeft } from './policies/account-policy';
import { RecoveryRefusedError } from './recovery.errors';
import { RecoveryModeName, RecoveryRepo, TicketRecord } from './recovery.repo';

/** A ticket reference is whatever the approval system calls the ticket; it is the key that makes a re-run a no-op. */
const TICKET_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,99}$/;
const FREE_TEXT_REFERENCE = /^[\x20-\x7e¡-￿]{2,100}$/;

export type RecoveryEnvironment = 'LOCAL_TEST' | 'SHARED';

/** What every recovery names, whatever it does (US-01-09 AC-9, AC-13). */
export interface RecoveryContext {
  /** The approved ticket (`R1`). */
  ticketRef: string;
  /** Who approved it, and who runs it: two different people in a shared environment. */
  approverRef: string;
  operatorRef: string;
  /** The reference of the identity check the approver did; recorded, never a secret. */
  identityCheckRef?: string;
  environment: RecoveryEnvironment;
}

export type RecoveryOutcome =
  | 'LINK_SENT'
  | 'LINK_ALREADY_SENT'
  | 'ALREADY_COMPLETED'
  | 'UNLOCKED'
  | 'NOTHING_TO_UNLOCK'
  | 'ACCOUNT_CREATED'
  | 'INVITATION_REISSUED'
  | 'INVITATION_ALREADY_SENT'
  | 'ROLE_TRANSFERRED';

export interface RecoveryResult {
  ticketRef: string;
  mode: RecoveryModeName;
  outcome: RecoveryOutcome;
  /** For a link: where it went. Never the link. */
  sentTo?: 'LOGIN_EMAIL' | 'NEW_EMAIL' | 'WORK_EMAIL';
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

function tryNormalize(email: string): string | null {
  try {
    return normalizeEmail(email);
  } catch (error) {
    if (error instanceof InvalidEmailError) return null;
    throw error;
  }
}

/**
 * Recovering the Super Admin role outside the application (`US-01-09` AC-9 → AC-14). An operator runs an approved
 * ticket: reset the holder's credentials, open a locked holder, or hand the role to someone when the holder cannot
 * act any more. Nothing here is reachable over HTTP (AC-13). The ticket reference is the idempotency key: running it
 * again never acts twice (AC-11). The operator never sees a password or a link: the link goes to the mailbox.
 * Every method takes the locks of the lock protocol in order (employee, then accounts by id, then the ticket) and reads
 * again what it decides on.
 */
@Injectable()
export class RecoveryService {
  constructor(
    private readonly accounts: AccountRepo,
    private readonly hasher: PasswordHasher,
    private readonly notifications: NotificationsService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly eligibility: SuccessorEligibility,
    private readonly repo: RecoveryRepo,
    private readonly runner: TransactionRunner,
    private readonly config: ConfigService<EnvironmentVariables, true>,
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
    this.assertContext(context);
    const organization = await this.requireOrganization();
    const located = await this.locateByEmail(organization.id, input.accountEmail);
    const newEmail = input.newLoginEmail === undefined ? null : this.parseNewEmail(input.newLoginEmail);
    this.assertSeparation(context, [input.accountEmail, newEmail?.raw ?? '']);
    // Slow, and made before any lock (lock protocol rule 3): a credential nobody knows, which replaces the old one.
    const unknownHash = await this.hasher.hash(randomBytes(32).toString('base64url'));

    return this.runner.run(async (tx) => {
      await this.organization.lockEmployeeForShare(tx, located.employeeId);
      await this.accounts.lockAppUser(tx, located.id, 'UPDATE');
      const account = await this.accounts.readAccount(tx, located.id);
      if (!account) throw new RecoveryRefusedError('TARGET_NOT_FOUND');
      const roles = await this.accounts.effectiveRoles(account.id, tx);
      if (!roles.includes('SUPER_ADMIN')) throw new RecoveryRefusedError('TARGET_NOT_HOLDER');
      const employee = await this.organization.getEmployee(account.employeeId, tx);
      if (
        account.status !== 'ACTIVE' ||
        account.activationState !== 'ACTIVATED' ||
        !employeeHasNotLeft(employee) ||
        !employee
      ) {
        throw new RecoveryRefusedError('TARGET_NOT_USABLE');
      }
      if (newEmail) {
        const other = await this.accounts.findAccountByLoginEmail(organization.id, newEmail.normalized);
        if (other && other.id !== account.id) throw new RecoveryRefusedError('NEW_EMAIL_TAKEN');
      }

      const { ticket, created } = await this.repo.openAndLock(tx, {
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
        const verdict = this.checkSameTicket(ticket, 'RESET_CREDENTIALS', { targetAppUserId: account.id });
        if (verdict) return verdict;
        if ((ticket.newLoginEmail ?? null) !== (newEmail?.raw ?? null)) {
          throw new RecoveryRefusedError('TICKET_PARAMETERS_DIFFER');
        }
      }

      const now = new Date();
      // A newer ticket for the same account replaces an older one that is still waiting (AC-11).
      for (const older of await this.repo.pendingForTarget(tx, account.id, ticket.id)) {
        await this.repo.setStatus(tx, older.id, 'SUPERSEDED', now);
      }
      if (!created && (await this.hasWorkingLink(tx, ticket, account.id, now))) {
        return { ticketRef: context.ticketRef, mode: 'RESET_CREDENTIALS', outcome: 'LINK_ALREADY_SENT' };
      }

      // Every link and session of the account ends, and the old credential stops working.
      const usable = (await this.accounts.findUsableTokens(tx, account.id)).map((token) => token.tokenHash);
      await this.accounts.revokeTokens(tx, usable, 'SUPERSEDED', now);
      await this.notifications.cancelPendingForTokens(tx, usable);
      await this.accounts.replaceCredential(tx, account.id, unknownHash, PASSWORD_HASH_POLICY_VERSION, now);
      await this.repo.revokeSessions(tx, account.id, now);

      const link = newActionToken(now, this.config.get('AUTH_INVITATION_TTL_SECONDS', { infer: true }) * 1000);
      await this.accounts.insertActionToken(tx, {
        tokenHash: link.hash,
        appUserId: account.id,
        purpose: 'RESET_PASSWORD',
        expiresAt: link.expiresAt,
        createdBy: null,
        recoveryTicketId: ticket.id,
        ...(newEmail ? { newLoginEmail: newEmail.raw, newNormalizedLoginEmail: newEmail.normalized } : {}),
      });
      await this.notifications.enqueueEmail(tx, {
        organizationId: organization.id,
        recipient: newEmail?.raw ?? account.loginEmail,
        template: 'PASSWORD_RESET',
        locale: 'vi',
        actionTokenHash: link.hash,
        payload: { token: link.token, expiresAt: link.expiresAt.toISOString(), fullName: employee.fullName },
      });
      await this.repo.setStatus(tx, ticket.id, 'PENDING', now);
      await this.audit.record(
        tx,
        this.event(context, organization.id, ticket, 'SUPER_ADMIN.RECOVERY_LINK_ISSUED', account.id, null, {
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
    this.assertContext(context);
    const organization = await this.requireOrganization();
    const located = await this.locateByEmail(organization.id, input.accountEmail);
    this.assertSeparation(context, [input.accountEmail]);

    return this.runner.run(async (tx) => {
      await this.organization.lockEmployeeForShare(tx, located.employeeId);
      await this.accounts.lockAppUser(tx, located.id, 'UPDATE');
      const account = await this.accounts.readAccount(tx, located.id);
      if (!account) throw new RecoveryRefusedError('TARGET_NOT_FOUND');
      if (!(await this.accounts.effectiveRoles(account.id, tx)).includes('SUPER_ADMIN')) {
        throw new RecoveryRefusedError('TARGET_NOT_HOLDER');
      }
      const employee = await this.organization.getEmployee(account.employeeId, tx);
      // A person who has left is not brought back (QĐ-41b); that is a role transfer, not an unlock.
      if (!employee || !employeeHasNotLeft(employee)) throw new RecoveryRefusedError('TARGET_EMPLOYEE_LEFT');
      if (account.activationState !== 'ACTIVATED') throw new RecoveryRefusedError('TARGET_NOT_USABLE');

      const { ticket, created } = await this.repo.openAndLock(tx, {
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
        const verdict = this.checkSameTicket(ticket, 'UNLOCK', { targetAppUserId: account.id });
        if (verdict) return verdict;
      }

      const now = new Date();
      const wasLocked = account.status === 'LOCKED';
      if (wasLocked) await this.accounts.setStatus(tx, account.id, 'ACTIVE');
      await this.repo.setStatus(tx, ticket.id, 'COMPLETED', now);
      await this.audit.record(
        tx,
        this.event(
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

  // --- AC-12: the role has to move to someone else -------------------------------------

  /**
   * Hands the role to a person when the holder cannot act any more (left, locked, or nobody holds it). Two stages, one
   * ticket: the first creates the successor's account, which has no role, and invites them; once they have activated
   * it, the same ticket run again moves the role in one transaction. Activating never grants the role.
   */
  async transferRole(
    context: RecoveryContext,
    input: { successorEmployeeCode: string; holderEmail?: string },
  ): Promise<RecoveryResult> {
    this.assertContext(context);
    const organization = await this.requireOrganization();
    const successorEmployee = await this.organization.getEmployeeByCode(input.successorEmployeeCode);
    if (!successorEmployee) throw new RecoveryRefusedError('SUCCESSOR_NOT_FOUND');
    const holder = input.holderEmail ? await this.locateByEmail(organization.id, input.holderEmail) : null;
    this.assertSeparation(context, [
      successorEmployee.workEmail ?? '',
      input.holderEmail ?? '',
      successorEmployee.employeeCode,
    ]);

    return this.runner.run(async (tx) => {
      // Lock order: the employees (by id), then the accounts (by id), then the ticket.
      const employeeIds = [...new Set([successorEmployee.id, ...(holder ? [holder.employeeId] : [])])].sort();
      for (const employeeId of employeeIds) await this.organization.lockEmployeeForShare(tx, employeeId);
      const successorAccountId = await this.accounts.findAccountIdByEmployee(tx, successorEmployee.id);
      const accountIds = [
        ...new Set([...(holder ? [holder.id] : []), ...(successorAccountId ? [successorAccountId] : [])]),
      ].sort();
      for (const accountId of accountIds) await this.accounts.lockAppUser(tx, accountId, 'UPDATE');

      // A completed transfer is run again after the role has moved: the named holder is no longer the holder.
      const completed = await this.repo.findCompleted(tx, organization.id, context.ticketRef);
      if (completed) {
        if (completed.mode !== 'TRANSFER_ROLE') throw new RecoveryRefusedError('TICKET_OF_ANOTHER_KIND');
        if (completed.successorEmployeeId !== successorEmployee.id)
          throw new RecoveryRefusedError('TICKET_PARAMETERS_DIFFER');

        return { ticketRef: context.ticketRef, mode: 'TRANSFER_ROLE', outcome: 'ALREADY_COMPLETED' };
      }

      const currentHolderId = await this.accounts.findSuperAdminHolderId(tx);
      if (currentHolderId !== (holder?.id ?? null)) throw new RecoveryRefusedError('TARGET_NOT_HOLDER');
      const holderAccount = currentHolderId ? await this.accounts.readAccount(tx, currentHolderId) : null;
      const holderEmployee = holderAccount ? await this.organization.getEmployee(holderAccount.employeeId, tx) : null;
      const holderUsable =
        holderAccount !== null &&
        holderAccount.status === 'ACTIVE' &&
        holderAccount.activationState === 'ACTIVATED' &&
        employeeHasNotLeft(holderEmployee);
      if (holderUsable) throw new RecoveryRefusedError('HOLDER_STILL_USABLE');
      if (holderAccount && holderAccount.employeeId === successorEmployee.id) {
        throw new RecoveryRefusedError('SUCCESSOR_IS_HOLDER');
      }
      const successor = await this.organization.getEmployee(successorEmployee.id, tx);
      if (!successor || successor.status !== 'ACTIVE') throw new RecoveryRefusedError('EMPLOYEE_NOT_WORKING');

      const { ticket, created } = await this.repo.openAndLock(tx, {
        organizationId: organization.id,
        ticketRef: context.ticketRef,
        mode: 'TRANSFER_ROLE',
        targetAppUserId: currentHolderId,
        successorEmployeeId: successor.id,
        recipientEmail: successor.workEmail,
        newLoginEmail: null,
        approverRef: context.approverRef,
        operatorRef: context.operatorRef,
        identityCheckRef: context.identityCheckRef ?? null,
        environment: context.environment,
      });
      if (!created) {
        const verdict = this.checkSameTicket(ticket, 'TRANSFER_ROLE', { targetAppUserId: currentHolderId });
        if (verdict) return verdict;
        if (ticket.successorEmployeeId !== successor.id) throw new RecoveryRefusedError('TICKET_PARAMETERS_DIFFER');
      }
      const now = new Date();

      // Stage 1: the successor has no account yet.
      if (successorAccountId === null) {
        if (!successor.workEmail) throw new RecoveryRefusedError('SUCCESSOR_HAS_NO_EMAIL');
        const normalized = tryNormalize(successor.workEmail);
        if (normalized === null) throw new RecoveryRefusedError('SUCCESSOR_HAS_NO_EMAIL');
        if (await this.accounts.findAccountByLoginEmail(organization.id, normalized)) {
          throw new RecoveryRefusedError('SUCCESSOR_EMAIL_TAKEN');
        }
        const created = await this.accounts.createAppUser(tx, {
          organizationId: organization.id,
          employeeId: successor.id,
          loginEmail: successor.workEmail,
          normalizedLoginEmail: normalized,
          status: 'ACTIVE',
          activationState: 'INVITED',
          emailVerificationSource: null,
          emailVerifiedAt: null,
        });
        await this.issueInvitation(
          tx,
          organization.id,
          created.id,
          successor.workEmail,
          successor.fullName,
          ticket.id,
          now,
        );
        await this.repo.setStatus(tx, ticket.id, 'AWAITING_ACTIVATION', now);
        await this.audit.record(
          tx,
          this.event(context, organization.id, ticket, 'SUPER_ADMIN.RECOVERY_ACCOUNT_CREATED', created.id, null, {
            roles: [],
            activationState: 'INVITED',
          }),
        );

        return {
          ticketRef: context.ticketRef,
          mode: 'TRANSFER_ROLE',
          outcome: 'ACCOUNT_CREATED',
          sentTo: 'WORK_EMAIL',
        };
      }

      // Stage 2, or the wait for it: the successor has an account.
      const problem = await this.eligibility.check(tx, successorAccountId);
      if (problem === 'NOT_ACTIVATED' && ticket.status === 'AWAITING_ACTIVATION') {
        if (await this.hasWorkingLink(tx, ticket, successorAccountId, now, 'INVITE')) {
          return { ticketRef: context.ticketRef, mode: 'TRANSFER_ROLE', outcome: 'INVITATION_ALREADY_SENT' };
        }
        const usable = (await this.accounts.findUsableTokens(tx, successorAccountId)).map((token) => token.tokenHash);
        await this.accounts.revokeTokens(tx, usable, 'SUPERSEDED', now);
        await this.notifications.cancelPendingForTokens(tx, usable);
        await this.issueInvitation(
          tx,
          organization.id,
          successorAccountId,
          successor.workEmail ?? '',
          successor.fullName,
          ticket.id,
          now,
        );

        return {
          ticketRef: context.ticketRef,
          mode: 'TRANSFER_ROLE',
          outcome: 'INVITATION_REISSUED',
          sentTo: 'WORK_EMAIL',
        };
      }
      if (problem) throw new RecoveryRefusedError(problem);

      const holderRoles = currentHolderId ? await this.accounts.effectiveRoles(currentHolderId, tx) : [];
      if (currentHolderId) {
        await this.accounts.revokeRole(tx, {
          appUserId: currentHolderId,
          role: 'SUPER_ADMIN',
          revokedBy: currentHolderId,
          now,
        });
      }
      try {
        await this.accounts.grantRole(tx, {
          organizationId: organization.id,
          appUserId: successorAccountId,
          role: 'SUPER_ADMIN',
        });
      } catch (error) {
        if (readSqlState(error) === '23514') throw new RecoveryRefusedError('WORK_ROLE_HELD');
        throw error;
      }
      await this.repo.setStatus(tx, ticket.id, 'COMPLETED', now);
      const successorRoles = await this.accounts.effectiveRoles(successorAccountId, tx);
      if (currentHolderId) {
        await this.audit.record(
          tx,
          this.event(
            context,
            organization.id,
            ticket,
            'SUPER_ADMIN.TRANSFERRED_OUT',
            currentHolderId,
            { roles: holderRoles },
            { roles: holderRoles.filter((role) => role !== 'SUPER_ADMIN') },
          ),
        );
      }
      await this.audit.record(
        tx,
        this.event(
          context,
          organization.id,
          ticket,
          'SUPER_ADMIN.TRANSFERRED_IN',
          successorAccountId,
          { roles: successorRoles.filter((role) => role !== 'SUPER_ADMIN') },
          { roles: successorRoles },
        ),
      );

      return { ticketRef: context.ticketRef, mode: 'TRANSFER_ROLE', outcome: 'ROLE_TRANSFERRED' };
    });
  }

  // --- shared -------------------------------------------------------------------------

  /**
   * The answer for a ticket that was run before, or null to carry on with it: a ticket of another kind or for other
   * parameters is refused; one completed is a no-op; one replaced by a newer ticket cannot be run any more (AC-11).
   */
  private checkSameTicket(
    ticket: TicketRecord,
    mode: RecoveryModeName,
    expected: { targetAppUserId: string | null },
  ): RecoveryResult | null {
    if (ticket.mode !== mode) throw new RecoveryRefusedError('TICKET_OF_ANOTHER_KIND');
    if (ticket.targetAppUserId !== expected.targetAppUserId) throw new RecoveryRefusedError('TICKET_PARAMETERS_DIFFER');
    if (ticket.status === 'SUPERSEDED') throw new RecoveryRefusedError('TICKET_SUPERSEDED');
    if (ticket.status === 'COMPLETED') return { ticketRef: ticket.ticketRef, mode, outcome: 'ALREADY_COMPLETED' };

    return null;
  }

  /** Whether the ticket has a link that can still be used and whose mail has not failed: then there is nothing to send again. */
  private async hasWorkingLink(
    tx: DbTx,
    ticket: TicketRecord,
    appUserId: string,
    now: Date,
    purpose: 'INVITE' | 'RESET_PASSWORD' = 'RESET_PASSWORD',
  ): Promise<boolean> {
    const links = (await this.accounts.findUsableTokens(tx, appUserId, purpose)).filter(
      (token) => token.recoveryTicketId === ticket.id && token.expiresAt > now,
    );
    if (links.length === 0) return false;

    const states = await this.notifications.deliveryStates(links.map((link) => link.tokenHash));

    return links.some((link) => {
      const state = states.get(link.tokenHash);

      return state !== undefined && state.status !== 'FAILED' && state.status !== 'CANCELLED';
    });
  }

  private async issueInvitation(
    tx: DbTx,
    organizationId: string,
    appUserId: string,
    recipient: string,
    fullName: string,
    ticketId: string,
    now: Date,
  ): Promise<void> {
    const link = newActionToken(now, this.config.get('AUTH_INVITATION_TTL_SECONDS', { infer: true }) * 1000);
    await this.accounts.insertActionToken(tx, {
      tokenHash: link.hash,
      appUserId,
      purpose: 'INVITE',
      expiresAt: link.expiresAt,
      createdBy: null,
      recoveryTicketId: ticketId,
    });
    await this.notifications.enqueueEmail(tx, {
      organizationId,
      recipient,
      template: 'ACCOUNT_INVITATION',
      locale: 'vi',
      actionTokenHash: link.hash,
      payload: { token: link.token, expiresAt: link.expiresAt.toISOString(), fullName },
    });
  }

  /** The audit event of an operator step: the ticket, who approved and who ran it, and whether it was a test. */
  private event(
    context: RecoveryContext,
    organizationId: string,
    ticket: TicketRecord,
    action: string,
    resourceId: string,
    before: { [key: string]: AuditValue } | null,
    after: { [key: string]: AuditValue } | null,
  ): AuditEventInput {
    return {
      organizationId,
      actorKind: 'OPERATOR',
      operatorReference: context.ticketRef,
      action,
      resourceType: 'AppUser',
      resourceId,
      before,
      after: {
        ...(after ?? {}),
        ticket: context.ticketRef,
        approver: context.approverRef,
        operator: context.operatorRef,
        environment: context.environment,
        ...(context.identityCheckRef ? { identityCheck: context.identityCheckRef } : {}),
      },
      correlationId: ticket.id,
    };
  }

  private assertContext(context: RecoveryContext): void {
    if (!TICKET_REFERENCE.test(context.ticketRef)) throw new RecoveryRefusedError('TICKET_REFERENCE_INVALID');
    for (const reference of [context.approverRef, context.operatorRef, context.identityCheckRef ?? 'xx']) {
      if (!FREE_TEXT_REFERENCE.test(reference)) throw new RecoveryRefusedError('TICKET_REFERENCE_INVALID');
    }
  }

  /**
   * In a shared environment the approver and the operator are two people, and the person who receives the link is not
   * the operator (AC-13). A local test environment lets one person do both, and the audit says it was a test.
   */
  private assertSeparation(context: RecoveryContext, recipients: string[]): void {
    if (context.environment !== 'SHARED') return;
    if (same(context.approverRef, context.operatorRef)) throw new RecoveryRefusedError('APPROVER_IS_OPERATOR');
    if (recipients.some((recipient) => recipient.trim() !== '' && same(recipient, context.operatorRef))) {
      throw new RecoveryRefusedError('RECIPIENT_IS_OPERATOR');
    }
  }

  private async locateByEmail(organizationId: string, email: string) {
    const normalized = tryNormalize(email);
    const found = normalized === null ? null : await this.accounts.findAccountByLoginEmail(organizationId, normalized);
    if (!found) throw new RecoveryRefusedError('TARGET_NOT_FOUND');

    return found;
  }

  private parseNewEmail(raw: string): { raw: string; normalized: string } {
    const normalized = tryNormalize(raw);
    if (normalized === null) throw new RecoveryRefusedError('NEW_EMAIL_INVALID');

    return { raw: raw.trim(), normalized };
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A recovery was run before installation');

    return organization;
  }
}
