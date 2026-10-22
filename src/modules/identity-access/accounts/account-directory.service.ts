import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  AccountListFilter,
  AccountRecord,
  AccountSnapshot,
  ActivationState,
  AppUserStatus,
  CreateAppUserInput,
} from '../identity-access.types';
import { AppUserRepo } from './app-user.repo';

/**
 * The account itself (AppUser): the one door other capabilities, the recovery command and the use cases of the API
 * use to read, lock and change it. The persistence stays private to accounts; every method keeps the exact query,
 * lock mode and transaction client of the repository behind it (lock protocol rules 1 and 2: lock, then read in a
 * statement of its own).
 */
@Injectable()
export class AccountDirectoryService {
  constructor(private readonly accounts: AppUserRepo) {}

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

  /** Ids of every Employee that already has an account, whatever its state (one per Employee, AC-8). */
  findEmployeeIdsWithAccount(): Promise<string[]> {
    return this.accounts.findEmployeeIdsWithAccount();
  }
}
