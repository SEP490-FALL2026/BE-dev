import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { BlockReason } from '../spend/budget-check.policy';
import type { OutcomeFacts, QueuedCheck } from './my-requests.types';

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

  /** What the IT Admin wrote when they refused the software at the gate, by request. */
  async assessmentRefusals(requestIds: readonly string[]): Promise<OutcomeFacts['assessmentRefusals']> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.accessRequestAssessment.findMany({
      where: { requestId: { in: unique(requestIds) }, rejectionReason: { not: null } },
      select: { requestId: true, rejectionReason: true },
    });

    return new Map(rows.flatMap((row) => (row.rejectionReason === null ? [] : [[row.requestId, row.rejectionReason]])));
  }
}
