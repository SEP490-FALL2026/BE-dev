import { Injectable } from '@nestjs/common';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { EmployeeNotFoundError } from '../../organization/organization.errors';
import { OrganizationService } from '../../organization/organization.service';
import { AppRole } from '../identity-access.types';
import { employeeHasNotLeft } from '../policies/account-policy';
import { translateAccountWriteError } from './account-constraints';
import { AccountDirectoryService } from './account-directory.service';
import { accountAuditEvent, isSelfChange, RequestedRole, validateRoleSet } from './account-administration.policy';
import {
  AccountAlreadyActivatedError,
  AccountAlreadyExistsError,
  AccountLockedError,
  AccountNotFoundError,
  EmployeeTerminatedError,
  FinanceAlreadyAssignedError,
  LoginEmailInvalidError,
  LoginEmailRequiredError,
  RoleRequestRefusedError,
  SelfChangeForbiddenError,
} from './account.errors';
import { InvitationMailService } from './invitation-mail.service';
import { RoleGrantService } from './role-grant.service';

export interface CreateAccountInput {
  employeeId: string;
  loginEmail?: string;
  roles: RequestedRole[];
}

/**
 * Creating an account and inviting its owner, or inviting again (slice 1b). Every method that changes an account takes
 * the AppUser row lock first and re-reads what it decides on (lock protocol rules 1 and 2). Redeeming the invitation is
 * `InvitationRedemptionService`.
 */
@Injectable()
export class AccountInvitationService {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly grants: RoleGrantService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly invitations: InvitationMailService,
    private readonly runner: TransactionRunner,
  ) {}

  /** Creates the account, grants its roles and queues the invitation. Returns the new account's id. */
  async createAccount(actor: AuthenticatedPrincipal, input: CreateAccountInput): Promise<string> {
    const violation = validateRoleSet(input.roles);
    if (violation) throw new RoleRequestRefusedError(violation);

    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('Account creation before installation');
    const employee = await this.organization.getEmployee(input.employeeId);
    if (!employee) throw new EmployeeNotFoundError(input.employeeId);

    const roles = [...new Set(input.roles)] as AppRole[];

    return this.runner
      .run(async (tx) => {
        // Employee first (lock order 1), so the status checked here cannot change before commit.
        await this.organization.lockEmployeeForShare(tx, input.employeeId);
        const current = await this.organization.getEmployee(input.employeeId, tx);
        if (!current) throw new EmployeeNotFoundError(input.employeeId);
        if (!employeeHasNotLeft(current)) throw new EmployeeTerminatedError();
        // Resolved from the employee as locked, not from the earlier unlocked read (lock protocol rule 2).
        const rawEmail = input.loginEmail ?? current.workEmail;
        if (!rawEmail) throw new LoginEmailRequiredError();
        const normalized = this.normalizeLoginEmail(rawEmail);
        if ((await this.accounts.findAccountIdByEmployee(tx, input.employeeId)) !== null) {
          throw new AccountAlreadyExistsError();
        }
        if (roles.includes('FINANCE') && (await this.grants.financeIsHeld(tx, organization.id))) {
          throw new FinanceAlreadyAssignedError();
        }

        const now = new Date();
        const user = await this.accounts.createAppUser(tx, {
          organizationId: organization.id,
          employeeId: input.employeeId,
          loginEmail: rawEmail.trim(),
          normalizedLoginEmail: normalized,
          status: 'ACTIVE',
          activationState: 'INVITED',
          emailVerificationSource: null,
          emailVerifiedAt: null,
        });
        for (const role of roles) {
          await this.grants.grantRole(tx, {
            organizationId: organization.id,
            appUserId: user.id,
            role,
            grantedBy: actor.appUserId,
          });
          await this.audit.record(
            tx,
            accountAuditEvent(actor, organization.id, 'ROLE.GRANTED', user.id, null, { role }),
          );
        }
        await this.audit.record(
          tx,
          accountAuditEvent(actor, organization.id, 'APP_USER.CREATED', user.id, null, {
            employeeId: input.employeeId,
            loginEmail: rawEmail.trim(),
            status: 'ACTIVE',
            activationState: 'INVITED',
            roles,
          }),
        );
        await this.invitations.send(tx, actor, organization.id, user.id, rawEmail.trim(), current, now);

        return user.id;
      })
      .catch((error: unknown) => {
        throw translateAccountWriteError(error);
      });
  }

  async resendInvitation(actor: AuthenticatedPrincipal, appUserId: string): Promise<void> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();

    await this.runner.run(async (tx) => {
      const account = await this.accounts.lockAndReadAccount(tx, appUserId);
      if (!account) throw new AccountNotFoundError();
      if (account.activationState === 'ACTIVATED') throw new AccountAlreadyActivatedError();
      if (account.status === 'LOCKED') throw new AccountLockedError();
      const employee = await this.organization.getEmployee(account.employeeId, tx);
      if (!employeeHasNotLeft(employee)) throw new EmployeeTerminatedError();

      // Every usable token goes, including an expired one that still holds the place (spec base).
      await this.invitations.replace(
        tx,
        actor,
        account.organizationId,
        appUserId,
        account.loginEmail,
        employee,
        new Date(),
      );
    });
  }

  private normalizeLoginEmail(value: string): string {
    try {
      return normalizeEmail(value);
    } catch (error) {
      if (error instanceof InvalidEmailError) throw new LoginEmailInvalidError();
      throw error;
    }
  }
}
