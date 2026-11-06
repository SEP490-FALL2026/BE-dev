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
    const rows = await db.accessRequest.findMany({
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
    });
    const total = await db.accessRequest.count({ where });

    return { rows, total };
  }

  /**
   * What a commitment shows of each of its requests, in one read: who sent it, which plan, how many people it is for and when the
   * spend was approved. A request that does not exist is not among the rows.
   */
  async commitmentFactsOf(requestIds: readonly string[]): Promise<CommitmentRequestRow[]> {
    if (requestIds.length === 0) return [];
    const rows = await this.prisma.accessRequest.findMany({
      where: { id: { in: [...requestIds] } },
      select: {
        id: true,
        planId: true,
        requesterEmployeeId: true,
        // A proposal of software that is not in the catalog has no plan until the IT Admin links one, which comes after the spend
        // decision: until then the software is the one proposed and the vendor the one the assessment names.
        proposal: { select: { softwareName: true } },
        assessment: { select: { vendorId: true } },
        _count: { select: { beneficiaries: true } },
        spendDecisions: {
          where: { decision: 'APPROVED' },
          select: { decidedAt: true },
          orderBy: { decidedAt: 'desc' },
          take: 1,
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      planId: row.planId,
      proposedSoftwareName: row.proposal?.softwareName ?? null,
      assessedVendorId: row.assessment?.vendorId ?? null,
      requesterEmployeeId: row.requesterEmployeeId,
      beneficiaryCount: row._count.beneficiaries,
      spendApprovedAt: row.spendDecisions[0]?.decidedAt ?? null,
    }));
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

/** One request as a commitment shows it. */
export interface CommitmentRequestRow {
  id: string;
  planId: string | null;
  /** The software a proposal names, for a request that has no plan yet. */
  proposedSoftwareName: string | null;
  /** The vendor the assessment of a proposal names, for a request that has no plan yet. */
  assessedVendorId: string | null;
  requesterEmployeeId: string;
  beneficiaryCount: number;
  spendApprovedAt: Date | null;
}
