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
        masked: true,
        withdrawnAt: true,
        maxActivations: true,
        initialActivationsUsed: true,
        subscription: { select: { planId: true } },
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      organizationId: row.organizationId,
      subscriptionId: row.subscriptionId,
      planId: row.subscription.planId,
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
      select: { id: true, subscriptionId: true },
    });
    for (const row of rows) {
      result.set(row.id, row.subscriptionId);
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
