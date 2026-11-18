import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface NoticeRecord {
  id: string;
  versionNumber: number;
  collected: string;
  notCollected: string;
  purpose: string;
  retention: string;
  stopRight: string;
  includesToolStatus: boolean;
  requiresReacknowledgement: boolean;
  publishedAt: Date;
}

const SELECT = {
  id: true,
  versionNumber: true,
  collected: true,
  notCollected: true,
  purpose: true,
  retention: true,
  stopRight: true,
  includesToolStatus: true,
  requiresReacknowledgement: true,
  publishedAt: true,
} as const;

/** The versions of the notice: added to and never changed (a trigger refuses anything else). */
@Injectable()
export class NoticeRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The version in force: the highest number. */
  current(organizationId: string, tx?: DbTx): Promise<NoticeRecord | null> {
    return (tx ?? this.prisma).monitoringNoticeVersion.findFirst({
      where: { organizationId },
      orderBy: { versionNumber: 'desc' },
      select: SELECT,
    });
  }

  find(organizationId: string, id: string, tx?: DbTx): Promise<NoticeRecord | null> {
    return (tx ?? this.prisma).monitoringNoticeVersion.findFirst({ where: { id, organizationId }, select: SELECT });
  }

  /** Takes the lock that serializes the numbering of the versions of one organization until the transaction ends. */
  async lockNumbering(tx: DbTx, organizationId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`monitoring-notice:${organizationId}`}, 0))`;
  }

  async insert(
    tx: DbTx,
    input: Omit<NoticeRecord, 'id' | 'versionNumber' | 'publishedAt'> & {
      organizationId: string;
      publishedByAppUserId: string;
    },
  ): Promise<NoticeRecord> {
    const last = await tx.monitoringNoticeVersion.aggregate({
      where: { organizationId: input.organizationId },
      _max: { versionNumber: true },
    });

    return tx.monitoringNoticeVersion.create({
      data: { ...input, versionNumber: (last._max.versionNumber ?? 0) + 1 },
      select: SELECT,
    });
  }

  /**
   * Asks every open registration to acknowledge again: the head of its chain is cleared. Every open registration is locked, in id
   * order, whether or not it is acknowledged now: an acknowledgement that has not committed yet holds its row, and this waits for
   * it and then clears what it wrote. Locking only the acknowledged ones would skip that row and leave it collected under the old
   * version.
   */
  async clearAcknowledgements(tx: DbTx, organizationId: string): Promise<number> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_registrations
       WHERE organization_id = ${organizationId}::uuid AND ended_at IS NULL
       ORDER BY id FOR UPDATE`;
    if (locked.length === 0) return 0;
    const ids = locked.map((row) => row.id);

    return tx.$executeRaw`
      UPDATE device_registrations SET acknowledged_from = NULL WHERE id = ANY(${ids}::uuid[]) AND acknowledged_from IS NOT NULL`;
  }
}
