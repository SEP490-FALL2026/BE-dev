import { Injectable } from '@nestjs/common';
import { Prisma, type LicenseKeyStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

/**
 * The purchase a key belongs to: its lot, and for a key that was entered before lots existed (or against a subscription a lot was born from, which
 * has the same id) its subscription. Everything that asks "the keys of this purchase" reads both columns, so it is right before and after M6.
 */
function purchaseIdOf(row: { licenseLotId: string | null; subscriptionId: string | null }): string {
  const purchaseId = row.licenseLotId ?? row.subscriptionId;
  if (purchaseId === null) throw new Error('A license key belongs to a lot or a subscription.');

  return purchaseId;
}

/** The keys of a purchase, by the lot or by the subscription. */
const ofPurchase = (purchaseId: string): Prisma.LicenseKeyWhereInput => ({
  OR: [{ licenseLotId: purchaseId }, { subscriptionId: purchaseId }],
});

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
  /** How many machines the key may be on at once, and how many it was already on when it was entered (a value written once). */
  maxActivations: number;
  initialActivationsUsed: number;
  /** The version of the row the caller read: a write that raises the cap names it (`expectedUpdatedAt`). */
  updatedAt: Date;
}

/** What a page of keys counts of their activations, from the rows of `device_activations`. */
export interface LicenseKeyActivationCounts {
  /** The activations ever opened by an operation on the key, closed or not (the ones told at import are not here). */
  operations: number;
  /** The activations open now, of every origin. */
  open: number;
}

/** What a key held under its row lock tells the rules of the pool. */
export interface LicenseKeyHeld {
  id: string;
  subscriptionId: string;
  status: LicenseKeyStatus;
  assignmentId: string | null;
  withdrawnAt: Date | null;
  maxActivations: number;
  updatedAt: Date;
}

