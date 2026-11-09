import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { budgetYearLockKey } from '../../budgets/public/budget-year-lock-key.policy';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { BlockReason, BudgetOutcome, CheckRoute, YearResult } from './budget-check.policy';

/**
 * What set a check going: the head sending the request on, the head confirming the reserve, or the approver deciding. The checks made before
 * these rules have other triggers (a plan line moved, a budget version approved, Finance's outcome); they are read, never written now.
 */
export type CheckTrigger = 'SUBMISSION' | 'SPEND_DECISION' | 'RESERVE_CONFIRMATION';

/** What set a check going as it is read: the triggers of before are in the rows that were written then. */
export type RecordedTrigger =
  CheckTrigger | 'PLAN_LINE_MOVED' | 'BUDGET_VERSION_APPROVED' | 'FINANCE_OUTCOME_WHILE_WAITING';

export interface CheckRecord {
  id: string;
  requestId: string;
  number: number;
  trigger: RecordedTrigger;
  route: CheckRoute;
  staleCostEvidence: boolean;
  planLineOverdue: boolean;
  periodClosed: boolean;
  offPlan: boolean;
  /** Null for a check made before the three outcomes: it is read from its code. */
  outcome: BudgetOutcome | null;
  blockReasons: BlockReason[];
  overBaseByMinor: bigint | null;
  overByMinor: bigint | null;
  /** The Cost Center the check read; null for a check made before it was kept. */
  costCenterId: string | null;
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
  outcome: BudgetOutcome;
  blockReasons: readonly BlockReason[];
  overBaseByMinor: bigint | null;
  overByMinor: bigint | null;
  costCenterId: string | null;
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
  baseMinor: row.baseMinor,
  reserveMinor: row.reserveMinor,
  heldMinor: row.heldMinor,
  spentMinor: row.spentMinor,
  remainingMinor: row.remainingMinor,
  remainingBaseMinor: row.remainingBaseMinor,
  remainingWithReserveMinor: row.remainingWithReserveMinor,
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
  outcome: row.outcome,
  blockReasons: row.blockReasons as BlockReason[],
  overBaseByMinor: row.overBaseByMinor,
  overByMinor: row.overByMinor,
  costCenterId: row.costCenterId,
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
        planLineOverdue: false,
        periodClosed: false,
        offPlan: false,
        outcome: input.outcome,
        blockReasons: [...input.blockReasons],
        overBaseByMinor: input.overBaseByMinor,
        overByMinor: input.overByMinor,
        costCenterId: input.costCenterId,
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

  /**
   * Takes, until the transaction ends, the lock that serialises everything which reads or writes the budget of this Cost Center in
   * each of these years: the check of a request at its submission and at its decision, and the commitment written on approval, so
   * that two requests of one Cost Center and year are judged one after the other and the second reads what the first now holds. The
   * caller holds the lock of its request first, and the years go in ascending order, the same order every holder of these locks uses.
   */
  async lockBudgetYears(tx: DbTx, costCenterId: string, years: readonly number[]): Promise<void> {
    for (const year of [...new Set(years)].sort((a, b) => a - b)) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${budgetYearLockKey(costCenterId, year)}, 0))`;
    }
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
   * What the requests of the Cost Center that wait to be decided as spend cost in the year (`BR-MF1-06f`, RV-10): the one definition of
   * _a request that waits to be decided_, which the check reads and the budgets read through `PendingSpendContributions`. It is a request
   * whose newest check is within the base or uses the reserve (confirmed or not) and that has no decision yet: either its spend step is
   * open, or it waits in the queue of its head for the confirmation of the reserve, with no supplementary file after its newest check. A
   * blocked request is not counted (M-05), nor one with a check made before the three outcomes. The cost is the one that check kept, in
   * the reporting currency, in the year the check was made for: a request that waits over 01/01 counts in the new year when it is checked
   * again at its decision (`QĐ-109e`). `exceptRequestId` is the request that is being checked: it does not wait on itself.
   */
  async pendingFor(costCenterId: string, year: number, exceptRequestId: string | null, tx?: DbTx): Promise<bigint> {
    return (await this.pendingMany([{ costCenterId, year }], tx, exceptRequestId)).get(`${costCenterId}:${year}`) ?? 0n;
  }

  /** The same definition as a single check, grouped for every requested Cost Center and year in one statement. */
  async pendingMany(
    pairs: readonly { costCenterId: string; year: number }[],
    tx?: DbTx,
    exceptRequestId: string | null = null,
  ): Promise<Map<string, bigint>> {
    if (pairs.length === 0) return new Map();
    const wanted = Prisma.join(pairs.map((pair) => Prisma.sql`(${pair.costCenterId}::uuid, ${pair.year}::int)`));
    const rows = await (tx ?? this.prisma).$queryRaw<{ cost_center_id: string; year: number; total: bigint }[]>`
      SELECT COALESCE(latest.cost_center_id, r.cost_center_id) AS cost_center_id, y.year, SUM(y.cost_minor)::bigint AS total
        FROM access_requests r
        JOIN LATERAL (
          SELECT c.id, c.outcome, c.ran_at, c.cost_center_id
            FROM request_budget_checks c WHERE c.request_id = r.id ORDER BY c.number DESC LIMIT 1
        ) latest ON true
        JOIN request_budget_check_years y ON y.check_id = latest.id
       WHERE (COALESCE(latest.cost_center_id, r.cost_center_id), y.year) IN (${wanted})
         AND (${exceptRequestId}::uuid IS NULL OR r.id <> ${exceptRequestId}::uuid)
         AND latest.outcome IN ('WITHIN_BASE', 'USES_RESERVE')
         AND (
           EXISTS (
             SELECT 1 FROM access_request_steps s
              WHERE s.request_id = r.id AND s.kind = 'SPEND_APPROVAL' AND s.state IN ('PENDING', 'WAITING')
           )
           OR (r.state = 'AWAITING_SPEND_SUBMISSION' AND latest.outcome = 'USES_RESERVE'
               AND NOT EXISTS (SELECT 1 FROM request_supplements p WHERE p.request_id = r.id AND p.created_at > latest.ran_at))
         )
       GROUP BY COALESCE(latest.cost_center_id, r.cost_center_id), y.year`;

    return new Map(rows.map((row) => [`${row.cost_center_id}:${row.year}`, row.total]));
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
