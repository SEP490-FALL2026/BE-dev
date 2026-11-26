import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  ActivationPageFilter,
  ActivationPageResult,
  ActivationRecord,
  DeviceActivationEndCause,
  DeviceActivationOrigin,
} from './device-activation.types';

export interface KeyActivationMeta {
  id: string;
  organizationId: string;
  subscriptionId: string;
  planId: string;
  masked: string;
  withdrawnAt: Date | null;
  maxActivations: number;
  initialActivationsUsed: number;
}

const ACTIVATION_SELECT = {
  id: true,
  organizationId: true,
  deviceId: true,
  planId: true,
  licenseKeyId: true,
  origin: true,
  movedFromActivationId: true,
  activatedOn: true,
  activatedAt: true,
  activatedByAppUserId: true,
  overActivationCap: true,
  deactivatedOn: true,
  deactivatedAt: true,
  endCause: true,
  licenseReleased: true,
  closedByAppUserId: true,
  licenseKey: {
    select: {
      subscriptionId: true,
      masked: true,
      withdrawnAt: true,
    },
  },
} satisfies Prisma.DeviceActivationSelect;

type ActivationRow = Prisma.DeviceActivationGetPayload<{ select: typeof ACTIVATION_SELECT }>;

function toActivationRecord(row: ActivationRow): ActivationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    deviceId: row.deviceId,
    planId: row.planId,
    licenseKeyId: row.licenseKeyId,
    subscriptionId: row.licenseKey?.subscriptionId ?? null,
    keyMasked: row.licenseKey?.masked ?? null,
    keyWithdrawn: row.licenseKey ? row.licenseKey.withdrawnAt !== null : false,
    origin: row.origin,
    movedFromActivationId: row.movedFromActivationId,
    activatedOn: fromDateColumn(row.activatedOn),
    activatedAt: row.activatedAt,
    activatedByAppUserId: row.activatedByAppUserId,
    overActivationCap: row.overActivationCap,
    deactivatedOn: row.deactivatedOn ? fromDateColumn(row.deactivatedOn) : null,
    deactivatedAt: row.deactivatedAt,
    endCause: row.endCause,
    licenseReleased: row.licenseReleased,
    closedByAppUserId: row.closedByAppUserId,
  };
}

/**
 * Persistence for machine software activations (`device_activations`), including PostgreSQL lot-occupancy queries
 * backed by `device_activation_occupied(uuid)` so seat capacity checks share the exact database definition.
 */
@Injectable()
export class DeviceActivationRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findKeyWithMeta(tx: DbTx, licenseKeyId: string): Promise<KeyActivationMeta | null> {
    const row = await tx.licenseKey.findUnique({
      where: { id: licenseKeyId },
      select: {
        id: true,
        organizationId: true,
        subscriptionId: true,
        licenseLotId: true,
        masked: true,
        withdrawnAt: true,
        maxActivations: true,
        initialActivationsUsed: true,
        subscription: { select: { planId: true } },
        licenseLot: { select: { planId: true } },
      },
    });
    if (!row) return null;

    // The purchase of a key is its lot, or its subscription for a key entered before lots (a lot born from a subscription has its id).
    const purchaseId = row.licenseLotId ?? row.subscriptionId;
    const plan = row.licenseLot ?? row.subscription;
    if (purchaseId === null || plan === null) throw new Error('A license key belongs to a lot or a subscription.');

