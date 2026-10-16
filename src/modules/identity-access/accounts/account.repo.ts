import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  AccountListFilter,
  AccountRecord,
  AccountSnapshot,
  ActionTokenRevokedReason,
  ActionTokenSnapshot,
  AppRole,
  CreateAppUserInput,
  RoleGrantRecord,
} from '../identity-access.types';

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

const TOKEN_SELECT = {
  tokenHash: true,
  appUserId: true,
  purpose: true,
  expiresAt: true,
  consumedAt: true,
  revokedAt: true,
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

/** Owns AppUser, PasswordCredential, RoleGrant and AccountActionToken. */
@Injectable()
export class AccountRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Unlocked lookup used before the transaction to decide what to verify. */
  async findAccountByLoginEmail(organizationId: string, normalizedLoginEmail: string): Promise<AccountSnapshot | null> {
    const row = await this.prisma.appUser.findUnique({
      where: { organizationId_normalizedLoginEmail: { organizationId, normalizedLoginEmail } },
      select: ACCOUNT_SELECT,
    });

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

  async createCredential(tx: DbTx, appUserId: string, hash: string, hashPolicyVersion: number): Promise<void> {
    await tx.passwordCredential.create({ data: { appUserId, hash, hashPolicyVersion } });
  }

  async grantRole(
    tx: DbTx,
    input: { organizationId: string; appUserId: string; role: AppRole; grantedBy?: string },
  ): Promise<{ id: string }> {
    return tx.roleGrant.create({ data: input, select: { id: true } });
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

  async effectiveRoles(appUserId: string, tx?: DbTx): Promise<AppRole[]> {
    const rows = await (tx ?? this.prisma).roleGrant.findMany({
      where: { appUserId, revokedAt: null },
      select: { role: true },
      orderBy: { role: 'asc' },
    });

    return rows.map((row) => row.role);
  }

  async effectiveRolesFor(appUserIds: string[]): Promise<Map<string, AppRole[]>> {
    const rows = await this.prisma.roleGrant.findMany({
      where: { appUserId: { in: appUserIds }, revokedAt: null },
      select: { appUserId: true, role: true },
      orderBy: { role: 'asc' },
    });
    const byUser = new Map<string, AppRole[]>();
    for (const row of rows) byUser.set(row.appUserId, [...(byUser.get(row.appUserId) ?? []), row.role]);

    return byUser;
  }

  async grantHistory(appUserId: string): Promise<RoleGrantRecord[]> {
    return this.prisma.roleGrant.findMany({
      where: { appUserId },
      orderBy: [{ grantedAt: 'asc' }, { id: 'asc' }],
      select: { role: true, grantedAt: true, revokedAt: true },
    });
  }

  /** True when any account in the organization holds an effective FINANCE grant, whatever its state (QĐ-67e). */
  async financeIsHeld(tx: DbTx, organizationId: string): Promise<boolean> {
    const row = await tx.roleGrant.findFirst({
      where: { organizationId, role: 'FINANCE', revokedAt: null },
      select: { id: true },
    });

    return row !== null;
  }

  async revokeRole(
    tx: DbTx,
    input: { appUserId: string; role: AppRole; revokedBy: string; now: Date },
  ): Promise<boolean> {
    const result = await tx.roleGrant.updateMany({
      where: { appUserId: input.appUserId, role: input.role, revokedAt: null },
      data: { revokedAt: input.now, revokedBy: input.revokedBy },
    });

    return result.count === 1;
  }

  async insertActionToken(
    tx: DbTx,
    input: { tokenHash: string; appUserId: string; expiresAt: Date; createdBy: string },
  ): Promise<void> {
    await tx.accountActionToken.create({ data: { ...input, purpose: 'INVITE' } });
  }

  /** Tokens that are neither consumed nor revoked, whether or not they have expired. */
  async findUsableTokens(tx: DbTx, appUserId: string): Promise<ActionTokenSnapshot[]> {
    return tx.accountActionToken.findMany({
      where: { appUserId, consumedAt: null, revokedAt: null },
      select: TOKEN_SELECT,
    });
  }

  async revokeTokens(tx: DbTx, tokenHashes: string[], reason: ActionTokenRevokedReason, now: Date): Promise<void> {
    if (tokenHashes.length === 0) return;

    await tx.accountActionToken.updateMany({
      where: { tokenHash: { in: tokenHashes }, consumedAt: null, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
  }

  /** Unlocked: maps a presented token to its account so the account can be locked first. */
  async findActionTokenOwner(tokenHash: string): Promise<string | null> {
    const row = await this.prisma.accountActionToken.findUnique({ where: { tokenHash }, select: { appUserId: true } });

    return row?.appUserId ?? null;
  }

  async lockActionToken(tx: DbTx, tokenHash: string): Promise<ActionTokenSnapshot | null> {
    const locked = await tx.$queryRaw<
      { token_hash: string }[]
    >`SELECT token_hash FROM account_action_tokens WHERE token_hash = ${tokenHash} FOR UPDATE`;
    if (locked.length === 0) return null;

    return tx.accountActionToken.findUnique({ where: { tokenHash }, select: TOKEN_SELECT });
  }

  async consumeToken(tx: DbTx, tokenHash: string, now: Date): Promise<void> {
    await tx.accountActionToken.update({ where: { tokenHash }, data: { consumedAt: now } });
  }

  /**
   * Unlocked read for the dispatcher: the Employee behind this token when the account side would
   * accept it right now, otherwise null. Whether that Employee has left is the organization
   * module's to say, so the caller asks it.
   */
  async redeemableTokenEmployeeId(tokenHash: string, now: Date): Promise<string | null> {
    const row = await this.prisma.accountActionToken.findUnique({
      where: { tokenHash },
      select: {
        consumedAt: true,
        revokedAt: true,
        expiresAt: true,
        appUser: { select: { status: true, activationState: true, employeeId: true } },
      },
    });

    const redeemable =
      row !== null &&
      row.consumedAt === null &&
      row.revokedAt === null &&
      row.expiresAt > now &&
      row.appUser.status === 'ACTIVE' &&
      row.appUser.activationState === 'INVITED';

    return redeemable ? row.appUser.employeeId : null;
  }

  /** The newest token of an account, used or not, with its expiry, for the detail view. */
  async latestToken(appUserId: string): Promise<ActionTokenSnapshot | null> {
    return this.prisma.accountActionToken.findFirst({
      where: { appUserId },
      orderBy: { createdAt: 'desc' },
      select: TOKEN_SELECT,
    });
  }

  /** Locks the account for update and reads it. Null when it does not exist. */
  async lockAndReadAccount(tx: DbTx, appUserId: string): Promise<AccountRecord | null> {
    if (!(await this.lockAppUser(tx, appUserId, 'UPDATE'))) return null;
    // A separate statement after the lock, so what is read is what the lock now protects (rule 7).

    return this.findAccountRecord(appUserId, tx);
  }
}
