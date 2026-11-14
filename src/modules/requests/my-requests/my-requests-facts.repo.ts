import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { BlockReason } from '../spend/budget-check.policy';
import type { MyLine, OutcomeFacts, QueuedCheck } from './my-requests.types';

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

/**
 * What the list needs to say where a request stands and why it did not go on, read once for a whole page (one read for each kind of
 * fact, never one for each row). Only what a person who sent the request may read: the way the newest check routed it, the way the
 * newest review of Finance ended, which steps are open, what was written when it was refused. No figure of a budget, no year of a
 * check and no commitment is read here.
 */
@Injectable()
export class MyRequestsFactsRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The newest check of each request: how it routed the request and whether the data stopped it, never a figure. */
  async latestChecks(requestIds: readonly string[]): Promise<Map<string, QueuedCheck>> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.requestBudgetCheck.findMany({
      where: { requestId: { in: unique(requestIds) } },
      orderBy: [{ requestId: 'asc' }, { number: 'desc' }],
      distinct: ['requestId'],
      select: {
        requestId: true,
        route: true,
        staleCostEvidence: true,
        outcome: true,
        blockReasons: true,
        overBaseByMinor: true,
        overByMinor: true,
        currency: true,
      },
    });

    return new Map(rows.map((row) => [row.requestId, { ...row, blockReasons: row.blockReasons as BlockReason[] }]));
  }

  /** The requests that hold an open spend step (held or waiting). */
  async withOpenSpendStep(requestIds: readonly string[]): Promise<Set<string>> {
    if (requestIds.length === 0) return new Set();
    const rows = await this.prisma.accessRequestStep.findMany({
      where: { requestId: { in: unique(requestIds) }, kind: 'SPEND_APPROVAL', state: { in: ['PENDING', 'WAITING'] } },
      select: { requestId: true },
    });

    return new Set(rows.map((row) => row.requestId));
  }

  /** The requests whose newest spend decision refused them, with what the approver wrote. */
  async spendRefusals(requestIds: readonly string[]): Promise<Map<string, { reason: string | null }>> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.spendDecision.findMany({
      where: { requestId: { in: unique(requestIds) } },
      orderBy: [{ requestId: 'asc' }, { decidedAt: 'desc' }],
      distinct: ['requestId'],
      select: {
        requestId: true,
        decision: true,
        step: { select: { approvalRecord: { select: { reason: true } } } },
      },
    });

    return new Map(
      rows
        .filter((row) => row.decision === 'REJECTED')
        .map((row) => [row.requestId, { reason: row.step.approvalRecord?.reason ?? null }]),
    );
  }

  /** What the person who decided the need wrote, by the need step they decided. */
  async needRefusals(stepIds: readonly string[]): Promise<OutcomeFacts['needRefusals']> {
    if (stepIds.length === 0) return new Map();
    const rows = await this.prisma.approvalRecord.findMany({
      where: { stepId: { in: unique(stepIds) }, decision: 'REJECTED' },
      select: { stepId: true, reason: true },
    });

    return new Map(rows.map((row) => [row.stepId, row.reason]));
  }

  /**
   * The line of one person in each of these requests for a group: its state, and why it ended without a grant (what the person who
   * refused it wrote, else what was written when it was closed). Only that person's line is read.
   */
  async linesOf(requestIds: readonly string[], employeeId: string): Promise<Map<string, MyLine>> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.accessRequestLine.findMany({
      where: { requestId: { in: unique(requestIds) }, employeeId },
      select: {
        requestId: true,
        state: true,
        endReason: true,
        decisions: { where: { decision: 'REJECTED' }, select: { reason: true }, take: 1 },
      },
    });

    return new Map(
      rows.map((row) => [
        row.requestId,
        { state: row.state, outcomeReason: row.decisions[0]?.reason ?? row.endReason },
      ]),
    );
  }

  /** The requests for which the head confirmed the use of the reserve of the budget: the fact, never the figure. */
  async reserveUsed(requestIds: readonly string[]): Promise<Set<string>> {
    if (requestIds.length === 0) return new Set();
    const rows = await this.prisma.requestReserveConfirmation.findMany({
      where: { requestId: { in: unique(requestIds) } },
      select: { requestId: true },
      distinct: ['requestId'],
    });

    return new Set(rows.map((row) => row.requestId));
  }

  /**
   * GH-3 (`BR-MF1-01g`): the requests flagged when they were sent because the person used many paid applications, with how many and the
   * reason given, by request; a request not flagged is absent.
   */
  async manyPaidSoftware(requestIds: readonly string[]): Promise<Map<string, { count: number; reason: string }>> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.accessRequest.findMany({
      where: { id: { in: unique(requestIds) }, manyPaidSoftware: true },
      select: { id: true, manyPaidSoftwareCount: true, manyPaidSoftwareReason: true },
    });
    const flags = new Map<string, { count: number; reason: string }>();
    for (const row of rows) {
      if (row.manyPaidSoftwareCount === null || row.manyPaidSoftwareReason === null) continue;
      flags.set(row.id, { count: row.manyPaidSoftwareCount, reason: row.manyPaidSoftwareReason });
    }

    return flags;
  }

  /** What the IT Admin wrote when they refused the software at the gate, by request. */
  async assessmentRefusals(requestIds: readonly string[]): Promise<OutcomeFacts['assessmentRefusals']> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.accessRequestAssessment.findMany({
      where: { requestId: { in: unique(requestIds) }, rejectionReason: { not: null } },
      select: { requestId: true, rejectionReason: true },
    });

    return new Map(rows.flatMap((row) => (row.rejectionReason === null ? [] : [[row.requestId, row.rejectionReason]])));
  }

  /**
   * The requests sent in the grace of a transfer by the person it is for (`limitExemption = TRANSFER_GRACE`, `QĐ-110q`) from an instant to another: who sent
   * it, when, and the day its grant was completed. Only these three facts leave. `departmentIds` narrows to the departments the requests are sent from.
   */
  async sentInTransferGrace(input: {
    from: Date;
    to: Date;
    departmentIds?: readonly string[] | undefined;
  }): Promise<{ requesterEmployeeId: string; submittedAt: Date; grantedOn: Date | null }[]> {
    if (input.departmentIds?.length === 0) return [];
    const rows = await this.prisma.accessRequest.findMany({
      where: {
        limitExemption: 'TRANSFER_GRACE',
        submittedAt: { gte: input.from, lt: input.to },
        ...(input.departmentIds ? { departmentId: { in: [...input.departmentIds] } } : {}),
      },
      select: { requesterEmployeeId: true, submittedAt: true, grantedOn: true },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    });

    return rows.flatMap((row) =>
      row.submittedAt
        ? [{ requesterEmployeeId: row.requesterEmployeeId, submittedAt: row.submittedAt, grantedOn: row.grantedOn }]
        : [],
    );
  }
}
