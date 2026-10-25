import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { NewReview, ReviewItemRecord, ReviewRecord } from './transfer-review.types';

type ReviewRow = Prisma.TransferReviewGetPayload<Record<string, never>>;
type ItemRow = Prisma.TransferReviewItemGetPayload<Record<string, never>>;

export function toReviewRecord(row: ReviewRow): ReviewRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    transferId: row.transferId,
    placementId: row.placementId,
    departmentId: row.departmentId,
    jobTitleId: row.jobTitleId,
    effectiveOn: fromDateColumn(row.effectiveOn),
    dueOn: fromDateColumn(row.dueOn),
    status: row.status,
    openedAt: row.openedAt,
    completedAt: row.completedAt,
    overdueNoticedAt: row.overdueNoticedAt,
  };
}

function toItemRecord(row: ItemRow): ReviewItemRecord {
  return {
    reviewId: row.reviewId,
    assignmentId: row.assignmentId,
    planId: row.planId,
    position: row.position,
    grantReason: row.grantReason,
    decision: row.decision,
    decidedByEmployeeId: row.decidedByEmployeeId,
    decidedAt: row.decidedAt,
    newToolNote: row.newToolNote,
    revocationTaskId: row.revocationTaskId,
  };
}

/**
 * The one writer of `transfer_reviews` and `transfer_review_items`. A review is opened once for a placement (a unique key), a line
 * is decided once (a trigger), and a review ends once: completed when no line waits, or superseded by a later transfer.
 */
@Injectable()
export class TransferReviewRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findByPlacement(tx: DbTx, placementId: string): Promise<ReviewRecord | null> {
    const row = await tx.transferReview.findUnique({ where: { placementId } });

    return row && toReviewRecord(row);
  }

  async find(id: string, tx?: DbTx): Promise<ReviewRecord | null> {
    const row = await (tx ?? this.prisma).transferReview.findUnique({ where: { id } });

    return row && toReviewRecord(row);
  }

  /** The review held `FOR UPDATE` until the transaction ends, read after the lock; null when there is none. */
  async lock(tx: DbTx, id: string): Promise<ReviewRecord | null> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM transfer_reviews WHERE id = ${id}::uuid FOR UPDATE`;

    return rows.length === 0 ? null : this.find(id, tx);
  }

  /** The transfer that opened the placement, if one did: a person may also come to a department by another way. */
  async transferIdOfPlacement(tx: DbTx, placementId: string): Promise<string | null> {
    const row = await tx.departmentTransfer.findFirst({
      where: { opensPlacementId: placementId },
      select: { id: true },
    });

    return row?.id ?? null;
  }

  /**
   * Opens the review with its lines, unless the placement has one already (the event came twice): returns the review made, or null.
   * The lines keep the order the seats came in.
   */
  async insert(tx: DbTx, input: NewReview): Promise<ReviewRecord | null> {
    const made = await tx.transferReview.createManyAndReturn({
      data: [
        {
          organizationId: input.organizationId,
          employeeId: input.employeeId,
          transferId: input.transferId,
          placementId: input.placementId,
          departmentId: input.departmentId,
          jobTitleId: input.jobTitleId,
          effectiveOn: toDateColumn(input.effectiveOn),
          dueOn: toDateColumn(input.dueOn),
        },
      ],
      skipDuplicates: true,
    });
    const row = made[0];
    if (!row) return null;
    await tx.transferReviewItem.createMany({
      data: input.items.map((item, index) => ({
        reviewId: row.id,
        assignmentId: item.assignmentId,
        planId: item.planId,
        position: index + 1,
        grantReason: item.grantReason,
      })),
    });

    return toReviewRecord(row);
  }

  /** The open reviews of the person, except the one of `exceptPlacementId`, become obsolete; returns them as they were. */
  async supersedeOpenOf(tx: DbTx, employeeId: string, exceptPlacementId: string): Promise<ReviewRecord[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE transfer_reviews SET status = 'SUPERSEDED'
       WHERE employee_id = ${employeeId}::uuid AND status = 'OPEN' AND placement_id <> ${exceptPlacementId}::uuid
      RETURNING id`;
    if (rows.length === 0) return [];
    const found = await tx.transferReview.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    });

    return found.map(toReviewRecord);
  }

  /** Every open review of a person who has left becomes obsolete; returns them as they were. */
  async supersedeAllOpenOf(tx: DbTx, employeeId: string): Promise<ReviewRecord[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE transfer_reviews SET status = 'SUPERSEDED'
       WHERE employee_id = ${employeeId}::uuid AND status = 'OPEN'
      RETURNING id`;
    if (rows.length === 0) return [];
    const found = await tx.transferReview.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    });

    return found.map(toReviewRecord);
  }

  async findItem(tx: DbTx, reviewId: string, assignmentId: string): Promise<ReviewItemRecord | null> {
    const row = await tx.transferReviewItem.findUnique({
      where: { reviewId_assignmentId: { reviewId, assignmentId } },
    });

    return row && toItemRecord(row);
  }

  /** Writes the decision of a line that waits; false when it was decided already. */
  async decideItem(
    tx: DbTx,
    reviewId: string,
    assignmentId: string,
    decision: {
      decision: 'STILL_NEEDED' | 'NOT_NEEDED' | 'NEEDS_NEW_TOOL';
      byEmployeeId: string;
      at: Date;
      note: string | null;
      revocationTaskId: string | null;
    },
  ): Promise<boolean> {
    const result = await tx.transferReviewItem.updateMany({
      where: { reviewId, assignmentId, decision: 'PENDING' },
      data: {
        decision: decision.decision,
        decidedByEmployeeId: decision.byEmployeeId,
        decidedAt: decision.at,
        newToolNote: decision.note,
        revocationTaskId: decision.revocationTaskId,
      },
    });

    return result.count === 1;
  }

  countPending(tx: DbTx, reviewId: string): Promise<number> {
    return tx.transferReviewItem.count({ where: { reviewId, decision: 'PENDING' } });
  }

  async complete(tx: DbTx, reviewId: string, at: Date): Promise<boolean> {
    const result = await tx.transferReview.updateMany({
      where: { id: reviewId, status: 'OPEN' },
      data: { status: 'COMPLETED', completedAt: at },
    });

    return result.count === 1;
  }

  /** The open reviews past `today` that were not told yet, the earliest deadline first. */
  async listOverdueUnnoticed(today: BusinessDate, limit: number): Promise<ReviewRecord[]> {
    const rows = await this.prisma.transferReview.findMany({
      where: { status: 'OPEN', overdueNoticedAt: null, dueOn: { lt: toDateColumn(today) } },
      orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    return rows.map(toReviewRecord);
  }

  /** Marks the review as told; false when another instance did it first. */
  async markOverdueNoticed(tx: DbTx, id: string, at: Date): Promise<boolean> {
    const result = await tx.transferReview.updateMany({
      where: { id, status: 'OPEN', overdueNoticedAt: null },
      data: { overdueNoticedAt: at },
    });

    return result.count === 1;
  }
}
