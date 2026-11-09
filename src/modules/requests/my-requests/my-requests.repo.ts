import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { requestPolicyJson } from '../access-request/access-request.json';
import { hasSpendStep } from '../access-request/access-request.policy';
import type { NeedStepState, ReadableNeedWaitingReason } from '../access-request/access-request.types';
import { needStepOf } from './my-requests.policy';
import type { MyRequestFilter, MyRequestRow, RequestScope, SentState } from './my-requests.types';

/** What a row of the list is read as: the columns of the summary, the first person it is for, how many there are, the need steps. */
const SELECT_ROW = {
  id: true,
  type: true,
  branch: true,
  state: true,
  requesterEmployeeId: true,
  departmentId: true,
  routingMode: true,
  oneStepReason: true,
  planId: true,
  termMonths: true,
  expectedEndDate: true,
  submittedAt: true,
  updatedAt: true,
  withdrawalRequestedAt: true,
  withdrawnAt: true,
  // Only the chain is read from it, to know whether there is a spend step.
  policy: true,
  beneficiaries: { select: { employeeId: true }, orderBy: { position: 'asc' }, take: 1 },
  _count: { select: { beneficiaries: true } },
  steps: {
    where: { kind: 'NEED' },
    select: { id: true, state: true, assigneeEmployeeId: true, waitingReason: true },
    orderBy: { sequence: 'asc' },
  },
} satisfies Prisma.AccessRequestSelect;

type Row = Prisma.AccessRequestGetPayload<{ select: typeof SELECT_ROW }>;

function toRow(row: Row): MyRequestRow {
  if (row.submittedAt === null)
    throw new Error(`The request ${row.id} has not been sent: it is a draft, not a row of the list.`);
  const step = needStepOf(row.steps);
  const isGroup = row.type === 'GROUP_GRANT';

  return {
    id: row.id,
    type: row.type,
    routing: {
      mode: row.routingMode,
      oneStepReason: row.oneStepReason as import('../access-request/routing.policy').OneStepReason | null,
    },
    branch: row.branch,
    // The filter of the page has no draft among its states.
    state: row.state as SentState,
    requesterEmployeeId: row.requesterEmployeeId,
    departmentId: row.departmentId,
    planId: row.planId,
    termMonths: row.termMonths,
    expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
    submittedAt: row.submittedAt,
    updatedAt: row.updatedAt,
    hasSpendStep: hasSpendStep(requestPolicyJson.decode(row.policy)),
    beneficiaryEmployeeId: isGroup ? null : (row.beneficiaries[0]?.employeeId ?? null),
    lineCount: row._count.beneficiaries,
    needStepId: step.id,
    needStep: {
      state: step.state as NeedStepState,
      assigneeEmployeeId: step.assigneeEmployeeId,
      waitingReason: step.waitingReason as ReadableNeedWaitingReason | null,
    },
    withdrawal: row.withdrawalRequestedAt === null ? null : { withdrawnAt: row.withdrawnAt },
  };
}

/** The requests of a scope (the caller's own, a department's, what a role oversees), as a list reads them. Reads only, no lock. */
@Injectable()
export class MyRequestsRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the requests of the scope, the newest first and then by id, and how many there are for the same filter. The page
   * and the count share one snapshot (RepeatableRead), so a request sent meanwhile cannot make the total disagree with the page.
   * Only requests that were sent are read: the state is always one of `states`, which has no draft.
   */
  async pageOf(filter: MyRequestFilter): Promise<{ rows: MyRequestRow[]; total: number }> {
    const where = whereOf(filter);
    const { rows, total } = await this.prisma.$transaction(
      async (tx) => ({
        rows: await tx.accessRequest.findMany({
          where,
          select: SELECT_ROW,
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          skip: filter.skip,
          take: filter.take,
        }),
        total: await tx.accessRequest.count({ where }),
      }),
      { isolationLevel: 'RepeatableRead' },
    );

    return { rows: rows.map(toRow), total };
  }

  /** The count of the requests of the scope for the same filter. */
  async countOf(filter: Omit<MyRequestFilter, 'skip' | 'take'>): Promise<number> {
    return this.prisma.accessRequest.count({ where: whereOf(filter) });
  }

  /** What the person who proposed software that is not in the catalog called it, by request. */
  async proposalNames(requestIds: readonly string[]): Promise<Map<string, string>> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.accessRequestProposal.findMany({
      where: { requestId: { in: [...requestIds] } },
      select: { requestId: true, softwareName: true },
    });

    return new Map(rows.map((row) => [row.requestId, row.softwareName]));
  }
}

function whereOf(filter: Omit<MyRequestFilter, 'skip' | 'take'>): Prisma.AccessRequestWhereInput {
  const sentAt: Prisma.DateTimeNullableFilter = {
    ...(filter.from === undefined ? {} : { gte: filter.from }),
    ...(filter.to === undefined ? {} : { lt: filter.to }),
  };
  const and: Prisma.AccessRequestWhereInput[] = [scopeOf(filter.scope)];
  if (filter.employeeId !== undefined) and.push(sentByOrFor(filter.employeeId));
  if (filter.departmentId !== undefined) and.push({ departmentId: filter.departmentId });
  if (filter.oneStep === true) and.push({ routingMode: 'ONE_STEP' });
  if (filter.reserveUsed === true) and.push({ reserveConfirmations: { some: {} } });

  return {
    AND: and,
    state: { in: [...filter.states] },
    ...(filter.type === undefined ? {} : { type: filter.type }),
    ...(Object.keys(sentAt).length === 0 ? {} : { submittedAt: sentAt }),
  };
}

const sentByOrFor = (employeeId: string): Prisma.AccessRequestWhereInput => ({
  OR: [{ requesterEmployeeId: employeeId }, { beneficiaries: { some: { employeeId } } }],
});

/** The one condition of whose the requests are; the narrowing of the filter only ever makes it smaller. */
function scopeOf(scope: RequestScope): Prisma.AccessRequestWhereInput {
  switch (scope.kind) {
    case 'SENT_BY':
      return { requesterEmployeeId: scope.employeeId };
    case 'FOR':
      return { beneficiaries: { some: { employeeId: scope.employeeId } } };
    case 'SENT_BY_OR_FOR':
      return sentByOrFor(scope.employeeId);
    case 'DEPARTMENT':
      return { departmentId: scope.departmentId };
    case 'OVERSIGHT':
      return oversightOf(scope);
  }
}

/** Every request; else those a spend step was opened on, and those whose spend was approved, for the roles the caller holds. */
function oversightOf(scope: Extract<RequestScope, { kind: 'OVERSIGHT' }>): Prisma.AccessRequestWhereInput {
  if (scope.all) return {};
  const any: Prisma.AccessRequestWhereInput[] = [];
  if (scope.spendStepOpened) any.push({ steps: { some: { kind: 'SPEND_APPROVAL' } } });
  if (scope.spendApproved) {
    any.push(
      { spendDecisions: { some: { decision: 'APPROVED' } } },
      { lines: { some: { decisions: { some: { stage: 'SPEND', decision: 'APPROVED' } } } } },
    );
  }

  // A scope that opens nothing reads nothing: the guard of the route never lets such a caller in.
  return any.length === 0 ? { id: { in: [] } } : { OR: any };
}
