import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { initialExplanationStatus, type ExplanationStatus } from './budget-review-explanation.policy';
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
  /** The last day the heads are asked to explain a quarter by (the fifth working day from the close); null for a month. */
  explanationsDueOn?: BusinessDate | null | undefined;
}

/** What the picture of a period keeps of one Cost Center. */
export interface NewReviewLine {
  costCenterId: string;
  baseMinor: bigint;
  reserveMinor: bigint;
  /** What was spent through the end of the month closed, and what was already recorded for the months after it. */
  spentMinor: bigint;
  spentAfterMonthMinor: bigint;
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
  explanationsDueOn: BusinessDate | null;
  id: string;
  state: ReviewState;
  signedByEmployeeId: string | null;
  signedAt: Date | null;
  note: string | null;
}

/** What the head of a department gave as the explanation of a line (`RV-3`, `QĐ-111ah`). */
export interface LineExplanation {
  cause: string;
  persistence: 'ONE_OFF' | 'ONGOING';
  action: string;
  needsAmountMinor: bigint | null;
  needsNote: string;
  explainedByEmployeeId: string;
  explainedAt: Date;
}

export interface ReviewLineRecord extends NewReviewLine {
  id: string;
  periodId: string;
  explanationStatus: ExplanationStatus;
  explanation: LineExplanation | null;
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
  explanationsDueOn: row.explanationsDueOn === null ? null : fromDateColumn(row.explanationsDueOn),
});

interface LineRow {
  id: string;
  period_id: string;
  cost_center_id: string;
  base_minor: bigint;
  reserve_minor: bigint;
  spent_minor: bigint;
  spent_after_month_minor: bigint;
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
  explanation_status: string;
  explanation_cause: string | null;
  explanation_persistence: string | null;
  explanation_action: string | null;
  explanation_needs_amount_minor: bigint | null;
  explanation_needs_note: string | null;
  explained_by_employee_id: string | null;
  explained_at: Date | null;
}

