import { Injectable } from '@nestjs/common';
import { normalizeEmail } from '../../../core/email';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AccountRecordService } from '../accounts/account-record.service';
import { CredentialService } from '../credentials/credential.service';
import { RoleGrantService } from '../accounts/role-grant.service';
import { DemoAccountRoleError } from './identity-access.errors';
import { CreateDemoAccountInput, DemoAccountRole, DemoAccountState } from './identity-access.types';

const DEMO_ACCOUNT_ROLES: ReadonlySet<string> = new Set<DemoAccountRole>([
  'IT_ADMIN',
  'FINANCE',
  'EMPLOYEE',
  'MANAGER',
]);

/**
 * Activated demo accounts for `pnpm ops:seed`, after target installation verification. Declared only in
 * IdentityAccessLocalSeedFacadeModule, loaded by the seed graph. Each account has exactly one direct role, never SUPER_ADMIN.
 * The login email is asserted by the operator running the
 * command, as for the installation's Super Admin: the demo mailbox does not exist, so there is no invitation.
 */
@Injectable()
export class LocalDemoAccountApi {
  constructor(
    private readonly accounts: AccountRecordService,
    private readonly grants: RoleGrantService,
    private readonly credentials: CredentialService,
  ) {}

  /** Whether the account can be created, is already as the fixture wants it, or conflicts with existing data. */
  async describeDemoAccount(
    tx: DbTx,
    input: {
      organizationId: string;
      employeeId: string | null;
      loginEmail: string;
      initialRole: DemoAccountRole;
      finalRole?: 'SPENDING_APPROVER';
    },
  ): Promise<DemoAccountState> {
    const loginEmail = normalizeEmail(input.loginEmail);
    const accountId =
      input.employeeId === null ? null : await this.accounts.findAccountIdByEmployee(tx, input.employeeId);
    if (accountId !== null) {
      const account = await this.accounts.findAccountRecord(accountId, tx);
      const roles = await this.grants.effectiveRoles(accountId, tx);
      const asWanted =
        account !== null &&
        account.status === 'ACTIVE' &&
        account.activationState === 'ACTIVATED' &&
        normalizeEmail(account.loginEmail) === loginEmail &&
        roles.length === 1 &&
        [input.initialRole, input.finalRole].some((role) => role === roles[0]);

      return asWanted ? { state: 'present' } : { state: 'conflict', reason: 'ACCOUNT_DIFFERS' };
    }
    if ((await this.accounts.findAccountByLoginEmail(input.organizationId, loginEmail)) !== null)
      return { state: 'conflict', reason: 'LOGIN_EMAIL_TAKEN' };
    if (input.initialRole === 'FINANCE' && (await this.grants.financeIsHeld(tx, input.organizationId)))
      return { state: 'conflict', reason: 'FINANCE_HELD_ELSEWHERE' };

    return { state: 'absent' };
  }

  /** Writes the account, its credential and its one grant in the caller's transaction. The caller audits. */
  async createDemoAccount(tx: DbTx, input: CreateDemoAccountInput): Promise<{ appUserId: string }> {
    if (!DEMO_ACCOUNT_ROLES.has(input.initialRole)) throw new DemoAccountRoleError(input.initialRole);

    const user = await this.accounts.createAppUser(tx, {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      loginEmail: input.loginEmail.trim(),
      normalizedLoginEmail: normalizeEmail(input.loginEmail),
      status: 'ACTIVE',
      activationState: 'ACTIVATED',
      emailVerificationSource: 'BOOTSTRAP_ASSERTED',
      emailVerifiedAt: new Date(),
    });
    await this.credentials.createCredential(tx, user.id, input.passwordHash, input.hashPolicyVersion);
    await this.grants.grantRole(tx, {
      organizationId: input.organizationId,
      appUserId: user.id,
      role: input.initialRole,
    });

    return { appUserId: user.id };
  }
}
