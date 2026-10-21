import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

/** One setting of the toolset of a pair, as it was recorded. */
export interface ToolsetVersion {
  departmentId: string;
  jobTitleId: string;
  version: number;
  planIds: string[];
  reason: string;
  changedByAppUserId: string;
  changedAt: Date;
}

const WITH_ITEMS = { items: { orderBy: { planId: 'asc' } } } as const;
type VersionRow = Prisma.StandardToolsetVersionGetPayload<{ include: typeof WITH_ITEMS }>;

const toVersion = (row: VersionRow): ToolsetVersion => ({
  departmentId: row.departmentId,
  jobTitleId: row.jobTitleId,
  version: row.version,
  planIds: row.items.map((item) => item.planId),
  reason: row.reason,
  changedByAppUserId: row.changedByAppUserId,
  changedAt: row.changedAt,
});

/**
 * The one writer of `standard_toolsets`, `standard_toolset_versions` and `standard_toolset_items`. The head is the only
 * row that moves; a version and its items are written once and the database refuses to change them.
 */
@Injectable()
export class StandardToolsetRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Makes the head of the pair if there is none. A department or a job title that does not exist fails a foreign key. */
  async ensureHead(tx: DbTx, departmentId: string, jobTitleId: string, organizationId: string): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO standard_toolsets (department_id, job_title_id, organization_id, current_version)
      VALUES (${departmentId}::uuid, ${jobTitleId}::uuid, ${organizationId}::uuid, 0)
      ON CONFLICT (department_id, job_title_id) DO NOTHING`;
  }

  /** Locks the head for the rest of the transaction, so two changes of one pair queue; its current version. */
  async lockCurrentVersion(tx: DbTx, departmentId: string, jobTitleId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ current_version: number }[]>`
      SELECT current_version FROM standard_toolsets
       WHERE department_id = ${departmentId}::uuid AND job_title_id = ${jobTitleId}::uuid FOR UPDATE`;

    return rows[0].current_version;
  }

  async readVersion(
    departmentId: string,
    jobTitleId: string,
    version: number,
    tx?: DbTx,
  ): Promise<ToolsetVersion | null> {
    const row = await (tx ?? this.prisma).standardToolsetVersion.findUnique({
      where: { departmentId_jobTitleId_version: { departmentId, jobTitleId, version } },
      include: WITH_ITEMS,
    });

    return row ? toVersion(row) : null;
  }

  /** The newest setting of the pair, or null when it has none. */
  async readCurrent(departmentId: string, jobTitleId: string, tx?: DbTx): Promise<ToolsetVersion | null> {
    const head = await (tx ?? this.prisma).standardToolset.findUnique({
      where: { departmentId_jobTitleId: { departmentId, jobTitleId } },
    });
    if (!head || head.currentVersion === 0) return null;

    return this.readVersion(departmentId, jobTitleId, head.currentVersion, tx);
  }

  async insertVersion(
    tx: DbTx,
    input: {
      departmentId: string;
      jobTitleId: string;
      version: number;
      reason: string;
      planIds: string[];
      changedByAppUserId: string;
    },
  ): Promise<ToolsetVersion> {
    const row = await tx.standardToolsetVersion.create({
      data: {
        departmentId: input.departmentId,
        jobTitleId: input.jobTitleId,
        version: input.version,
        reason: input.reason,
        changedByAppUserId: input.changedByAppUserId,
        items: { create: input.planIds.map((planId) => ({ planId })) },
      },
      include: WITH_ITEMS,
    });

    return toVersion(row);
  }

  async setCurrentVersion(tx: DbTx, departmentId: string, jobTitleId: string, version: number): Promise<void> {
    await tx.standardToolset.update({
      where: { departmentId_jobTitleId: { departmentId, jobTitleId } },
      data: { currentVersion: version },
    });
  }

  /** One page of the settings of a pair, newest first, and the total, from one snapshot. */
  async history(
    departmentId: string,
    jobTitleId: string,
    skip: number,
    take: number,
  ): Promise<{ items: ToolsetVersion[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const where = { departmentId, jobTitleId };
        const rows = await tx.standardToolsetVersion.findMany({
          where,
          include: WITH_ITEMS,
          orderBy: { version: 'desc' },
          skip,
          take,
        });

        return { items: rows.map(toVersion), total: await tx.standardToolsetVersion.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** One page of the pairs that have a toolset, with the current setting of each, by department then job title. */
  async listCurrent(filter: {
    departmentId?: string;
    skip: number;
    take: number;
  }): Promise<{ items: ToolsetVersion[]; total: number }> {
    const where = { currentVersion: { gt: 0 }, ...(filter.departmentId ? { departmentId: filter.departmentId } : {}) };

    return this.prisma.$transaction(
      async (tx) => {
        const heads = await tx.standardToolset.findMany({
          where,
          orderBy: [{ departmentId: 'asc' }, { jobTitleId: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });
        const rows = await Promise.all(
          heads.map((head) =>
            tx.standardToolsetVersion.findUniqueOrThrow({
              where: {
                departmentId_jobTitleId_version: {
                  departmentId: head.departmentId,
                  jobTitleId: head.jobTitleId,
                  version: head.currentVersion,
                },
              },
              include: WITH_ITEMS,
            }),
          ),
        );

        return { items: rows.map(toVersion), total: await tx.standardToolset.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** How many pairs have a toolset, for the onboarding checklist. */
  async countConfigured(): Promise<number> {
    return this.prisma.standardToolset.count({ where: { currentVersion: { gt: 0 } } });
  }
}
