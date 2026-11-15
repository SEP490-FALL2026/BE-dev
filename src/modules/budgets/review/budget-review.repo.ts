import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ReviewKind, ReviewLight, ReviewState } from './budget-review.types';

/** What the picture of a period keeps of the company and of the month. */
export interface NewReviewPeriod {
  organizationId: string;
  year: number;
  month: number;
  kind: ReviewKind;
  currency: string;
  snapshotByEmployeeId: string;
  snapshotAt: Date;
  companySpentMinor: bigint;
  sharedPoolUnallocatedMinor: bigint;
  sharedPoolReserveMinor: bigint | null;
  annualCeilingMinor: bigint | null;
}

/** What the picture of a period keeps of one Cost Center. */
export interface NewReviewLine {
  costCenterId: string;
  baseMinor: bigint;
  reserveMinor: bigint;
  spentMinor: bigint;
  committedMinor: bigint;
  pendingSpendMinor: bigint;
  remainingMinor: bigint;
  /** The price in the commitments of what the invoices took down (the column `invoice_net_minor`), and what those invoices cost: the two sides of k. */
  invoiceBasisMinor: bigint;
  invoiceActualMinor: bigint;
  variancePpm: bigint;
  priceIncreaseMinor: bigint;
  forecastMinor: bigint;
  paceBasisPoints: bigint | null;
  light: ReviewLight;
}

export interface ReviewPeriodRecord extends NewReviewPeriod {
  id: string;
  state: ReviewState;
  signedByEmployeeId: string | null;
  signedAt: Date | null;
  note: string | null;
}

export interface ReviewLineRecord extends NewReviewLine {
  id: string;
  periodId: string;
}

export type ReviewLightCounts = Record<ReviewLight, number>;

const toPeriod = (row: Prisma.BudgetReviewPeriodGetPayload<object>): ReviewPeriodRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  year: row.year,
  month: row.month,
  kind: row.kind as ReviewKind,
  state: row.state as ReviewState,
  currency: row.currency,
  snapshotByEmployeeId: row.snapshotByEmployeeId,
  snapshotAt: row.snapshotAt,
  signedByEmployeeId: row.signedByEmployeeId,
  signedAt: row.signedAt,
  note: row.note,
  companySpentMinor: row.companySpentMinor,
  sharedPoolUnallocatedMinor: row.sharedPoolUnallocatedMinor,
  sharedPoolReserveMinor: row.sharedPoolReserveMinor,
  annualCeilingMinor: row.annualCeilingMinor,
});

interface LineRow {
  id: string;
  period_id: string;
  cost_center_id: string;
  base_minor: bigint;
  reserve_minor: bigint;
  spent_minor: bigint;
  committed_minor: bigint;
  pending_spend_minor: bigint;
  remaining_minor: bigint;
  invoice_net_minor: bigint;
  invoice_actual_minor: bigint;
  variance_ppm: bigint;
  price_increase_minor: bigint;
  forecast_minor: bigint;
  pace_basis_points: bigint | null;
  light: string;
}

const toLine = (row: LineRow): ReviewLineRecord => ({
  id: row.id,
  periodId: row.period_id,
  costCenterId: row.cost_center_id,
  baseMinor: row.base_minor,
  reserveMinor: row.reserve_minor,
  spentMinor: row.spent_minor,
  committedMinor: row.committed_minor,
  pendingSpendMinor: row.pending_spend_minor,
  remainingMinor: row.remaining_minor,
  invoiceBasisMinor: row.invoice_net_minor,
  invoiceActualMinor: row.invoice_actual_minor,
  variancePpm: row.variance_ppm,
  priceIncreaseMinor: row.price_increase_minor,
  forecastMinor: row.forecast_minor,
  paceBasisPoints: row.pace_basis_points,
  light: row.light as ReviewLight,
});

/**
 * The one writer of `budget_review_periods` and `budget_review_lines` (`RV-1`, `QĐ-111ae`) and their reads. A period is written once with its lines, in one
 * transaction, and is never edited: the database refuses to change a figure, and only the state moves, forward, when Finance signs (`R-2`).
 */
