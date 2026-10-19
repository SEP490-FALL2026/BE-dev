import { Injectable } from '@nestjs/common';
import { normalizeEmail } from '../../core/email';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../organization/organization.service';
import { AccountDirectoryService } from './accounts/account-directory.service';
import { ActionLinkService } from './accounts/action-link.service';
import { CredentialService } from './accounts/credential.service';
import { RoleGrantService } from './accounts/role-grant.service';
import { ApprovalRoleDirectoryService } from './approval-roles/approval-role-directory.service';
import {
  AccountInventory,
  AccountStateKey,
  AppRole,
  ApprovalRoleKind,
  BootstrapSuperAdminInput,
  CreateDemoAccountInput,
  DemoAccountRole,
  DemoAccountState,
  EmployeeAccountInspection,
} from './identity-access.types';
import { DemoAccountRoleError } from './identity-access.errors';
import { employeeHasNotLeft, isActionLinkRedeemable } from './policies/account-policy';

/** Public facade of the identity-access module. */
@Injectable()
export class IdentityAccessService {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly grants: RoleGrantService,
    private readonly links: ActionLinkService,
    private readonly credentials: CredentialService,
    private readonly organization: OrganizationService,
  ) {}

  /**
   * Checks the password policy and hashes the password. Call this BEFORE opening a transaction:
   * hashing is the slow part and must not hold database locks (lock protocol rule 3).
   */
  prepareCredential(password: string, loginEmail: string): Promise<{ hash: string; hashPolicyVersion: number }> {
    return this.credentials.prepareCredential(password, loginEmail);
  }

  /**
   * Installation only (FR-9.8): an activated account for `employeeId` holding the one SUPER_ADMIN
   * grant. The email counts as asserted by the person running the command, not as verified by
   * an invitation, and is recorded that way.
   */
  async createBootstrapSuperAdmin(tx: DbTx, input: BootstrapSuperAdminInput): Promise<{ appUserId: string }> {
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
      role: 'SUPER_ADMIN',
    });

    return { appUserId: user.id };
  }

  /**
   * Whether the link behind this token hash would still work, for an invitation or a password reset;
   * the dispatcher asks this before sending (T-10).
   */
  async isActionLinkUsable(tokenHash: string): Promise<boolean> {
    const link = await this.links.findActionLink(tokenHash);
    if (link === null || !isActionLinkRedeemable(link, new Date())) return false;

    // Redeeming refuses an employee who has left, so a link to one is dead and must not be mailed.
    return employeeHasNotLeft(await this.organization.getEmployee(link.appUser.employeeId));
  }

  /**
   * The account of an employee as another module needs to judge it: does it exist, can it sign in, which roles it
   * holds. Takes the account's row lock `FOR SHARE` first (lock protocol: the employee, then the account) and reads
   * in a statement of its own, so a grant or a lock that commits after this cannot change what was judged before
   * commit.
   */
  async inspectEmployeeAccount(tx: DbTx, employeeId: string): Promise<EmployeeAccountInspection> {
    const appUserId = await this.accounts.findAccountIdByEmployee(tx, employeeId);
    if (appUserId === null) return { hasAccount: false, usable: false, roles: [] };

    await this.accounts.lockAppUser(tx, appUserId, 'SHARE');
    const account = await this.accounts.readAccount(tx, appUserId);
    const roles = await this.grants.effectiveRoles(appUserId, tx);

    return {
      hasAccount: account !== null,
      usable: account !== null && account.status === 'ACTIVE' && account.activationState === 'ACTIVATED',
      roles,
    };
  }

  /** Among these employees, those who hold the IT Admin role on a usable account (an unlocked read, for lists). */
  findUsableItAdminEmployeeIds(employeeIds: readonly string[]): Promise<Set<string>> {
    return this.accounts.findUsableItAdminEmployeeIds(employeeIds);
  }
}