const toLine = (row: LineRow): ReviewLineRecord => ({
  id: row.id,
  periodId: row.period_id,
  costCenterId: row.cost_center_id,
  baseMinor: row.base_minor,
  reserveMinor: row.reserve_minor,
  spentMinor: row.spent_minor,
  spentAfterMonthMinor: row.spent_after_month_minor,
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
  explanationStatus: row.explanation_status as ExplanationStatus,
  explanation:
    row.explanation_status === 'EXPLAINED' && row.explanation_cause !== null && row.explained_at !== null
      ? {
          cause: row.explanation_cause,
          persistence: row.explanation_persistence as 'ONE_OFF' | 'ONGOING',
          action: row.explanation_action ?? '',
          needsAmountMinor: row.explanation_needs_amount_minor,
          needsNote: row.explanation_needs_note ?? '',
          explainedByEmployeeId: row.explained_by_employee_id ?? '',
          explainedAt: row.explained_at,
        }
      : null,
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
    // A quarter opens waiting for the explanations of its yellow, red and under Cost Centers (`RV-3`); a month is closed on its figures.
    const created = await tx.budgetReviewPeriod.create({
      data: {
        ...period,
        explanationsDueOn: period.explanationsDueOn ? toDateColumn(period.explanationsDueOn) : null,
        state: period.kind === 'QUARTER' ? 'AWAITING_EXPLANATIONS' : 'SNAPSHOT',
      },
    });
    if (lines.length > 0) {
      await tx.budgetReviewLine.createMany({
        data: lines.map(({ invoiceBasisMinor, ...line }) => ({
          ...line,
          invoiceNetMinor: invoiceBasisMinor,
          periodId: created.id,
          explanationStatus: initialExplanationStatus(period.kind, line.light),
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

  /** The period read with a lock that the signature queues behind (`FOR SHARE`): what an explanation reads before it writes, so a period signed in between is read as signed. */
  async findSharedLocked(tx: DbTx, id: string): Promise<ReviewPeriodRecord | null> {
    await tx.$queryRaw`SELECT id FROM budget_review_periods WHERE id = ${id}::uuid FOR SHARE`;

    return this.findById(id, tx);
  }

  /** The period read with a lock that nothing else takes at the same time (`FOR UPDATE`): what the signature reads before it marks the lines still waiting. */
  async findExclusiveLocked(tx: DbTx, id: string): Promise<ReviewPeriodRecord | null> {
    await tx.$queryRaw`SELECT id FROM budget_review_periods WHERE id = ${id}::uuid FOR UPDATE`;

    return this.findById(id, tx);
  }

  async findLine(tx: DbTx, periodId: string, costCenterId: string): Promise<ReviewLineRecord | null> {
    const rows = await tx.$queryRaw<LineRow[]>`
      SELECT * FROM budget_review_lines WHERE period_id = ${periodId}::uuid AND cost_center_id = ${costCenterId}::uuid`;

    return rows.length === 0 ? null : toLine(rows[0]);
  }

  /** Writes the explanation of a line that was asked, once or again while the period waits (a trigger refuses it otherwise). */
  async explain(
    tx: DbTx,
    lineId: string,
    explanation: Omit<LineExplanation, 'explainedAt'> & { at: Date },
  ): Promise<void> {
    await tx.budgetReviewLine.update({
      where: { id: lineId },
      data: {
        explanationStatus: 'EXPLAINED',
        explanationCause: explanation.cause,
        explanationPersistence: explanation.persistence,
        explanationAction: explanation.action,
        explanationNeedsAmountMinor: explanation.needsAmountMinor,
        explanationNeedsNote: explanation.needsNote,
        explainedByEmployeeId: explanation.explainedByEmployeeId,
        explainedAt: explanation.at,
      },
    });
  }

  /** The Cost Centers of the period that were asked and have not answered, in order of id. */
  async pendingCostCenterIds(tx: DbTx, periodId: string): Promise<string[]> {
    const rows = await tx.budgetReviewLine.findMany({
      where: { periodId, explanationStatus: 'PENDING' },
      select: { costCenterId: true },
      orderBy: { costCenterId: 'asc' },
    });

    return rows.map((row) => row.costCenterId);
  }

  /** The Cost Centers of the period that were asked and have not answered, with their light, in order of id: who is asked the day the quarter opens. */
  async pendingLines(tx: DbTx, periodId: string): Promise<Array<{ costCenterId: string; light: ReviewLight }>> {
    const rows = await tx.budgetReviewLine.findMany({
      where: { periodId, explanationStatus: 'PENDING' },
      select: { costCenterId: true, light: true },
      orderBy: { costCenterId: 'asc' },
    });

    return rows.map((row) => ({ costCenterId: row.costCenterId, light: row.light as ReviewLight }));
  }

  /** What the lines still waiting become when Finance signs: `UNEXPLAINED` for the Cost Centers whose department has a head, `NO_HEAD` for the others (R-10, R-17). */
  async closePending(tx: DbTx, periodId: string, noHead: readonly string[]): Promise<void> {
    await tx.budgetReviewLine.updateMany({
      where: { periodId, explanationStatus: 'PENDING', costCenterId: { notIn: [...noHead] } },
      data: { explanationStatus: 'UNEXPLAINED' },
    });
    await tx.budgetReviewLine.updateMany({
      where: { periodId, explanationStatus: 'PENDING', costCenterId: { in: [...noHead] } },
      data: { explanationStatus: 'NO_HEAD' },
    });
  }

  /** The quarters that wait for explanations and are due on or before `today`, with the Cost Centers that were asked and have not answered: what the reminder reads. */
  async awaitingUntil(
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<Array<{ period: ReviewPeriodRecord; pendingCostCenterIds: string[] }>> {
    const db = tx ?? this.prisma;
    const periods = await db.budgetReviewPeriod.findMany({
      where: { state: 'AWAITING_EXPLANATIONS', explanationsDueOn: { lte: toDateColumn(today) } },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    const found: Array<{ period: ReviewPeriodRecord; pendingCostCenterIds: string[] }> = [];
    for (const period of periods) {
      const lines = await db.budgetReviewLine.findMany({
        where: { periodId: period.id, explanationStatus: 'PENDING' },
        select: { costCenterId: true },
        orderBy: { costCenterId: 'asc' },
      });
      if (lines.length > 0)
        found.push({ period: toPeriod(period), pendingCostCenterIds: lines.map((line) => line.costCenterId) });
    }

    return found;
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