    return {
      id: row.id,
      organizationId: row.organizationId,
      subscriptionId: purchaseId,
      planId: plan.planId,
      masked: row.masked,
      withdrawnAt: row.withdrawnAt,
      maxActivations: row.maxActivations,
      initialActivationsUsed: row.initialActivationsUsed,
    };
  }

  /** Locks the key `FOR SHARE` (tier 6b) after the caller has locked its subscription (tier 6). */
  async lockKeyForShare(tx: DbTx, licenseKeyId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM license_keys WHERE id = ${licenseKeyId}::uuid FOR SHARE`;
  }

  /** Reads `subscriptionId` keyed by `licenseKeyId` without locking; missing keys are omitted. */
  async keySubscriptionIds(licenseKeyIds: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (licenseKeyIds.length === 0) return result;
    const rows = await (tx ?? this.prisma).licenseKey.findMany({
      where: { id: { in: [...licenseKeyIds] } },
      select: { id: true, subscriptionId: true, licenseLotId: true },
    });
    for (const row of rows) {
      const purchaseId = row.licenseLotId ?? row.subscriptionId;
      if (purchaseId !== null) result.set(row.id, purchaseId);
    }

    return result;
  }

  countOperationActivationsOfKey(tx: DbTx, licenseKeyId: string): Promise<number> {
    return tx.deviceActivation.count({ where: { licenseKeyId, origin: 'OPERATION' } });
  }

  async occupiedBySubscription(subscriptionId: string, client?: DbTx): Promise<number> {
    const db = client ?? this.prisma;
    const rows = await db.$queryRaw<{ occupied: bigint }[]>`
      SELECT device_activation_occupied(${subscriptionId}::uuid) AS occupied`;

    return Number(rows[0]?.occupied ?? 0n);
  }

  /**
   * For each of these lots, the keys in the store and not withdrawn, those given to a person and those withdrawn, in one statement. A lot with no key is absent.
   * Read here, next to the licenses the lot gives out, so the seat reader that binds to the catalog does not depend on the vault of keys.
   */
  async keyCountsOfLots(
    lotIds: readonly string[],
    client?: DbTx,
  ): Promise<Map<string, { inStore: number; assigned: number; withdrawn: number }>> {
    const result = new Map<string, { inStore: number; assigned: number; withdrawn: number }>();
    if (lotIds.length === 0) return result;
    const rows = await (client ?? this.prisma).$queryRaw<
      { lot_id: string; in_store: bigint; assigned: bigint; withdrawn: bigint }[]
    >`
      SELECT COALESCE(license_lot_id, subscription_id) AS lot_id,
             count(*) FILTER (WHERE status = 'IN_STORE' AND withdrawn_at IS NULL) AS in_store,
             count(*) FILTER (WHERE status = 'ASSIGNED') AS assigned,
             count(*) FILTER (WHERE withdrawn_at IS NOT NULL) AS withdrawn
        FROM license_keys
       WHERE COALESCE(license_lot_id, subscription_id) = ANY(${[...lotIds]}::uuid[])
       GROUP BY COALESCE(license_lot_id, subscription_id)`;
    for (const row of rows) {
      result.set(row.lot_id, {
        inStore: Number(row.in_store),
        assigned: Number(row.assigned),
        withdrawn: Number(row.withdrawn),
      });
    }

    return result;
  }

  /** Open `GRANT` tasks for K4 `planIds` that do not hold an assigned license key yet. */
  async openGrantTasksWithoutKeyOfPlans(
    planIds: readonly string[],
    client?: DbTx,
  ): Promise<
    Array<{ taskId: string; planId: string; requestId: string | null; subscriptionId: string | null; createdAt: Date }>
  > {
    if (planIds.length === 0) return [];
    const rows = await (client ?? this.prisma).$queryRaw<
      {
        task_id: string;
        plan_id: string;
        request_id: string | null;
        subscription_id: string | null;
        created_at: Date;
      }[]
    >`
      SELECT t."id" AS task_id, a."plan_id", t."request_id", a."subscription_id", t."created_at"
        FROM "provisioning_tasks" t
        JOIN "license_assignments" a ON a."id" = t."assignment_id"
       WHERE a."plan_id" = ANY(${[...planIds]}::uuid[])
         AND t."kind" = 'GRANT'
         AND t."status" NOT IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED')
         AND NOT EXISTS (SELECT 1 FROM "license_keys" g WHERE g."assignment_id" = a."id")
       ORDER BY t."created_at" ASC, t."id" ASC`;

    return rows.map((row) => ({
      taskId: row.task_id,
      planId: row.plan_id,
      requestId: row.request_id,
      subscriptionId: row.subscription_id,
      createdAt: row.created_at,
    }));
  }

  async occupiedBySubscriptions(subscriptionIds: readonly string[], client?: DbTx): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (subscriptionIds.length === 0) return result;
    const db = client ?? this.prisma;
    const rows = await db.$queryRaw<{ id: string; occupied: bigint }[]>`
      SELECT id, device_activation_occupied(id) AS occupied
        FROM unnest(${[...subscriptionIds]}::uuid[]) AS id`;
    for (const row of rows) {
      if (row.occupied > 0n) result.set(row.id, Number(row.occupied));
    }

    return result;
  }

  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      deviceId: string;
      planId: string;
      licenseKeyId: string | null;
      origin: DeviceActivationOrigin;
      movedFromActivationId: string | null;
      activatedOn: BusinessDate;
      activatedAt: Date;
      activatedByAppUserId: string;
      overActivationCap: boolean;
    },
  ): Promise<ActivationRecord> {
    const row = await tx.deviceActivation.create({
      data: {
        organizationId: input.organizationId,
        deviceId: input.deviceId,
        planId: input.planId,
        licenseKeyId: input.licenseKeyId,
        origin: input.origin,
        movedFromActivationId: input.movedFromActivationId,
        activatedOn: toDateColumn(input.activatedOn),
        activatedAt: input.activatedAt,
        activatedByAppUserId: input.activatedByAppUserId,
        overActivationCap: input.overActivationCap,
      },
      select: ACTIVATION_SELECT,
    });

    return toActivationRecord(row);
  }

  async findById(id: string, tx?: DbTx): Promise<ActivationRecord | null> {
    const row = await (tx ?? this.prisma).deviceActivation.findUnique({ where: { id }, select: ACTIVATION_SELECT });

    return row ? toActivationRecord(row) : null;
  }

  /** Locks one activation row `FOR UPDATE` (tier 8) after any subscription/key locks are held. */
  async lockById(tx: DbTx, id: string): Promise<ActivationRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_activations WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.findById(id, tx);
  }

  /** Locks all open activations of a device in ascending `id` order `FOR UPDATE`. */
  async lockOpenOfDevice(tx: DbTx, deviceId: string): Promise<ActivationRecord[]> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_activations
       WHERE device_id = ${deviceId}::uuid AND deactivated_at IS NULL
       ORDER BY id ASC FOR UPDATE`;
    if (locked.length === 0) return [];
    const rows = await tx.deviceActivation.findMany({
      where: { deviceId, deactivatedAt: null },
      orderBy: [{ activatedAt: 'asc' }, { id: 'asc' }],
      select: ACTIVATION_SELECT,
    });

    return rows.map(toActivationRecord);
  }

  async close(
    tx: DbTx,
    id: string,
    data: {
      deactivatedOn: BusinessDate;
      deactivatedAt: Date;
      endCause: DeviceActivationEndCause;
      licenseReleased: boolean | null;
      closedByAppUserId: string;
    },
  ): Promise<ActivationRecord> {
    const row = await tx.deviceActivation.update({
      where: { id },
      data: {
        deactivatedOn: toDateColumn(data.deactivatedOn),
        deactivatedAt: data.deactivatedAt,
        endCause: data.endCause,
        licenseReleased: data.licenseReleased,
        closedByAppUserId: data.closedByAppUserId,
      },
      select: ACTIVATION_SELECT,
    });

    return toActivationRecord(row);
  }

  async openOfDevice(deviceId: string, tx?: DbTx): Promise<ActivationRecord[]> {
    const rows = await (tx ?? this.prisma).deviceActivation.findMany({
      where: { deviceId, deactivatedAt: null },
      orderBy: [{ activatedAt: 'asc' }, { id: 'asc' }],
      select: ACTIVATION_SELECT,
    });

    return rows.map(toActivationRecord);
  }

  async hasKeyActivationHistory(deviceId: string, tx?: DbTx): Promise<boolean> {
    const count = await (tx ?? this.prisma).deviceActivation.count({
      where: { deviceId, licenseKeyId: { not: null } },
      take: 1,
    });

    return count > 0;
  }

  async page(
    filter: ActivationPageFilter,
    pagination: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<ActivationPageResult> {
    if (filter.deviceIds && filter.deviceIds.length === 0) return { items: [], total: 0 };
    const where: Prisma.DeviceActivationWhereInput = {
      organizationId: filter.organizationId,
      ...(filter.deviceIds ? { deviceId: { in: [...filter.deviceIds] } } : {}),
      ...(filter.planId ? { planId: filter.planId } : {}),
      ...(filter.licenseKeyId ? { licenseKeyId: filter.licenseKeyId } : {}),
      ...(filter.state === 'OPEN' ? { deactivatedAt: null } : {}),
      ...(filter.state === 'CLOSED' ? { deactivatedAt: { not: null } } : {}),
      ...(filter.needsKeyReplacement === true
        ? { deactivatedAt: null, licenseKey: { withdrawnAt: { not: null } } }
        : {}),
      ...(filter.needsKeyReplacement === false
        ? { OR: [{ deactivatedAt: { not: null } }, { licenseKeyId: null }, { licenseKey: { withdrawnAt: null } }] }
        : {}),
    };
    const run = async (client: DbTx | PrismaService) => {
      const rows = await client.deviceActivation.findMany({
        where,
        orderBy: [{ activatedAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
        select: ACTIVATION_SELECT,
      });
      const total = await client.deviceActivation.count({ where });

      return { items: rows.map(toActivationRecord), total };
    };

    return tx ? run(tx) : this.prisma.$transaction((trx) => run(trx), { isolationLevel: 'RepeatableRead' });
  }
}
