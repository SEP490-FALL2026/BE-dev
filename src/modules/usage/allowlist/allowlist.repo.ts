import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AiToolKey, PublishedVersion, ToolMapping } from './allowlist.policy';

export interface VersionRecord {
  id: string;
  versionNumber: number;
  publishedAt: Date;
  entries: (ToolMapping & { kind: 'AI_TOOL' })[];
}

export interface AllowlistEntryRow {
  versionNumber: number;
  publishedAt: Date;
  kind: 'AI_TOOL';
  key: AiToolKey;
  applicationId: string;
}

/** The versions of the allowlist, added to and never changed (a trigger refuses anything else). */
@Injectable()
export class AllowlistRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Every version of the organization, oldest first, with its entries. There are few: one for each time the IT Admin changed the list. */
  async versions(organizationId: string, tx?: DbTx): Promise<(PublishedVersion & { versionNumber: number })[]> {
    const rows = await (tx ?? this.prisma).collectorAllowlistVersion.findMany({
      where: { organizationId },
      orderBy: { versionNumber: 'asc' },
      select: { versionNumber: true, publishedAt: true, entries: { select: { key: true, applicationId: true } } },
    });

    return rows.map((row) => ({
      versionNumber: row.versionNumber,
      publishedAt: row.publishedAt,
      entries: row.entries.map((entry) => ({ tool: entry.key as AiToolKey, applicationId: entry.applicationId })),
    }));
  }

  /** The version in force, or null when none was published. */
  async current(organizationId: string, tx?: DbTx): Promise<VersionRecord | null> {
    const row = await (tx ?? this.prisma).collectorAllowlistVersion.findFirst({
      where: { organizationId },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true,
        versionNumber: true,
        publishedAt: true,
        entries: { select: { kind: true, key: true, applicationId: true }, orderBy: [{ kind: 'asc' }, { key: 'asc' }] },
      },
    });

    return row
      ? {
          id: row.id,
          versionNumber: row.versionNumber,
          publishedAt: row.publishedAt,
          entries: row.entries.map((entry) => ({
            kind: entry.kind,
            tool: entry.key as AiToolKey,
            applicationId: entry.applicationId,
          })),
        }
      : null;
  }

  /** Takes the lock that serializes the numbering of the versions of one organization until the transaction ends. */
  async lockNumbering(tx: DbTx, organizationId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`collector-allowlist:${organizationId}`}, 0))`;
  }

  async insert(
    tx: DbTx,
    input: { organizationId: string; reason: string; publishedByAppUserId: string; entries: readonly ToolMapping[] },
  ): Promise<VersionRecord> {
    const last = await tx.collectorAllowlistVersion.aggregate({
      where: { organizationId: input.organizationId },
      _max: { versionNumber: true },
    });
    const row = await tx.collectorAllowlistVersion.create({
      data: {
        organizationId: input.organizationId,
        versionNumber: (last._max.versionNumber ?? 0) + 1,
        reason: input.reason,
        publishedByAppUserId: input.publishedByAppUserId,
        entries: {
          create: input.entries.map((entry) => ({
            kind: 'AI_TOOL' as const,
            key: entry.tool,
            applicationId: entry.applicationId,
          })),
        },
      },
      select: { id: true, versionNumber: true, publishedAt: true },
    });

    return {
      ...row,
      entries: input.entries.map((entry) => ({
        kind: 'AI_TOOL' as const,
        tool: entry.tool,
        applicationId: entry.applicationId,
      })),
    };
  }

  /** A page of the entries of the version in force and the total of the same snapshot. */
  async pageOfCurrent(
    organizationId: string,
    skip: number,
    take: number,
  ): Promise<{ rows: AllowlistEntryRow[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const version = await tx.collectorAllowlistVersion.findFirst({
          where: { organizationId },
          orderBy: { versionNumber: 'desc' },
          select: { id: true, versionNumber: true, publishedAt: true },
        });
        if (!version) return { rows: [], total: 0 };
        const where = { versionId: version.id };
        const entries = await tx.collectorAllowlistEntry.findMany({
          where,
          orderBy: [{ kind: 'asc' }, { key: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: { kind: true, key: true, applicationId: true },
        });

        return {
          rows: entries.map((entry) => ({
            versionNumber: version.versionNumber,
            publishedAt: version.publishedAt,
            kind: entry.kind,
            key: entry.key as AiToolKey,
            applicationId: entry.applicationId,
          })),
          total: await tx.collectorAllowlistEntry.count({ where }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