const LISTED = {
  id: true,
  subscriptionId: true,
  licenseLotId: true,
  masked: true,
  status: true,
  importedAt: true,
  assignmentId: true,
  withdrawnAt: true,
  withdrawalReason: true,
  maxActivations: true,
  initialActivationsUsed: true,
  updatedAt: true,
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
  /** The subscription the key is entered against; a key of a lot that came from no subscription has none. */
  subscriptionId?: string | null;
  /** The lot of the key; a key entered against a subscription a lot was born from takes that lot in the database. */
  licenseLotId?: string | null;
  /** Who bears the cost: false for a key bought for a request, true for the others (the default of the keys entered for an opening). */
  costBorne?: boolean;
  fingerprint: string;
  masked: string;
  ciphertext: Buffer;
  cipherKeyId: string;
  importedByAppUserId: string;
  maxActivations: number;
  initialActivationsUsed: number;
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
      data: keys.map((key) => ({
        ...key,
        costBorne: key.costBorne ?? true,
        ciphertext: new Uint8Array(key.ciphertext),
      })),
      skipDuplicates: true,
      select: { id: true },
    });

    return new Set(kept.map((row) => row.id));
  }

  /** The keys of the purchase that are in use or can still be given out: assigned, or in the store and not withdrawn. */
  countUsable(subscriptionId: string, tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).licenseKey.count({ where: { ...ofPurchase(subscriptionId), withdrawnAt: null } });
  }

  /**
   * For each of these purchases, the keys in the store and not withdrawn, those given to a seat and those withdrawn from the store (a withdrawn
   * key stays in the store and is never given out again), in one statement whatever their number. A purchase with no key is absent.
   */
  async countsOfSubscriptions(
    subscriptionIds: readonly string[],
  ): Promise<Map<string, { inStore: number; assigned: number; withdrawn: number }>> {
    const result = new Map<string, { inStore: number; assigned: number; withdrawn: number }>();
    if (subscriptionIds.length === 0) return result;
    const rows = await this.prisma.$queryRaw<
      { subscription_id: string; in_store: bigint; assigned: bigint; withdrawn: bigint }[]
    >`
      SELECT COALESCE("license_lot_id", "subscription_id") AS subscription_id,
             count(*) FILTER (WHERE "status" = 'IN_STORE' AND "withdrawn_at" IS NULL) AS in_store,
             count(*) FILTER (WHERE "status" = 'ASSIGNED') AS assigned,
             count(*) FILTER (WHERE "withdrawn_at" IS NOT NULL) AS withdrawn
        FROM "license_keys"
       WHERE COALESCE("license_lot_id", "subscription_id") = ANY(${[...subscriptionIds]}::uuid[])
       GROUP BY COALESCE("license_lot_id", "subscription_id")`;
    for (const row of rows) {
      result.set(row.subscription_id, {
        inStore: Number(row.in_store),
        assigned: Number(row.assigned),
        withdrawn: Number(row.withdrawn),
      });
    }

    return result;
  }

  /**
   * One page, the total for the filter, the keys still usable, those given to a seat, the licenses held on machines and the activations of
   * the keys of the page, all from one snapshot: a key imported meanwhile is in none or in all. The activations of the page are counted by one
   * statement whatever the number of keys.
   */
  async page(input: {
    subscriptionId: string;
    status?: LicenseKeyStatus;
    withdrawn?: boolean;
    skip: number;
    take: number;
  }): Promise<{
    items: LicenseKeyListed[];
    total: number;
    usable: number;
    assigned: number;
    deviceOccupied: number;
    counts: Map<string, LicenseKeyActivationCounts>;
  }> {
    const where: Prisma.LicenseKeyWhereInput = {
      ...ofPurchase(input.subscriptionId),
      ...(input.status ? { status: input.status } : {}),
      ...(input.withdrawn === undefined ? {} : { withdrawnAt: input.withdrawn ? { not: null } : null }),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.licenseKey.findMany({
          where,
          orderBy: [{ importedAt: 'asc' }, { id: 'asc' }],
          skip: input.skip,
          take: input.take,
          select: LISTED,
        });
        const items = rows.map(listed);

        return {
          items,
          total: await tx.licenseKey.count({ where }),
          usable: await this.countUsable(input.subscriptionId, tx),
          assigned: await tx.licenseKey.count({ where: { ...ofPurchase(input.subscriptionId), status: 'ASSIGNED' } }),
          deviceOccupied: await this.deviceOccupiedOf(input.subscriptionId, tx),
          counts: await this.activationCountsOf(
            items.map((item) => item.id),
            tx,
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * For each of these keys, the activations an operation opened and those open now, in one statement whatever their number. A key with no
   * activation is absent.
   */
  async activationCountsOf(keyIds: readonly string[], tx?: DbTx): Promise<Map<string, LicenseKeyActivationCounts>> {
    const result = new Map<string, LicenseKeyActivationCounts>();
    if (keyIds.length === 0) return result;
    const rows = await (tx ?? this.prisma).$queryRaw<{ license_key_id: string; operations: bigint; open: bigint }[]>`
      SELECT license_key_id,
             count(*) FILTER (WHERE origin = 'OPERATION') AS operations,
             count(*) FILTER (WHERE deactivated_at IS NULL) AS open
        FROM device_activations
       WHERE license_key_id = ANY(${[...keyIds]}::uuid[])
       GROUP BY license_key_id`;
    for (const row of rows) {
      result.set(row.license_key_id, { operations: Number(row.operations), open: Number(row.open) });
    }

    return result;
  }

  /** The licenses of a purchase held on machines: the open activations of its keys and the closed ones whose license was lost with the machine. */
  async deviceOccupiedOf(subscriptionId: string, tx?: DbTx): Promise<number> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ occupied: bigint }[]>`
      SELECT device_activation_occupied(${subscriptionId}::uuid) AS occupied`;

    return Number(rows[0].occupied);
  }

  /** The licenses held on machines of each of these purchases, in one statement whatever their number; a purchase that holds none reads zero. */
  async deviceOccupiedOfMany(subscriptionIds: readonly string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (subscriptionIds.length === 0) return result;
    const rows = await this.prisma.$queryRaw<{ id: string; occupied: bigint }[]>`
      SELECT s.id AS id, device_activation_occupied(s.id) AS occupied
        FROM unnest(${[...subscriptionIds]}::uuid[]) AS s(id)`;
    for (const row of rows) result.set(row.id, Number(row.occupied));

    return result;
  }

  /** How many keys of the purchase are given to a seat. */
  countAssigned(subscriptionId: string, tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).licenseKey.count({ where: { ...ofPurchase(subscriptionId), status: 'ASSIGNED' } });
  }

  /** Raises the cap of activations of the key and answers it as a list shows it; the caller holds the row and judged the new cap. */
  async raiseMaxActivations(tx: DbTx, id: string, maxActivations: number): Promise<LicenseKeyListed> {
    return listed(await tx.licenseKey.update({ where: { id }, data: { maxActivations }, select: LISTED }));
  }

  async findSealed(tx: DbTx, id: string): Promise<LicenseKeySealed | null> {
    const row = await tx.licenseKey.findUnique({
      where: { id },
      select: {
        id: true,
        subscriptionId: true,
        licenseLotId: true,
        cipherKeyId: true,
        ciphertext: true,
        assignmentId: true,
        withdrawnAt: true,
      },
    });

    return row
      ? {
          id: row.id,
          subscriptionId: purchaseIdOf(row),
          cipherKeyId: row.cipherKeyId,
          ciphertext: Buffer.from(row.ciphertext),
          assignmentId: row.assignmentId,
          withdrawnAt: row.withdrawnAt,
        }
      : null;
  }

  /** The purchase of a key, read without a lock: what the caller locks first, before the key (`licenseKeyImport` order). */
  async subscriptionOf(tx: DbTx, id: string): Promise<string | null> {
    const row = await tx.licenseKey.findUnique({ where: { id }, select: { subscriptionId: true, licenseLotId: true } });

    return row ? purchaseIdOf(row) : null;
  }

  /** The key, locked for the transaction (`FOR UPDATE`): two IT Admins who give or withdraw the same key are served one after the other. */
  async lock(tx: DbTx, id: string): Promise<LicenseKeyHeld | null> {
    const rows = await tx.$queryRaw<LicenseKeyHeldRow[]>`
      SELECT "id", COALESCE("license_lot_id", "subscription_id") AS "subscription_id", "status"::text AS "status", "assignment_id", "withdrawn_at", "max_activations", "updated_at"
        FROM "license_keys" WHERE "id" = ${id}::uuid FOR UPDATE`;

    return rows[0] ? held(rows[0]) : null;
  }

  /** The key given to the assignment, locked for the transaction; null when the seat holds none (one granted before the key pool). */
  async lockOfAssignment(tx: DbTx, assignmentId: string): Promise<LicenseKeyHeld | null> {
    const rows = await tx.$queryRaw<LicenseKeyHeldRow[]>`
      SELECT "id", COALESCE("license_lot_id", "subscription_id") AS "subscription_id", "status"::text AS "status", "assignment_id", "withdrawn_at", "max_activations", "updated_at"
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
  async withdraw(
    tx: DbTx,
    id: string,
    withdrawal: { at: Date; byAppUserId: string; reason: string },
  ): Promise<LicenseKeyListed> {
    return listed(await tx.licenseKey.update({ where: { id }, data: withdrawalData(withdrawal), select: LISTED }));
  }
}

interface LicenseKeyHeldRow {
  id: string;
  subscription_id: string;
  status: LicenseKeyStatus;
  assignment_id: string | null;
  withdrawn_at: Date | null;
  max_activations: number;
  updated_at: Date;
}

/** A row of the list as the list shows it: the purchase of the key is its lot or its subscription. */
const listed = (row: Prisma.LicenseKeyGetPayload<{ select: typeof LISTED }>): LicenseKeyListed => ({
  id: row.id,
  subscriptionId: purchaseIdOf(row),
  masked: row.masked,
  status: row.status,
  importedAt: row.importedAt,
  assignmentId: row.assignmentId,
  withdrawnAt: row.withdrawnAt,
  withdrawalReason: row.withdrawalReason,
  maxActivations: row.maxActivations,
  initialActivationsUsed: row.initialActivationsUsed,
  updatedAt: row.updatedAt,
});

const held = (row: LicenseKeyHeldRow): LicenseKeyHeld => ({
  id: row.id,
  subscriptionId: row.subscription_id,
  status: row.status,
  assignmentId: row.assignment_id,
  withdrawnAt: row.withdrawn_at,
  maxActivations: row.max_activations,
  updatedAt: row.updated_at,
});

const withdrawalData = (withdrawal: { at: Date; byAppUserId: string; reason: string }) => ({
  withdrawnAt: withdrawal.at,
  withdrawnByAppUserId: withdrawal.byAppUserId,
  withdrawalReason: withdrawal.reason,
});
