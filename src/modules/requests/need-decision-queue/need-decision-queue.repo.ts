import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { HELD_ROUTING_ROWS } from './need-decision-queue.policy';

export type NeedQueueType = 'GRANT' | 'SERVICE_ACCOUNT' | 'RENEWAL' | 'GROUP_GRANT';

/** The need steps that wait for one person, in the order the queue is read. */
const OPEN_ORDER: Prisma.AccessRequestStepOrderByWithRelationInput[] = [{ createdAt: 'asc' }, { id: 'asc' }];

const ROW_SELECT = {
  id: true,
  requestId: true,
  createdAt: true,
  assignedAt: true,
  slaWorkingDays: true,
  routingRow: true,
  samePersonAsSpend: true,
  // A group step holds the people still waiting on it, not all the people of the request.
  _count: { select: { lines: { where: { state: 'AWAITING_NEED' as const } } } },
  request: {
    select: {
      type: true,
      planId: true,
      departmentId: true,
      requesterEmployeeId: true,
      businessReason: true,
      termMonths: true,
      pricingStatus: true,
      amountMinor: true,
      amountCurrency: true,
      policy: true,
      proposal: { select: { softwareName: true } },
      renewal: { select: { consecutiveMonths: true } },
      beneficiaries: { select: { employeeId: true }, orderBy: { position: 'asc' as const }, take: 1 },
      _count: { select: { beneficiaries: true } },
    },
  },
} satisfies Prisma.AccessRequestStepSelect;

export type NeedQueueRow = Prisma.AccessRequestStepGetPayload<{ select: typeof ROW_SELECT }>;

/**
 * Who may be shown a step: not a request they sent, and not one they are for. A request for a group is for the people on its
 * lines, and the line of the person who decides the others is held by a step that is not theirs, so only the people on the
 * lines of this very step are left out of it.
 */
function notOwn(employeeId: string): Prisma.AccessRequestStepWhereInput {
  return {
    request: { requesterEmployeeId: { not: employeeId } },
    OR: [
      { request: { type: { not: 'GROUP_GRANT' }, beneficiaries: { none: { employeeId } } } },
      { request: { type: 'GROUP_GRANT' }, lines: { none: { employeeId } } },
    ],
  };
}

/**
 * The need steps the queue of a person reads: `NEED` steps that are pending and given to them now, of requests that are not
 * theirs. The only reader of the step table that answers "what waits for me" for the need step; it reads the row of the step as it
 * stands, so a step that moved to somebody else, or was decided or closed, is gone from the next read.
 */
@Injectable()
export class NeedDecisionQueueRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page, oldest first (`id` breaks ties, so the order never moves), and the total for the same filter. Both reads share one
   * snapshot, so a step decided meanwhile cannot make the total disagree with the page. Reads only; takes no row lock.
   */
  async pageOpenOf(employeeId: string, query: { type?: NeedQueueType; skip: number; take: number }) {
    const where: Prisma.AccessRequestStepWhereInput = {
      kind: 'NEED',
      state: 'PENDING',
      assigneeEmployeeId: employeeId,
      routingRow: { in: [...HELD_ROUTING_ROWS] },
      ...notOwn(employeeId),
      ...(query.type ? { AND: [{ request: { type: query.type } }] } : {}),
    };

    return this.prisma.$transaction(
      async (tx) => ({
        rows: await tx.accessRequestStep.findMany({
          where,
          orderBy: OPEN_ORDER,
          skip: query.skip,
          take: query.take,
          select: ROW_SELECT,
        }),
        total: await tx.accessRequestStep.count({ where }),
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
