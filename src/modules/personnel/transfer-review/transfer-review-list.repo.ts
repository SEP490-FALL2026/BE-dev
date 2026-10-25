import { Injectable } from '@nestjs/common';
import { toDateColumn } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { toReviewRecord } from './transfer-review.repo';
import type { ReviewItemRecord, ReviewListFilter, ReviewScope, ReviewSummaryRecord } from './transfer-review.types';

const COUNTS = {
  _count: { select: { items: true } },
} as const;

function whereOf(filter: ReviewListFilter): Prisma.TransferReviewWhereInput {
  const scope: ReviewScope = filter.scope;
  const departments = [
    ...(scope.kind === 'DEPARTMENT' ? [{ departmentId: scope.departmentId }] : []),
    ...(filter.departmentId ? [{ departmentId: filter.departmentId }] : []),
  ];

  return {
    // A person who is neither an IT Admin nor a head sees none: the condition matches nothing.
    ...(scope.kind === 'NONE' ? { id: { in: [] } } : {}),
    ...(departments.length > 0 ? { AND: departments } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
    ...(filter.overdue ? { status: 'OPEN' as const, dueOn: { lt: toDateColumn(filter.today) } } : {}),
  };
}

/** What the routes read of the reviews: a page of them with the number of lines that wait, and the lines of one review. */
@Injectable()
export class TransferReviewListRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** A page of reviews, the earliest deadline first; two statements however many rows the page holds. */
  async list(filter: ReviewListFilter): Promise<{ items: ReviewSummaryRecord[]; total: number }> {
    const where = whereOf(filter);
    const [rows, total] = await Promise.all([
      this.prisma.transferReview.findMany({
        where,
        orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        include: COUNTS,
      }),
      this.prisma.transferReview.count({ where }),
    ]);
    const pending = await this.pendingByReview(rows.map((row) => row.id));

    return {
      items: rows.map((row) => ({
        ...toReviewRecord(row),
        totalItems: row._count.items,
        pendingItems: pending.get(row.id) ?? 0,
      })),
      total,
    };
  }

  /** One review with its counts; null when there is none. */
  async summaryOf(id: string): Promise<ReviewSummaryRecord | null> {
    const row = await this.prisma.transferReview.findUnique({ where: { id }, include: COUNTS });
    if (!row) return null;
    const pending = await this.pendingByReview([id]);
    // A transfer for today is written after the placement that opens the review, so the review may not know it yet.
    const transfer = row.transferId
      ? null
      : await this.prisma.departmentTransfer.findFirst({
          where: { opensPlacementId: row.placementId },
          select: { id: true },
        });

    return {
      ...toReviewRecord(row),
      transferId: row.transferId ?? transfer?.id ?? null,
      totalItems: row._count.items,
      pendingItems: pending.get(id) ?? 0,
    };
  }

  /** The lines of a review in the order they were made, one page. */
  async listItems(
    reviewId: string,
    page: { page: number; pageSize: number },
  ): Promise<{ items: ReviewItemRecord[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.transferReviewItem.findMany({
        where: { reviewId },
        orderBy: [{ position: 'asc' }, { assignmentId: 'asc' }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      this.prisma.transferReviewItem.count({ where: { reviewId } }),
    ]);

    return { items: rows, total };
  }

  /** Whether the person decided any line of the review: the head before the head of today still sees what they decided. */
  async hasDecidedBy(reviewId: string, employeeId: string): Promise<boolean> {
    return (await this.prisma.transferReviewItem.count({ where: { reviewId, decidedByEmployeeId: employeeId } })) > 0;
  }

  private async pendingByReview(ids: readonly string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const grouped = await this.prisma.transferReviewItem.groupBy({
      by: ['reviewId'],
      where: { reviewId: { in: [...ids] }, decision: 'PENDING' },
      _count: { _all: true },
    });

    return new Map(grouped.map((group) => [group.reviewId, group._count._all]));
  }
}
