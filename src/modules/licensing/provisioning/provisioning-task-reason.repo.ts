import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
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
  /** The timing the source gave (null: none) and the withdrawal of the reason: while `withdrawnAt` is null the reason stands. */
  dueOn: BusinessDate | null;
  notBefore: BusinessDate | null;
  withdrawnAt: Date | null;
  withdrawnByAppUserId: string | null;
  withdrawCause: string | null;
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
  dueOn: row.dueOn ? fromDateColumn(row.dueOn) : null,
  notBefore: row.notBefore ? fromDateColumn(row.notBefore) : null,
  withdrawnAt: row.withdrawnAt,
  withdrawnByAppUserId: row.withdrawnByAppUserId,
  withdrawCause: row.withdrawCause,
  createdAt: row.createdAt,
});

/**
 * The one writer of `provisioning_task_reasons`: a row for each source (and what it refers to) that asked for the
 * revocation of a seat. The first reason is also on the task; a row is never deleted and changes once, when it is withdrawn (the database
 * refuses anything else). Every read but `listAllOf` is of the reasons that still stand: a withdrawn reason is read nowhere else.
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
      dueOn: BusinessDate | null;
      notBefore: BusinessDate | null;
    },
  ): Promise<ReasonRecord> {
    return toRecord(
      await tx.provisioningTaskReason.create({
        data: {
          ...input,
          dueOn: input.dueOn ? toDateColumn(input.dueOn) : null,
          notBefore: input.notBefore ? toDateColumn(input.notBefore) : null,
        },
      }),
    );
  }

  /** Takes the reason back, once: who, when and why. The row is left as it was in everything else. */
  async withdraw(tx: DbTx, id: string, input: { appUserId: string; cause: string; now: Date }): Promise<void> {
    await tx.provisioningTaskReason.update({
      where: { id },
      data: { withdrawnAt: input.now, withdrawnByAppUserId: input.appUserId, withdrawCause: input.cause },
    });
  }

  /** The reason of this source and reference on the task, or null: the same decision asked twice is one reason. */
  async find(
    tx: DbTx,
    taskId: string,
    source: RevocationSource,
    referenceId: string | null,
  ): Promise<ReasonRecord | null> {
    const row = await tx.provisioningTaskReason.findFirst({
      where: { taskId, source, referenceId, withdrawnAt: null },
    });

    return row ? toRecord(row) : null;
  }

  /** The reasons of these tasks that still stand, in one read, the first of each task first. */
  listOf(taskIds: readonly string[], tx?: DbTx): Promise<ReasonRecord[]> {
    return this.read(taskIds, false, tx);
  }

  /** Every reason of these tasks, a withdrawn one too: only what shows the history of a task reads it. */
  listAllOf(taskIds: readonly string[], tx?: DbTx): Promise<ReasonRecord[]> {
    return this.read(taskIds, true, tx);
  }

  private async read(taskIds: readonly string[], withWithdrawn: boolean, tx?: DbTx): Promise<ReasonRecord[]> {
    if (taskIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).provisioningTaskReason.findMany({
      where: { taskId: { in: [...taskIds] }, ...(withWithdrawn ? {} : { withdrawnAt: null }) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** How many reasons that still stand each of these tasks has, in one read: what a row of the list says without the reasons themselves. */
  async countOf(taskIds: readonly string[], tx?: DbTx): Promise<Map<string, number>> {
    if (taskIds.length === 0) return new Map();
    const groups = await (tx ?? this.prisma).provisioningTaskReason.groupBy({
      by: ['taskId'],
      where: { taskId: { in: [...taskIds] }, withdrawnAt: null },
      _count: { _all: true },
      orderBy: { taskId: 'asc' },
    });

    return new Map(groups.map((group) => [group.taskId, group._count._all]));
  }
}
