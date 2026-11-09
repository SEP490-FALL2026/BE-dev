import { Injectable } from '@nestjs/common';
import { Prisma, type LicenseKeyStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

/** A key of the vault as a list shows it: never the key itself, its fingerprint or its ciphertext. */
export interface LicenseKeyListed {
  id: string;
  subscriptionId: string;
  masked: string;
  status: LicenseKeyStatus;
  importedAt: Date;
  /** The assignment the key is given to while it is assigned. */
  assignmentId: string | null;
  withdrawnAt: Date | null;
  withdrawalReason: string | null;
}

/** What a key held under its row lock tells the rules of the pool. */
export interface LicenseKeyHeld {
  id: string;
  subscriptionId: string;
  status: LicenseKeyStatus;
  assignmentId: string | null;
  withdrawnAt: Date | null;
}

const LISTED = {
  id: true,
  subscriptionId: true,
  masked: true,
  status: true,
  importedAt: true,
  assignmentId: true,
  withdrawnAt: true,
  withdrawalReason: true,
} as const;

/** What a reveal needs to open a key. */
export interface LicenseKeySealed {
  id: string;
  subscriptionId: string;
  cipherKeyId: string;
  ciphertext: Buffer;
  assignmentId: string | null;
  withdrawnAt: Date | null;
}

export interface NewLicenseKey {
  id: string;
  organizationId: string;
  subscriptionId: string;
  fingerprint: string;
  masked: string;
  ciphertext: Buffer;
  cipherKeyId: string;
  importedByAppUserId: string;
}

/**
 * The one writer of `license_keys`: a key is made once, never deleted; it moves between the store and one assignment, and a key withdrawn
 * from the store stays withdrawn (trigger `license_key_guard`).
 */
@Injectable()
export class LicenseKeyRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Keeps every key of the batch whose fingerprint is not already in the organization's vault, in one statement, and
   * answers the ids it kept. The database decides, so a key that two batches add at the same time is kept once: the
   * second waits for the first. The rows go in the order given (the caller sorts them by fingerprint), which is the order
   * the unique index is locked in, so two batches never wait for each other in a circle.
   */
  async insertManyIfNew(tx: DbTx, keys: readonly NewLicenseKey[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const kept = await tx.licenseKey.createManyAndReturn({
      data: keys.map((key) => ({ ...key, ciphertext: new Uint8Array(key.ciphertext) })),
      skipDuplicates: true,
      select: { id: true },
    });

    return new Set(kept.map((row) => row.id));
  }

  /** The keys of the purchase that are in use or can still be given out: assigned, or in the store and not withdrawn. */
  countUsable(subscriptionId: string, tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).licenseKey.count({ where: { subscriptionId, withdrawnAt: null } });
  }

  /** One page, the total for the filter and the keys still usable, all from one snapshot: a key imported meanwhile is in none or in all. */
  async page(input: {
    subscriptionId: string;
    status?: LicenseKeyStatus;
    withdrawn?: boolean;
    skip: number;
    take: number;
  }): Promise<{ items: LicenseKeyListed[]; total: number; usable: number }> {
    const where = {
      subscriptionId: input.subscriptionId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.withdrawn === undefined ? {} : { withdrawnAt: input.withdrawn ? { not: null } : null }),
    };

    return this.prisma.$transaction(
      async (tx) => ({
        items: await tx.licenseKey.findMany({
          where,
          orderBy: [{ importedAt: 'asc' }, { id: 'asc' }],
          skip: input.skip,
          take: input.take,
          select: LISTED,
        }),
        total: await tx.licenseKey.count({ where }),
        usable: await this.countUsable(input.subscriptionId, tx),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findSealed(tx: DbTx, id: string): Promise<LicenseKeySealed | null> {
    const row = await tx.licenseKey.findUnique({
      where: { id },
      select: {
        id: true,
        subscriptionId: true,
        cipherKeyId: true,
        ciphertext: true,
        assignmentId: true,
        withdrawnAt: true,
      },
    });

    return row ? { ...row, ciphertext: Buffer.from(row.ciphertext) } : null;
  }

  /** The purchase of a key, read without a lock: what the caller locks first, before the key (`licenseKeyImport` order). */
  async subscriptionOf(tx: DbTx, id: string): Promise<string | null> {
    const row = await tx.licenseKey.findUnique({ where: { id }, select: { subscriptionId: true } });

    return row?.subscriptionId ?? null;
  }

  /** The key, locked for the transaction (`FOR UPDATE`): two IT Admins who give or withdraw the same key are served one after the other. */
  async lock(tx: DbTx, id: string): Promise<LicenseKeyHeld | null> {
    const rows = await tx.$queryRaw<LicenseKeyHeldRow[]>`
      SELECT "id", "subscription_id", "status"::text AS "status", "assignment_id", "withdrawn_at"
        FROM "license_keys" WHERE "id" = ${id}::uuid FOR UPDATE`;

    return rows[0] ? held(rows[0]) : null;
  }

  /** The key given to the assignment, locked for the transaction; null when the seat holds none (one granted before the key pool). */
  async lockOfAssignment(tx: DbTx, assignmentId: string): Promise<LicenseKeyHeld | null> {
    const rows = await tx.$queryRaw<LicenseKeyHeldRow[]>`
      SELECT "id", "subscription_id", "status"::text AS "status", "assignment_id", "withdrawn_at"
        FROM "license_keys" WHERE "assignment_id" = ${assignmentId}::uuid FOR UPDATE`;

    return rows[0] ? held(rows[0]) : null;
  }

  /** Gives the key to the assignment. */
  async assign(tx: DbTx, id: string, assignmentId: string): Promise<void> {
    await tx.licenseKey.update({ where: { id }, data: { status: 'ASSIGNED', assignmentId } });
  }

  /** Puts the key back in the store, withdrawn from it at once when a withdrawal is given: one write, so it is never free in between. */
  async returnToStore(
    tx: DbTx,
    id: string,
    withdrawal: { at: Date; byAppUserId: string; reason: string } | null,
  ): Promise<void> {
    await tx.licenseKey.update({
      where: { id },
      data: {
        status: 'IN_STORE',
        assignmentId: null,
        ...(withdrawal ? withdrawalData(withdrawal) : {}),
      },
    });
  }

  /** Withdraws a free key from the store, with its reason, and answers it as a list shows it. */
  withdraw(
    tx: DbTx,
    id: string,
    withdrawal: { at: Date; byAppUserId: string; reason: string },
  ): Promise<LicenseKeyListed> {
    return tx.licenseKey.update({ where: { id }, data: withdrawalData(withdrawal), select: LISTED });
  }
}

interface LicenseKeyHeldRow {
  id: string;
  subscription_id: string;
  status: LicenseKeyStatus;
  assignment_id: string | null;
  withdrawn_at: Date | null;
}

const held = (row: LicenseKeyHeldRow): LicenseKeyHeld => ({
  id: row.id,
  subscriptionId: row.subscription_id,
  status: row.status,
  assignmentId: row.assignment_id,
  withdrawnAt: row.withdrawn_at,
});

const withdrawalData = (withdrawal: { at: Date; byAppUserId: string; reason: string }) => ({
  withdrawnAt: withdrawal.at,
  withdrawnByAppUserId: withdrawal.byAppUserId,
  withdrawalReason: withdrawal.reason,
});
