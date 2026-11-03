import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  EmployeeAccountDetail,
  EmployeeAccountSummary,
} from '../../organization/public/organization.extension-points';
import {
  AccountListFilter,
  AccountRecord,
  AccountSnapshot,
  ActivationState,
  AppUserStatus,
  CreateAppUserInput,
  EmployeeAccountInspection,
  SuperAdminHolder,
} from '../public/identity-access.types';
import { AppUserRepo } from './app-user.repo';
import { RoleGrantService } from './role-grant.service';
import { SuperAdminHolderRepo } from './super-admin-holder.repo';

/**
 * The account itself (AppUser): the one door other capabilities, the recovery command and the use cases of the API
 * use to read, lock and change it. The persistence stays private to accounts; every method keeps the exact query,
 * lock mode and transaction client of the repository behind it (lock protocol rules 1 and 2: lock, then read in a
 * statement of its own).
 */
@Injectable()
export class AccountRecordService {
  constructor(
    private readonly accounts: AppUserRepo,
    private readonly superAdmin: SuperAdminHolderRepo,
    private readonly grants: RoleGrantService,
  ) {}

  /** Unlocked lookup used before the transaction to decide what to verify. */
  findAccountByLoginEmail(organizationId: string, normalizedLoginEmail: string): Promise<AccountSnapshot | null> {
    return this.accounts.findAccountByLoginEmail(organizationId, normalizedLoginEmail);
  }

  /** How many accounts are in each status and activation state, in the caller's transaction. */
  countAccountsByState(
    tx: DbTx,
  ): Promise<{ status: AppUserStatus; activationState: ActivationState; count: number }[]> {
    return this.accounts.countByState(tx);
  }

  /** Unlocked read of one account by id, with its credential hash. */
  findAccountById(appUserId: string): Promise<AccountSnapshot | null> {
    return this.accounts.findAccountById(appUserId);
  }

  /** The account's row lock: the linearization point for everything that changes or depends on one account. */
  lockAppUser(tx: DbTx, appUserId: string, mode: 'SHARE' | 'UPDATE'): Promise<boolean> {
    return this.accounts.lockAppUser(tx, appUserId, mode);
  }

  /**
   * Who, among these employees, holds the SPENDING_APPROVER role (QĐ-93a): the accounts of all of them are locked `FOR SHARE` first, in the
   * order of their ids, and the grants are read in a statement of their own. The side that creates a Request calls it, so it and the
   * grant of the role (which holds the account `FOR UPDATE`) wait on the same row. Null when none of them holds it.
   */
  async lockSpendingApproverAmong(tx: DbTx, employeeIds: readonly string[]): Promise<string | null> {
    await this.accounts.lockAppUsersOfEmployees(tx, employeeIds);
    const held = await this.grants.listHoldersAmong(employeeIds, ['SPENDING_APPROVER'], tx);

    return [...held.keys()][0] ?? null;
  }

  readAccount(tx: DbTx, appUserId: string): Promise<AccountSnapshot | null> {
    return this.accounts.readAccount(tx, appUserId);
  }

  /** Locks the account for update and reads it. Null when it does not exist. */
  lockAndReadAccount(tx: DbTx, appUserId: string): Promise<AccountRecord | null> {
    return this.accounts.lockAndReadAccount(tx, appUserId);
  }

  createAppUser(tx: DbTx, input: CreateAppUserInput): Promise<{ id: string }> {
    return this.accounts.createAppUser(tx, input);
  }

  findAccountIdByEmployee(tx: DbTx, employeeId: string): Promise<string | null> {
    return this.accounts.findAccountIdByEmployee(tx, employeeId);
  }

  /** The one account that holds the Super Admin role and what decides whether it can act; null when nobody holds it. */
  findSuperAdminHolder(tx?: DbTx): Promise<SuperAdminHolder | null> {
    return this.superAdmin.find(tx);
  }

