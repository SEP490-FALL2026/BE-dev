import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AllocationLineRecord, AllocationVersion } from './cost-allocation.types';

const WITH_LINES = { lines: { orderBy: { costCenterId: 'asc' } } } as const;
type VersionRow = Prisma.SubscriptionCostAllocationVersionGetPayload<{ include: typeof WITH_LINES }>;

const toVersion = (row: VersionRow): AllocationVersion => ({
  subscriptionId: row.subscriptionId,
  version: row.version,
  lines: row.lines.map((line) => ({ costCenterId: line.costCenterId, ratioBp: line.ratioBp })),
  declaredByAppUserId: row.declaredByAppUserId,
  declaredAt: row.declaredAt,
});

/**
 * The one writer of `subscription_cost_allocations`, `subscription_cost_allocation_versions` and
 * `subscription_cost_allocation_lines`. The head is the only row that moves; a version and its lines are written once
 * and the database refuses to change them. Lines are read in the order of their Cost Center ids, as they are cleaned.
 */
@Injectable()
export class CostAllocationRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Makes the head row of the subscription if there is none. A subscription that does not exist fails the foreign key (23503). */
  async ensureHead(tx: DbTx, subscriptionId: string, organizationId: string): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO subscription_cost_allocations (subscription_id, organization_id, current_version)
      VALUES (${subscriptionId}::uuid, ${organizationId}::uuid, 0)
      ON CONFLICT (subscription_id) DO NOTHING`;
  }

  /** Locks the head for the rest of the transaction, so two declarations for one subscription queue; its current version. */
  async lockCurrentVersion(tx: DbTx, subscriptionId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ current_version: number }[]>`
      SELECT current_version FROM subscription_cost_allocations WHERE subscription_id = ${subscriptionId}::uuid FOR UPDATE`;

    return rows[0].current_version;
  }

  async readVersion(subscriptionId: string, version: number, tx?: DbTx): Promise<AllocationVersion | null> {
    const row = await (tx ?? this.prisma).subscriptionCostAllocationVersion.findUnique({
      where: { subscriptionId_version: { subscriptionId, version } },
      include: WITH_LINES,
    });

    return row ? toVersion(row) : null;
  }

  /** The newest declaration of the subscription, or null when it has none. */
  async readCurrent(subscriptionId: string, tx?: DbTx): Promise<AllocationVersion | null> {
    const head = await (tx ?? this.prisma).subscriptionCostAllocation.findUnique({ where: { subscriptionId } });
    if (!head || head.currentVersion === 0) return null;

    return this.readVersion(subscriptionId, head.currentVersion, tx);
  }

  async insertVersion(
    tx: DbTx,
    input: {
      subscriptionId: string;
      version: number;
      lines: AllocationLineRecord[];
      declaredByAppUserId: string;
    },
  ): Promise<AllocationVersion> {
    const row = await tx.subscriptionCostAllocationVersion.create({
      data: {
        subscriptionId: input.subscriptionId,
        version: input.version,
        declaredByAppUserId: input.declaredByAppUserId,
        lines: {
          create: input.lines.map((line, index) => ({
            position: index + 1,
            costCenterId: line.costCenterId,
            ratioBp: line.ratioBp,
          })),
        },
      },
      include: WITH_LINES,
    });

    return toVersion(row);
  }

  async setCurrentVersion(tx: DbTx, subscriptionId: string, version: number): Promise<void> {
    await tx.subscriptionCostAllocation.update({ where: { subscriptionId }, data: { currentVersion: version } });
  }

  /** One page of the declarations of a subscription, newest first, and the total, from one snapshot. */
  async history(
    subscriptionId: string,
    skip: number,
    take: number,
  ): Promise<{ items: AllocationVersion[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.subscriptionCostAllocationVersion.findMany({
          where: { subscriptionId },
          include: WITH_LINES,
          orderBy: { version: 'desc' },
          skip,
          take,
        });

        return {
          items: rows.map(toVersion),
          total: await tx.subscriptionCostAllocationVersion.count({ where: { subscriptionId } }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
