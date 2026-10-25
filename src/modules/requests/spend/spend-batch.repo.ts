import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { StopReason } from './spend-submission.policy';

export type BatchItemOutcome = 'SENT_TO_APPROVER' | 'SENT_TO_FINANCE' | 'STOPPED';
export type LeftReason = 'RETURNED_BY_FINANCE' | 'CONFLICT_OF_INTEREST' | 'REQUEST_WITHDRAWN' | 'REQUEST_CANCELLED';

export interface BatchRecord {
  id: string;
  organizationId: string;
  departmentId: string;
  submittedByEmployeeId: string;
  submittedAt: Date;
  itemCount: number;
}

export interface BatchItemRecord {
  requestId: string;
  position: number;
  outcome: BatchItemOutcome;
  stopReason: StopReason | null;
  leftReason: LeftReason | null;
  leftAt: Date | null;
}

export interface NewBatchItem {
  requestId: string;
  outcome: BatchItemOutcome;
  stopReason: StopReason | null;
  leftReason: LeftReason | null;
}

const toItem = (row: {
  requestId: string;
  position: number;
  outcome: BatchItemOutcome;
  stopReason: string | null;
  leftReason: LeftReason | null;
  leftAt: Date | null;
}): BatchItemRecord => ({ ...row, stopReason: row.stopReason as StopReason | null });

/**
 * The one writer of `spend_batches` and `spend_batch_items`, and their reads. A batch and what its items said are never
 * changed; the only thing added later is that a request left the batch it was sent in, once (`US-06-14` AC-3).
 */
@Injectable()
export class SpendBatchRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the batch with its items, in the order they were given. */
  async create(
    tx: DbTx,
    input: {
      organizationId: string;
      departmentId: string;
      submittedByEmployeeId: string;
      now: Date;
      items: readonly NewBatchItem[];
    },
  ): Promise<string> {
    const created = await tx.spendBatch.create({
      data: {
        organizationId: input.organizationId,
        departmentId: input.departmentId,
        submittedByEmployeeId: input.submittedByEmployeeId,
        submittedAt: input.now,
        items: {
          create: input.items.map((item, index) => ({
            requestId: item.requestId,
            position: index + 1,
            outcome: item.outcome,
            stopReason: item.stopReason,
            leftReason: item.leftReason,
            leftAt: item.leftReason === null ? null : input.now,
          })),
        },
      },
      select: { id: true },
    });

    return created.id;
  }

  /** Says the request has left the batch it was last sent in, if that one has not said so already. */
  async markLeft(tx: DbTx, requestId: string, reason: LeftReason, now: Date): Promise<void> {
    const item = await tx.spendBatchItem.findFirst({
      where: { requestId, leftReason: null, outcome: { not: 'STOPPED' } },
      orderBy: { batch: { submittedAt: 'desc' } },
      select: { batchId: true },
    });
    if (!item) return;

    await tx.spendBatchItem.update({
      where: { batchId_requestId: { batchId: item.batchId, requestId } },
      data: { leftReason: reason, leftAt: now },
    });
  }

  async findById(id: string, tx?: DbTx): Promise<BatchRecord | null> {
    const row = await (tx ?? this.prisma).spendBatch.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });

    return row
      ? {
          id: row.id,
          organizationId: row.organizationId,
          departmentId: row.departmentId,
          submittedByEmployeeId: row.submittedByEmployeeId,
          submittedAt: row.submittedAt,
          itemCount: row._count.items,
        }
      : null;
  }

  /** One page of the items of a batch in order; `requestIds` narrows it to the requests a reader is given. */
  async pageItems(
    batchId: string,
    skip: number,
    take: number,
    requestIds?: readonly string[],
  ): Promise<{ items: BatchItemRecord[]; total: number }> {
    const where = { batchId, ...(requestIds ? { requestId: { in: [...requestIds] } } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.spendBatchItem.findMany({ where, orderBy: { position: 'asc' }, skip, take }),
      this.prisma.spendBatchItem.count({ where }),
    ]);

    return { items: rows.map(toItem), total };
  }

  /** The requests of a batch the person holds the spend step of now. */
  async heldBy(batchId: string, employeeId: string): Promise<string[]> {
    const rows = await this.prisma.spendBatchItem.findMany({
      where: {
        batchId,
        request: { steps: { some: { kind: 'SPEND_APPROVAL', assigneeEmployeeId: employeeId } } },
      },
      select: { requestId: true },
    });

    return rows.map((row) => row.requestId);
  }

  /** The ids of every request of a batch. */
  async requestIdsOf(batchId: string): Promise<string[]> {
    const rows = await this.prisma.spendBatchItem.findMany({ where: { batchId }, select: { requestId: true } });

    return rows.map((row) => row.requestId);
  }

  /** The newest batch each of the requests was sent in, when it was sent in one. */
  async latestBatchOf(requestIds: readonly string[]): Promise<Map<string, string>> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.spendBatchItem.findMany({
      where: { requestId: { in: [...requestIds] } },
      orderBy: [{ requestId: 'asc' }, { batch: { submittedAt: 'desc' } }],
      distinct: ['requestId'],
      select: { requestId: true, batchId: true },
    });

    return new Map(rows.map((row) => [row.requestId, row.batchId]));
  }
}