const ACCOUNT_STATES: readonly AccountStateKey[] = [
  'ACTIVE_ACTIVATED',
  'ACTIVE_INVITED',
  'LOCKED_ACTIVATED',
  'LOCKED_INVITED',
];
const DIRECT_ROLES: readonly AppRole[] = ['SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'EMPLOYEE'];
const APPROVAL_ROLES: readonly ApprovalRoleKind[] = ['SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE', 'FALLBACK_APPROVER'];

const zeroes = <K extends string>(keys: readonly K[]): Record<K, number> =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

/**
 * The read-only contract of the installation inspection (`ops:inspect`, H6.1). Declared only in
 * IdentityAccessInspectionFacadeModule, which nothing but the inspection graph loads. Counts and one account state;
 * every read runs in the caller's (read-only) transaction.
 */
@Injectable()
export class IdentityAccessInspectionService {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly grants: RoleGrantService,
    private readonly approvalRoles: ApprovalRoleDirectoryService,
  ) {}

  async accountInventory(tx: DbTx): Promise<AccountInventory> {
    const holderId = await this.grants.findSuperAdminHolderId(tx);
    const holder = holderId === null ? null : await this.accounts.findAccountRecord(holderId, tx);
    const accountsByState = zeroes(ACCOUNT_STATES);
    for (const group of await this.accounts.countAccountsByState(tx))
      accountsByState[`${group.status}_${group.activationState}`] = group.count;
    const directRoles = zeroes(DIRECT_ROLES);
    for (const [role, count] of await this.grants.countEffectiveGrantsByRole(tx)) directRoles[role] = count;
    const approvalRoles = zeroes(APPROVAL_ROLES);
    for (const role of await this.approvalRoles.heldRoles(tx)) approvalRoles[role] += 1;

    return {
      superAdmin:
        holder === null
          ? null
          : {
              holders: directRoles.SUPER_ADMIN,
              status: holder.status,
              activationState: holder.activationState,
              loginEmail: holder.loginEmail,
            },
      accountsByState,
      directRoles,
      approvalRoles,
    };
  }

  /** Among these employees, those who hold the IT Admin role on a usable account, in the caller's transaction. */
  usableItAdminEmployeeIds(employeeIds: readonly string[], tx: DbTx): Promise<Set<string>> {
    return this.accounts.findUsableItAdminEmployeeIds(employeeIds, tx);
  }
}

const DEMO_ACCOUNT_ROLES: ReadonlySet<string> = new Set<DemoAccountRole>(['IT_ADMIN', 'FINANCE', 'EMPLOYEE']);

/**
 * Local demo accounts for `pnpm dev:seed` (H6.2). Declared only in IdentityAccessLocalSeedFacadeModule, which nothing
 * but the seed graph loads; the command checks its local guards before it calls this. One activated account per demo
 * employee with exactly one direct role, never SUPER_ADMIN and never a derived role (operational-commands rule 6). The
 * login email counts as asserted by the person who ran the command, as for the installation's Super Admin: the demo
 * mailbox does not exist, so there is no invitation.
 */
@Injectable()
export class LocalDemoAccountService {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly grants: RoleGrantService,
    private readonly credentials: CredentialService,
  ) {}

  /** Whether the account can be created, is already as the fixture wants it, or conflicts with existing data. */
  async describeDemoAccount(
    tx: DbTx,
    input: { organizationId: string; employeeId: string | null; loginEmail: string; role: DemoAccountRole },
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
        roles[0] === input.role;

      return asWanted ? { state: 'present' } : { state: 'conflict', reason: 'ACCOUNT_DIFFERS' };
    }
    if ((await this.accounts.findAccountByLoginEmail(input.organizationId, loginEmail)) !== null)
      return { state: 'conflict', reason: 'LOGIN_EMAIL_TAKEN' };
    if (input.role === 'FINANCE' && (await this.grants.financeIsHeld(tx, input.organizationId)))
      return { state: 'conflict', reason: 'FINANCE_HELD_ELSEWHERE' };

    return { state: 'absent' };
  }

  /** Writes the account, its credential and its one grant in the caller's transaction. The caller audits. */
  async createDemoAccount(tx: DbTx, input: CreateDemoAccountInput): Promise<{ appUserId: string }> {
    if (!DEMO_ACCOUNT_ROLES.has(input.role)) throw new DemoAccountRoleError(input.role);

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
    await this.grants.grantRole(tx, { organizationId: input.organizationId, appUserId: user.id, role: input.role });

    return { appUserId: user.id };
  }
}
