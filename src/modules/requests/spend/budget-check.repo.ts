import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CheckRoute, YearResult } from './budget-check.policy';

export type CheckTrigger = 'SUBMISSION' | 'PLAN_LINE_MOVED' | 'BUDGET_VERSION_APPROVED' | 'SPEND_DECISION';

export interface CheckRecord {
  id: string;
  requestId: string;
  number: number;
  trigger: CheckTrigger;
  route: CheckRoute;
  staleCostEvidence: boolean;
  planLineOverdue: boolean;
  periodClosed: boolean;
  offPlan: boolean;
  currency: string;
  bindingTotalMinor: bigint;
  years: YearResult[];
  ranByEmployeeId: string | null;
  ranAt: Date;
}

export interface NewCheck {
  organizationId: string;
  requestId: string;
  trigger: CheckTrigger;
  route: CheckRoute;
  staleCostEvidence: boolean;
  planLineOverdue: boolean;
  periodClosed: boolean;
  offPlan: boolean;
  currency: string;
  bindingTotalMinor: bigint;
  years: readonly YearResult[];
  ranByEmployeeId: string | null;
  now: Date;
}

const WITH_YEARS = { yearResults: { orderBy: { year: 'asc' } } } as const satisfies Prisma.RequestBudgetCheckInclude;
type CheckRow = Prisma.RequestBudgetCheckGetPayload<{ include: typeof WITH_YEARS }>;
type YearRow = CheckRow['yearResults'][number];

const toYear = (row: YearRow): YearResult => ({
  year: row.year,
  costMinor: row.costMinor,
  code: row.code,
  versionId: row.versionId,
  budgetMinor: row.budgetMinor,
  heldMinor: row.heldMinor,
  spentMinor: row.spentMinor,
  remainingMinor: row.remainingMinor,
  shareBasisPoints: row.shareBasisPoints,
  pendingMinor: row.pendingMinor,
});

const toRecord = (row: CheckRow): CheckRecord => ({
  id: row.id,
  requestId: row.requestId,
  number: row.number,
  trigger: row.trigger,
  route: row.route,
  staleCostEvidence: row.staleCostEvidence,
  planLineOverdue: row.planLineOverdue,
  periodClosed: row.periodClosed,
  offPlan: row.offPlan,
  currency: row.currency,
  bindingTotalMinor: row.bindingTotalMinor,
  years: row.yearResults.map(toYear),
  ranByEmployeeId: row.ranByEmployeeId,
  ranAt: row.ranAt,
});

/** The one writer of `request_budget_checks` and their years, which the database keeps append-only (`INV-05`), and its reads. */
@Injectable()
export class BudgetCheckRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewCheck): Promise<CheckRecord> {
    const last = await tx.requestBudgetCheck.aggregate({
      where: { requestId: input.requestId },
      _max: { number: true },
    });
    const row = await tx.requestBudgetCheck.create({
      data: {
        organizationId: input.organizationId,
        requestId: input.requestId,
        number: (last._max.number ?? 0) + 1,
        trigger: input.trigger,
        route: input.route,
        staleCostEvidence: input.staleCostEvidence,
        planLineOverdue: input.planLineOverdue,
        periodClosed: input.periodClosed,
        offPlan: input.offPlan,
        currency: input.currency,
        bindingTotalMinor: input.bindingTotalMinor,
        ranByEmployeeId: input.ranByEmployeeId,
        ranAt: input.now,
        yearResults: { create: input.years.map((year) => ({ ...year })) },
      },
      include: WITH_YEARS,
    });

    return toRecord(row);
  }

  async latest(requestId: string, tx?: DbTx): Promise<CheckRecord | null> {
    const row = await (tx ?? this.prisma).requestBudgetCheck.findFirst({
      where: { requestId },
      orderBy: { number: 'desc' },
      include: WITH_YEARS,
    });

    return row ? toRecord(row) : null;
  }

  async findById(id: string, tx?: DbTx): Promise<CheckRecord | null> {
    const row = await (tx ?? this.prisma).requestBudgetCheck.findUnique({ where: { id }, include: WITH_YEARS });

    return row ? toRecord(row) : null;
  }

  /** The newest check of each of the requests, in one read. */
  async latestOf(requestIds: readonly string[], tx?: DbTx): Promise<Map<string, CheckRecord>> {
    if (requestIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).requestBudgetCheck.findMany({
      where: { requestId: { in: [...requestIds] } },
      orderBy: [{ requestId: 'asc' }, { number: 'desc' }],
      distinct: ['requestId'],
      include: WITH_YEARS,
    });

    return new Map(rows.map((row) => [row.requestId, toRecord(row)]));
  }

  /**
   * What the other requests of the Cost Center that wait for the spending approver cost in the year, as their own newest check
   * says (`US-06-01` AC-9): the cost that falls on the company, which is the cost counted again for the budget that is left.
   */
  async pendingFor(costCenterId: string, year: number, exceptRequestId: string, tx?: DbTx): Promise<bigint> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM(y.cost_minor)::bigint AS total
        FROM access_requests r
        JOIN LATERAL (
          SELECT c.id FROM request_budget_checks c WHERE c.request_id = r.id ORDER BY c.number DESC LIMIT 1
        ) latest ON true
        JOIN request_budget_check_years y ON y.check_id = latest.id AND y.year = ${year}
       WHERE r.cost_center_id = ${costCenterId}::uuid
         AND r.id <> ${exceptRequestId}::uuid
         AND EXISTS (
           SELECT 1 FROM access_request_steps s
            WHERE s.request_id = r.id AND s.kind = 'SPEND_APPROVAL' AND s.state IN ('PENDING', 'WAITING')
         )`;

    return rows[0]?.total ?? 0n;
  }

  /** One page of the years of a check, oldest year first. */
  async pageYears(checkId: string, skip: number, take: number): Promise<{ items: YearResult[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.requestBudgetCheckYear.findMany({ where: { checkId }, orderBy: { year: 'asc' }, skip, take }),
      this.prisma.requestBudgetCheckYear.count({ where: { checkId } }),
    ]);

    return { items: rows.map(toYear), total };
  }
}