@Injectable()
export class BudgetReviewRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the period and its lines. The unique key of the month refuses a second one: the caller reads that as "closed already". */
  async insert(tx: DbTx, period: NewReviewPeriod, lines: readonly NewReviewLine[]): Promise<ReviewPeriodRecord> {
    const created = await tx.budgetReviewPeriod.create({ data: { ...period, state: 'SNAPSHOT' } });
    if (lines.length > 0) {
      await tx.budgetReviewLine.createMany({
        data: lines.map(({ invoiceBasisMinor, ...line }) => ({
          ...line,
          invoiceNetMinor: invoiceBasisMinor,
          periodId: created.id,
        })),
      });
    }

    return toPeriod(created);
  }

  async findById(id: string, tx?: DbTx): Promise<ReviewPeriodRecord | null> {
    const row = await (tx ?? this.prisma).budgetReviewPeriod.findUnique({ where: { id } });

    return row ? toPeriod(row) : null;
  }

  async findByMonth(
    organizationId: string,
    year: number,
    month: number,
    tx?: DbTx,
  ): Promise<ReviewPeriodRecord | null> {
    const row = await (tx ?? this.prisma).budgetReviewPeriod.findUnique({
      where: { organizationId_year_month: { organizationId, year, month } },
    });

    return row ? toPeriod(row) : null;
  }

  /** One page of the periods, the latest month first, the total read in the same snapshot. */
  async page(query: {
    organizationId: string;
    year?: number;
    skip: number;
    take: number;
  }): Promise<{ rows: ReviewPeriodRecord[]; total: number }> {
    const where = { organizationId: query.organizationId, ...(query.year === undefined ? {} : { year: query.year }) };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.budgetReviewPeriod.findMany({
          where,
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          skip: query.skip,
          take: query.take,
        });

        return { rows: rows.map(toPeriod), total: await tx.budgetReviewPeriod.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * One page of the lines of a period, the Cost Centers that need the eye first (red, yellow, under, then green) and then by Cost Center, the total in the
   * same snapshot. `costCenterIds` limits the lines to those Cost Centers (a manager reads only their own); an empty list is no line.
   */
  async linesPage(query: {
    periodId: string;
    costCenterIds?: readonly string[];
    skip: number;
    take: number;
  }): Promise<{ rows: ReviewLineRecord[]; total: number }> {
    if (query.costCenterIds && query.costCenterIds.length === 0) return { rows: [], total: 0 };
    const scope = query.costCenterIds
      ? Prisma.sql`AND cost_center_id = ANY(${[...query.costCenterIds]}::uuid[])`
      : Prisma.empty;

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<LineRow[]>`
          SELECT * FROM budget_review_lines
           WHERE period_id = ${query.periodId}::uuid ${scope}
           ORDER BY CASE light WHEN 'RED' THEN 0 WHEN 'YELLOW' THEN 1 WHEN 'UNDER' THEN 2 ELSE 3 END, cost_center_id
           LIMIT ${query.take} OFFSET ${query.skip}`;
        const count = await tx.$queryRaw<{ total: bigint }[]>`
          SELECT count(*) AS total FROM budget_review_lines WHERE period_id = ${query.periodId}::uuid ${scope}`;

        return { rows: rows.map(toLine), total: Number(count[0].total) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * How many Cost Centers of each period have each light, in one statement: what the summary of the month tells the spending approver. `costCenterIds` limits it to
   * a manager's own Cost Centers; a period with no line has all zeros.
   */
  async lightCountsOf(
    periodIds: readonly string[],
    costCenterIds?: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, ReviewLightCounts>> {
    const counts = new Map<string, ReviewLightCounts>(
      periodIds.map((id) => [id, { GREEN: 0, YELLOW: 0, RED: 0, UNDER: 0 }]),
    );
    if (periodIds.length === 0) return counts;
    const groups = await (tx ?? this.prisma).budgetReviewLine.groupBy({
      by: ['periodId', 'light'],
      where: {
        periodId: { in: [...periodIds] },
        ...(costCenterIds ? { costCenterId: { in: [...costCenterIds] } } : {}),
      },
      _count: { _all: true },
    });
    for (const group of groups) {
      const of = counts.get(group.periodId);
      if (of) of[group.light as ReviewLight] = group._count._all;
    }

    return counts;
  }

  /** The Cost Centers of the period, in order of id: what the head of a department is told when a month is closed. */
  async costCenterIdsOf(periodId: string, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).budgetReviewLine.findMany({
      where: { periodId },
      select: { costCenterId: true },
      orderBy: { costCenterId: 'asc' },
    });

    return rows.map((row) => row.costCenterId);
  }

  /**
   * Signs the period once: only a period that is not signed, and only into `SIGNED`. False when it was signed already (two signatures at the same moment, the
   * second finds nothing to sign).
   */
  async sign(tx: DbTx, id: string, by: { employeeId: string; at: Date; note: string | null }): Promise<boolean> {
    const done = await tx.budgetReviewPeriod.updateMany({
      where: { id, state: { in: ['SNAPSHOT', 'AWAITING_EXPLANATIONS'] } },
      data: { state: 'SIGNED', signedByEmployeeId: by.employeeId, signedAt: by.at, note: by.note },
    });

    return done.count === 1;
  }
}
