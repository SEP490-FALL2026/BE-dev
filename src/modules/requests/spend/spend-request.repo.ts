import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AccessRequestState } from '../access-request/access-request.types';

/**
 * The requests that wait on something in a budget, found for the listener that hears of the change (`US-06-13` AC-11,
 * `US-06-09` AC-17). It only finds them: the service that moves one locks it first and judges it on what it reads then.
 */
@Injectable()
export class SpendRequestRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The requests whose open review is about the plan line that moved: attached to it, under a review that is open or waiting. */
  async awaitingReviewOnLine(tx: DbTx, versionIds: readonly string[], position: number): Promise<string[]> {
    const rows = await tx.accessRequest.findMany({
      where: {
        planLineVersionId: { in: [...versionIds] },
        planLinePosition: position,
        state: { in: ['AWAITING_FINANCE_REVIEW', 'WAITING_CONTROLLED'] },
      },
      select: { id: true },
      orderBy: { submittedAt: 'asc' },
    });

    return rows.map((row) => row.id);
  }

  /** The requests of the Cost Center that wait, under control, for a version of the budget to be approved. */
  async awaitingBudget(tx: DbTx, costCenterId: string): Promise<string[]> {
    const rows = await tx.accessRequest.findMany({
      where: { costCenterId, state: 'AWAITING_BUDGET' },
      select: { id: true },
      orderBy: { submittedAt: 'asc' },
    });

    return rows.map((row) => row.id);
  }

  /**
   * The requests that wait in the queue of a department's head, in the order their need was settled: those that cost money and
   * whose need is approved but are not yet sent on (`US-05-04` AC-11).
   */
  async queuePage(departmentId: string, skip: number, take: number, tx?: DbTx) {
    const db = tx ?? this.prisma;
    const where = {
      departmentId,
      state: 'AWAITING_SPEND_SUBMISSION' as const,
      policy: { path: ['chain'], array_contains: 'SPEND_APPROVAL' },
    };
    const [rows, total] = await Promise.all([
      db.accessRequest.findMany({
        where,
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
        select: {
          id: true,
          planId: true,
          requesterEmployeeId: true,
          amountMinor: true,
          amountCurrency: true,
          expectedSpendOn: true,
          budgetYear: true,
          offPlan: true,
          planLineVersionId: true,
          pricingStatus: true,
          type: true,
          updatedAt: true,
          spendQueuedAt: true,
          proposal: { select: { softwareName: true } },
          beneficiaries: { select: { employeeId: true }, orderBy: { position: 'asc' }, take: 1 },
          _count: { select: { beneficiaries: true } },
        },
      }),
      db.accessRequest.count({ where }),
    ]);

    return { rows, total };
  }

  /** The state of each of the requests, in one read. */
  async statesOf(requestIds: readonly string[]): Promise<Map<string, AccessRequestState>> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.accessRequest.findMany({
      where: { id: { in: [...requestIds] } },
      select: { id: true, state: true },
    });

    return new Map(rows.map((row) => [row.id, row.state]));
  }
}
