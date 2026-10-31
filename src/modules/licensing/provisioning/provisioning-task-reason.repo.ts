import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RevocationSource } from '../public/licensing.types';

/** A reason that asked for the revocation of a seat, as it is kept. */
export interface ReasonRecord {
  id: string;
  taskId: string;
  source: RevocationSource;
  decidedByEmployeeId: string | null;
  decidedRole: string;
  referenceKind: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: Date;
}

const toRecord = (row: Prisma.ProvisioningTaskReasonGetPayload<object>): ReasonRecord => ({
  id: row.id,
  taskId: row.taskId,
  source: row.source,
  decidedByEmployeeId: row.decidedByEmployeeId,
  decidedRole: row.decidedRole,
  referenceKind: row.referenceKind,
  referenceId: row.referenceId,
  note: row.note,
  createdAt: row.createdAt,
});

/**
 * The one writer of `provisioning_task_reasons`: a row for each source (and what it refers to) that asked for the
 * revocation of a seat. The first reason is also on the task; a row is never changed or deleted, the database refuses both.
 */
@Injectable()
export class ProvisioningTaskReasonRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: {
      taskId: string;
      source: RevocationSource;
      decidedByEmployeeId: string | null;
      decidedRole: string;
      referenceKind: string | null;
      referenceId: string | null;
      note: string | null;
    },
  ): Promise<ReasonRecord> {
    return toRecord(await tx.provisioningTaskReason.create({ data: input }));
  }

  /** The reason of this source and reference on the task, or null: the same decision asked twice is one reason. */
  async find(
    tx: DbTx,
    taskId: string,
    source: RevocationSource,
    referenceId: string | null,
  ): Promise<ReasonRecord | null> {
    const row = await tx.provisioningTaskReason.findFirst({ where: { taskId, source, referenceId } });

    return row ? toRecord(row) : null;
  }

  /** The reasons of these tasks in one read, the first of each task first. */
  async listOf(taskIds: readonly string[], tx?: DbTx): Promise<ReasonRecord[]> {
    if (taskIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).provisioningTaskReason.findMany({
      where: { taskId: { in: [...taskIds] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** How many reasons each of these tasks has, in one read: what a row of the list says without the reasons themselves. */
  async countOf(taskIds: readonly string[], tx?: DbTx): Promise<Map<string, number>> {
    if (taskIds.length === 0) return new Map();
    const groups = await (tx ?? this.prisma).provisioningTaskReason.groupBy({
      by: ['taskId'],
      where: { taskId: { in: [...taskIds] } },
      _count: { _all: true },
      orderBy: { taskId: 'asc' },
    });

    return new Map(groups.map((group) => [group.taskId, group._count._all]));
  }
}