  findLoginEmail(appUserId: string): Promise<string | null> {
    return this.accounts.findLoginEmail(appUserId);
  }

  setStatus(tx: DbTx, appUserId: string, status: 'ACTIVE' | 'LOCKED'): Promise<void> {
    return this.accounts.setStatus(tx, appUserId, status);
  }

  markActivated(tx: DbTx, appUserId: string, now: Date): Promise<void> {
    return this.accounts.markActivated(tx, appUserId, now);
  }

  /** Moves the account to a login email that was confirmed by a recovery link (US-01-09 AC-10). */
  changeLoginEmail(
    tx: DbTx,
    appUserId: string,
    input: { loginEmail: string; normalizedLoginEmail: string; now: Date },
  ): Promise<void> {
    return this.accounts.changeLoginEmail(tx, appUserId, input);
  }

  /** How the login email of the account was verified; null when it never was. */
  readEmailVerificationSource(tx: DbTx, appUserId: string): Promise<string | null> {
    return this.accounts.readEmailVerificationSource(tx, appUserId);
  }

  /** Among the employee ids given, those whose account is usable and holds an effective IT_ADMIN grant. */
  findUsableItAdminEmployeeIds(employeeIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    return this.accounts.findUsableItAdminEmployeeIds(employeeIds, tx);
  }

  /** The usable IT Admin with the smallest employee code, or null: who a report is given to when nobody is in charge. */
  findFirstUsableItAdminEmployeeId(tx?: DbTx): Promise<string | null> {
    return this.accounts.findFirstUsableItAdminEmployeeId(tx);
  }

  /** The employee who holds the FINANCE role on an account that can act, or null. */
  findUsableFinanceEmployeeId(tx?: DbTx): Promise<string | null> {
    return this.accounts.findUsableFinanceEmployeeId(tx);
  }

  /** The employee who holds the SUPER_ADMIN role on an account that can act, or null. */
  findUsableSuperAdminEmployeeId(tx?: DbTx): Promise<string | null> {
    return this.accounts.findUsableSuperAdminEmployeeId(tx);
  }

  /** The employee behind each of these accounts, by account id. */
  employeeIdsOfAccounts(appUserIds: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    return this.accounts.employeeIdsOfAccounts(appUserIds, tx);
  }

  /** How many IT Admins other than this employee can act, for the rule that an IT Admin does not serve themselves. */
  countUsableItAdminsExcept(employeeId: string, tx?: DbTx): Promise<number> {
    return this.accounts.countUsableItAdminsExcept(employeeId, tx);
  }

  // --- account administration reads ---------------------------------------------------

  findAccountRecord(appUserId: string, tx?: DbTx): Promise<AccountRecord | null> {
    return this.accounts.findAccountRecord(appUserId, tx);
  }

  listAccountRecords(filter: AccountListFilter): Promise<{ items: AccountRecord[]; total: number }> {
    return this.accounts.listAccountRecords(filter);
  }

  /** The person behind the account left on `leftOn`: written once, by the record of a departure. */
  markEmployeeLeft(tx: DbTx, employeeId: string, leftOn: BusinessDate): Promise<void> {
    return this.accounts.setEmployeeLeftOn(tx, employeeId, leftOn);
  }

  /** Ids of every Employee that already has an account, whatever its state (one per Employee, AC-8). */
  findEmployeeIdsWithAccount(): Promise<string[]> {
    return this.accounts.findEmployeeIdsWithAccount();
  }

  /** Summarizes accounts for list in one statement on app_users only. */
  summarizeAccounts(employeeIds: readonly string[], tx?: DbTx): Promise<Map<string, EmployeeAccountSummary>> {
    return this.accounts.summarizeAccounts(employeeIds, tx);
  }

  /** Describes account and active roles for detail in one statement, unlocked. */
  describeAccount(employeeId: string, tx?: DbTx): Promise<EmployeeAccountDetail | null> {
    return this.accounts.describeAccount(employeeId, tx);
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
}
