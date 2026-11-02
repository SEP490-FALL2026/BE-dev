import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  AccountListFilter,
  AccountRecord,
  AccountSnapshot,
  ActivationState,
  AppUserStatus,
  CreateAppUserInput,
} from '../public/identity-access.types';

type LockMode = 'SHARE' | 'UPDATE';

const ACCOUNT_SELECT = {
  id: true,
  organizationId: true,
  employeeId: true,
  loginEmail: true,
  status: true,
  activationState: true,
  credential: { select: { hash: true } },
} as const;

const ACCOUNT_RECORD_SELECT = {
  id: true,
  organizationId: true,
  employeeId: true,
  loginEmail: true,
  status: true,
  activationState: true,
  createdAt: true,
} as const;

interface AccountRow {
  id: string;
  organizationId: string;
  employeeId: string;
  loginEmail: string;
  status: 'ACTIVE' | 'LOCKED';
  activationState: 'INVITED' | 'ACTIVATED';
  credential: { hash: string } | null;
}

function toAccount(row: AccountRow): AccountSnapshot {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    loginEmail: row.loginEmail,
    status: row.status,
    activationState: row.activationState,
    credentialHash: row.credential?.hash ?? null,
  };
}

/** Owns AppUser: the account, its login email, status and activation. The one writer of `app_users`. */
@Injectable()
export class AppUserRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Unlocked lookup used before the transaction to decide what to verify. */
  async findAccountByLoginEmail(organizationId: string, normalizedLoginEmail: string): Promise<AccountSnapshot | null> {
    const row = await this.prisma.appUser.findUnique({
      where: { organizationId_normalizedLoginEmail: { organizationId, normalizedLoginEmail } },
      select: ACCOUNT_SELECT,
    });

    return row ? toAccount(row) : null;
  }

  /** Unlocked read of one account by id, with its credential hash, used before the transaction to decide what to verify. */
  async findAccountById(appUserId: string): Promise<AccountSnapshot | null> {
    const row = await this.prisma.appUser.findUnique({ where: { id: appUserId }, select: ACCOUNT_SELECT });

    return row ? toAccount(row) : null;
  }

  /**
   * Takes the account's row lock. This is the linearization point for everything that changes
   * or depends on one account (lock protocol rule 1). Read state in a separate statement after.
   */
  async lockAppUser(tx: DbTx, appUserId: string, mode: LockMode): Promise<boolean> {
    const rows =
      mode === 'SHARE'
        ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM app_users WHERE id = ${appUserId}::uuid FOR SHARE`
        : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM app_users WHERE id = ${appUserId}::uuid FOR UPDATE`;

    return rows.length === 1;
  }

  /**
   * Takes the row lock `FOR SHARE` of the accounts of these people, in the order of their ids (so two callers never wait on each
   * other), and returns the ids of the accounts it locked. A person with no account locks nothing. Read state in a statement of its own.
   */
  async lockAppUsersOfEmployees(tx: DbTx, employeeIds: readonly string[]): Promise<string[]> {
    if (employeeIds.length === 0) return [];
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM app_users WHERE employee_id = ANY(${[...employeeIds]}::uuid[]) ORDER BY id FOR SHARE`;

    return rows.map((row) => row.id);
  }

  async readAccount(tx: DbTx, appUserId: string): Promise<AccountSnapshot | null> {
    const row = await tx.appUser.findUnique({ where: { id: appUserId }, select: ACCOUNT_SELECT });

    return row ? toAccount(row) : null;
  }

  async createAppUser(tx: DbTx, input: CreateAppUserInput): Promise<{ id: string }> {
    return tx.appUser.create({ data: input, select: { id: true } });
  }

  async findLoginEmail(appUserId: string): Promise<string | null> {
    const row = await this.prisma.appUser.findUnique({ where: { id: appUserId }, select: { loginEmail: true } });

    return row?.loginEmail ?? null;
  }

  /** Ids of every Employee that already has an account, whatever its state (one per Employee, AC-8). */
  async findEmployeeIdsWithAccount(): Promise<string[]> {
    const rows = await this.prisma.appUser.findMany({ select: { employeeId: true } });

    return rows.map((row) => row.employeeId);
  }

  /** How many accounts are in each status and activation state (states with none are absent). */
  async countByState(tx: DbTx): Promise<{ status: AppUserStatus; activationState: ActivationState; count: number }[]> {
    const groups = await tx.appUser.groupBy({
      by: ['status', 'activationState'],
      _count: { _all: true },
      orderBy: [{ status: 'asc' }, { activationState: 'asc' }],
    });

    return groups.map((group) => ({
      status: group.status,
      activationState: group.activationState,
      count: group._count._all,
    }));
  }

  /** Among the employee ids given, those whose account is active and activated and holds an effective IT_ADMIN grant. */
  async findUsableItAdminEmployeeIds(employeeIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    if (employeeIds.length === 0) return new Set();
    const rows = await (tx ?? this.prisma).appUser.findMany({
      where: {
        employeeId: { in: [...employeeIds] },
        status: 'ACTIVE',
        activationState: 'ACTIVATED',
        roleGrants: { some: { role: 'IT_ADMIN', revokedAt: null } },
      },
      select: { employeeId: true },
    });

    return new Set(rows.map((row) => row.employeeId));
  }

  /** The employee with the smallest employee code who holds an effective IT_ADMIN grant on an account that can act, or null. */
  async findFirstUsableItAdminEmployeeId(tx?: DbTx): Promise<string | null> {
    const row = await (tx ?? this.prisma).appUser.findFirst({
      where: {
        status: 'ACTIVE',
        activationState: 'ACTIVATED',
        employee: { status: 'ACTIVE' },
        roleGrants: { some: { role: 'IT_ADMIN', revokedAt: null } },
      },
      orderBy: { employee: { employeeCode: 'asc' } },
      select: { employeeId: true },
    });

    return row?.employeeId ?? null;
  }

  /**
   * The employee who holds the FINANCE role on an account that can act, if there is one (at most one account holds it, `QĐ-67e`):
   * the person a review of Finance is given to.
   */
  async findUsableFinanceEmployeeId(tx?: DbTx): Promise<string | null> {
    const row = await (tx ?? this.prisma).appUser.findFirst({
      where: {
        status: 'ACTIVE',
        activationState: 'ACTIVATED',
        employee: { status: 'ACTIVE' },
        roleGrants: { some: { role: 'FINANCE', revokedAt: null } },
      },
      select: { employeeId: true },
    });

    return row?.employeeId ?? null;
  }

  /** The employee who holds the SUPER_ADMIN role on an account that can act (there is one), or null: who is told to configure a role. */
  async findUsableSuperAdminEmployeeId(tx?: DbTx): Promise<string | null> {
    const row = await (tx ?? this.prisma).appUser.findFirst({
      where: {
        status: 'ACTIVE',
        activationState: 'ACTIVATED',
        employee: { status: 'ACTIVE' },
        roleGrants: { some: { role: 'SUPER_ADMIN', revokedAt: null } },
      },
      select: { employeeId: true },
    });

    return row?.employeeId ?? null;
  }

  /** The employee behind each of these accounts, by account id; an account that does not exist is absent. */
  async employeeIdsOfAccounts(appUserIds: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    if (appUserIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).appUser.findMany({
      where: { id: { in: [...appUserIds] } },
      select: { id: true, employeeId: true },
    });

    return new Map(rows.map((row) => [row.id, row.employeeId]));
  }

  /** How many IT Admins other than this employee can act: an active, activated account with the role, of someone still working. */
  countUsableItAdminsExcept(employeeId: string, tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).appUser.count({
      where: {
        employeeId: { not: employeeId },
        status: 'ACTIVE',
        activationState: 'ACTIVATED',
        employee: { status: 'ACTIVE' },
        roleGrants: { some: { role: 'IT_ADMIN', revokedAt: null } },
      },
    });
  }

  /** How the login email of the account was verified; null when it never was (an account not yet activated). */
  async readEmailVerificationSource(tx: DbTx, appUserId: string): Promise<string | null> {
    const row = await tx.appUser.findUnique({ where: { id: appUserId }, select: { emailVerificationSource: true } });

    return row?.emailVerificationSource ?? null;
  }

  /** Moves the account to a login email that was confirmed by a recovery link (US-01-09 AC-10). */
  async changeLoginEmail(
    tx: DbTx,
    appUserId: string,
    input: { loginEmail: string; normalizedLoginEmail: string; now: Date },
  ): Promise<void> {
    await tx.appUser.update({
      where: { id: appUserId },
      data: {
        loginEmail: input.loginEmail,
        normalizedLoginEmail: input.normalizedLoginEmail,
        emailVerificationSource: 'RECOVERY_VERIFIED',
        emailVerifiedAt: input.now,
      },
    });
  }

  async findAccountIdByEmployee(tx: DbTx, employeeId: string): Promise<string | null> {
    const row = await tx.appUser.findUnique({ where: { employeeId }, select: { id: true } });

    return row?.id ?? null;
  }

  async findAccountRecord(appUserId: string, tx?: DbTx): Promise<AccountRecord | null> {
    return (tx ?? this.prisma).appUser.findUnique({ where: { id: appUserId }, select: ACCOUNT_RECORD_SELECT });
  }

  async listAccountRecords(filter: AccountListFilter): Promise<{ items: AccountRecord[]; total: number }> {
    const where = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.activationState ? { activationState: filter.activationState } : {}),
      ...(filter.role ? { roleGrants: { some: { role: filter.role, revokedAt: null } } } : {}),
      ...(filter.employeeLeft === undefined ? {} : { employeeLeftOn: filter.employeeLeft ? { not: null } : null }),
    };
    // One snapshot for the page and the count (database rules; same as the catalog): otherwise an
    // account created in between makes totalItems disagree with the rows just returned (R-14).
    return this.prisma.$transaction(
      async (tx) => {
        const items = await tx.appUser.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
          select: ACCOUNT_RECORD_SELECT,
        });
        const total = await tx.appUser.count({ where });
        return { items, total };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  /** Writes the day the person behind the account left, once (a trigger refuses a change); nothing when the employee has no account. */
  async setEmployeeLeftOn(tx: DbTx, employeeId: string, leftOn: BusinessDate): Promise<void> {
    await tx.$executeRaw`UPDATE app_users SET employee_left_on = ${leftOn}::date, updated_at = now()
       WHERE employee_id = ${employeeId}::uuid AND employee_left_on IS NULL`;
  }

  async setStatus(tx: DbTx, appUserId: string, status: 'ACTIVE' | 'LOCKED'): Promise<void> {
    await tx.appUser.update({ where: { id: appUserId }, data: { status } });
  }

  async markActivated(tx: DbTx, appUserId: string, now: Date): Promise<void> {
    await tx.appUser.update({
      where: { id: appUserId },
      data: { activationState: 'ACTIVATED', emailVerificationSource: 'INVITATION_REDEEMED', emailVerifiedAt: now },
    });
  }

  /** Locks the account for update and reads it. Null when it does not exist. */
  async lockAndReadAccount(tx: DbTx, appUserId: string): Promise<AccountRecord | null> {
    if (!(await this.lockAppUser(tx, appUserId, 'UPDATE'))) return null;
    // A separate statement after the lock, so what is read is what the lock now protects (rule 7).

    return this.findAccountRecord(appUserId, tx);
  }
}
