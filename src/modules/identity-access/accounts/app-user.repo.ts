import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AccountListFilter, AccountRecord, AccountSnapshot, CreateAppUserInput } from '../identity-access.types';

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

  /** Among the employee ids given, those whose account is active and activated and holds an effective IT_ADMIN grant. */
  async findUsableItAdminEmployeeIds(employeeIds: readonly string[]): Promise<Set<string>> {
    if (employeeIds.length === 0) return new Set();
    const rows = await this.prisma.appUser.findMany({
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
