import { Injectable } from '@nestjs/common';
import { normalizeDisplayName } from '../../../core/display-name';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { normalizeJobTitleName } from './job-title-name';
import { JobTitleListFilter, JobTitleRecord, JobTitleStatus } from './job-title.types';

const JOB_TITLE_SELECT = {
  id: true,
  name: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** The one writer of `job_titles`: the installation's first title and the catalogue, under one name rule (T-12). */
@Injectable()
export class JobTitleRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The installation path and the API share one name rule (T-12): shown as the display name, compared as the normalized one. */
  async createJobTitle(tx: DbTx, organizationId: string, name: string): Promise<{ id: string }> {
    return tx.jobTitle.create({
      data: { organizationId, name: normalizeDisplayName(name), normalizedName: normalizeJobTitleName(name) },
      select: { id: true },
    });
  }

  async insertJobTitle(tx: DbTx, organizationId: string, name: string): Promise<JobTitleRecord> {
    return tx.jobTitle.create({
      data: { organizationId, name: normalizeDisplayName(name), normalizedName: normalizeJobTitleName(name) },
      select: JOB_TITLE_SELECT,
    });
  }

  /**
   * Takes the title's row lock (`FOR UPDATE` to change it, `FOR SHARE` to rely on it staying as it is), then
   * reads it in a separate statement so what is read is what the lock now protects. Null when it does not exist.
   */
  async lockJobTitle(tx: DbTx, jobTitleId: string, mode: 'SHARE' | 'UPDATE'): Promise<JobTitleRecord | null> {
    const rows =
      mode === 'SHARE'
        ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM job_titles WHERE id = ${jobTitleId}::uuid FOR SHARE`
        : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM job_titles WHERE id = ${jobTitleId}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;

    return tx.jobTitle.findUnique({ where: { id: jobTitleId }, select: JOB_TITLE_SELECT });
  }

  /** Unlocked: the title that has this normalized name, whatever its status, to name it in a conflict. */
  async findJobTitleByNormalizedName(
    organizationId: string,
    normalizedName: string,
    tx?: DbTx,
  ): Promise<JobTitleRecord | null> {
    return (tx ?? this.prisma).jobTitle.findUnique({
      where: { organizationId_normalizedName: { organizationId, normalizedName } },
      select: JOB_TITLE_SELECT,
    });
  }

  /** Renames a title and raises its version. The caller holds the row lock. */
  async renameJobTitle(tx: DbTx, jobTitleId: string, name: string, now: Date): Promise<JobTitleRecord> {
    return tx.jobTitle.update({
      where: { id: jobTitleId },
      data: {
        name: normalizeDisplayName(name),
        normalizedName: normalizeJobTitleName(name),
        version: { increment: 1 },
        updatedAt: now,
      },
      select: JOB_TITLE_SELECT,
    });
  }

  /** Changes a title's status and raises its version. The caller holds the row lock. */
  async setJobTitleStatus(tx: DbTx, jobTitleId: string, status: JobTitleStatus, now: Date): Promise<JobTitleRecord> {
    return tx.jobTitle.update({
      where: { id: jobTitleId },
      data: { status, version: { increment: 1 }, updatedAt: now },
      select: JOB_TITLE_SELECT,
    });
  }

  /**
   * One page of the catalogue in normalized-name order, and the total for the same filter, from one snapshot
   * (RepeatableRead). The search is a literal substring of the normalized name: `%` and `_` are characters.
   */
  async listJobTitles(filter: JobTitleListFilter): Promise<{ items: JobTitleRecord[]; total: number }> {
    const conditions = [
      ...(filter.status ? [Prisma.sql`status = ${filter.status}::"JobTitleStatus"`] : []),
      ...(filter.search ? [Prisma.sql`strpos(normalized_name, ${filter.search}) > 0`] : []),
    ];
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    return this.prisma.$transaction(
      async (tx) => {
        const items = await tx.$queryRaw<
          { id: string; name: string; status: JobTitleStatus; version: number; created_at: Date; updated_at: Date }[]
        >`SELECT id, name, status, version, created_at, updated_at FROM job_titles ${where}
           ORDER BY normalized_name, id LIMIT ${filter.take} OFFSET ${filter.skip}`;
        const counted = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM job_titles ${where}`;

        return {
          items: items.map((row) => ({
            id: row.id,
            name: row.name,
            status: row.status,
            version: row.version,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
          total: counted[0].total,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
