import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** A seat-month as it is kept: what one seat cost one department in one month (`SM-1`). */
export interface SeatMonthChargeRecord {
  id: string;
  organizationId: string;
  subscriptionId: string;
  assignmentId: string;
  employeeId: string;
  departmentId: string;
  /** Null for a department with no Cost Center yet. */
  costCenterId: string | null;
  /** The first day of the month. */
  month: BusinessDate;
  days: number;
  daysInMonth: number;
  monthlyPriceMinor: bigint;
  amountMinor: bigint;
  commitmentId: string | null;
  appliedMinor: bigint;
  computedAt: Date;
}

export type NewSeatMonthCharge = Omit<SeatMonthChargeRecord, 'id'>;

const toRecord = (row: Prisma.SeatMonthChargeGetPayload<object>): SeatMonthChargeRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  subscriptionId: row.subscriptionId,
  assignmentId: row.assignmentId,
  employeeId: row.employeeId,
  departmentId: row.departmentId,
  costCenterId: row.costCenterId,
  month: fromDateColumn(row.month),
  days: row.days,
  daysInMonth: row.daysInMonth,
  monthlyPriceMinor: row.monthlyPriceMinor,
  amountMinor: row.amountMinor,
  commitmentId: row.commitmentId,
  appliedMinor: row.appliedMinor,
  computedAt: row.computedAt,
});

/**
 * The one reader and writer of `seat_month_charges` (`SM-1`): the rows of a subscription and a month are replaced together, so a month charged
 * twice is the same rows. What the rows cost a Cost Center in a year is read by `InvoiceRepo.spentOf`, beside the invoices, in one statement.
 */
@Injectable()
export class SeatMonthRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Serialises two computations of the same subscription and month until the transaction ends. */
  async lockMonthOf(tx: DbTx, subscriptionId: string, month: BusinessDate): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`seat-month:${subscriptionId}:${month}`}, 0))`;
  }

  /** The rows of a subscription and a month, by assignment then department. */
  async ofSubscriptionMonth(tx: DbTx, subscriptionId: string, month: BusinessDate): Promise<SeatMonthChargeRecord[]> {
    const rows = await tx.seatMonthCharge.findMany({
      where: { subscriptionId, month: toDateColumn(month) },
      orderBy: [{ assignmentId: 'asc' }, { departmentId: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** What a seat-month gave back to a commitment, one row for each, written before the commitment is held again (the guard of the commitments checks the sum). */
  async insertReversals(
    tx: DbTx,
    rows: readonly {
      organizationId: string;
      commitmentId: string;
      subscriptionId: string;
      assignmentId: string;
      departmentId: string;
      month: BusinessDate;
      amountMinor: bigint;
      reason: 'RECALCULATED' | 'SEAT_NOT_ASKED';
      createdAt: Date;
    }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await tx.budgetCommitmentSeatMonthReversal.createMany({
      data: rows.map((row) => ({ ...row, month: toDateColumn(row.month) })),
    });
  }

  /** Removes these rows of a month charged again; what they applied to a commitment was given back first, by a reversal. */
  async deleteRows(tx: DbTx, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await tx.seatMonthCharge.deleteMany({ where: { id: { in: [...ids] } } });
  }

  /** Each id of a subscription that has at least one row in the month: the ones to look at again when a month is charged again. */
  async subscriptionIdsOfMonth(month: BusinessDate, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).seatMonthCharge.findMany({
      where: { month: toDateColumn(month) },
      select: { subscriptionId: true },
      distinct: ['subscriptionId'],
    });

    return rows.map((row) => row.subscriptionId);
  }

  /** Each id of a subscription already charged for the month (its mark is written with its rows): what the sweeper leaves alone. */
  async completedSubscriptionIds(month: BusinessDate, tx?: DbTx): Promise<Set<string>> {
    const rows = await (tx ?? this.prisma).seatMonthRun.findMany({
      where: { month: toDateColumn(month) },
      select: { subscriptionId: true },
    });

    return new Set(rows.map((row) => row.subscriptionId));
  }

  /** Whether the subscription has its mark for the month: read under the lock of the month, it tells a pass that waited for the lock that another one charged it. */
  async isCharged(tx: DbTx, subscriptionId: string, month: BusinessDate): Promise<boolean> {
    const mark = await tx.seatMonthRun.findUnique({
      where: { subscriptionId_month: { subscriptionId, month: toDateColumn(month) } },
      select: { subscriptionId: true },
    });

    return mark !== null;
  }

  /** Writes the mark that the subscription was charged for the month, or moves it when it is charged again; in the transaction of the charge. */
  async markCharged(
    tx: DbTx,
    input: { organizationId: string; subscriptionId: string; month: BusinessDate; rows: number; now: Date },
  ): Promise<void> {
    const month = toDateColumn(input.month);
    await tx.seatMonthRun.upsert({
      where: { subscriptionId_month: { subscriptionId: input.subscriptionId, month } },
      create: {
        organizationId: input.organizationId,
        subscriptionId: input.subscriptionId,
        month,
        rows: input.rows,
        completedAt: input.now,
      },
      update: { rows: input.rows, completedAt: input.now },
    });
  }

  async insertMany(tx: DbTx, rows: readonly NewSeatMonthCharge[]): Promise<void> {
    if (rows.length === 0) return;
    await tx.seatMonthCharge.createMany({
      data: rows.map((row) => ({ ...row, month: toDateColumn(row.month) })),
    });
  }

  /** One page of the rows of a month, by Cost Center then person; narrowed to some Cost Centers (a manager's own) and to a subscription. */
  async page(filter: {
    month: BusinessDate;
    costCenterIds?: readonly string[];
    subscriptionId?: string;
    skip: number;
    take: number;
  }): Promise<{ rows: SeatMonthChargeRecord[]; total: number }> {
    const where: Prisma.SeatMonthChargeWhereInput = {
      month: toDateColumn(filter.month),
      ...(filter.costCenterIds ? { costCenterId: { in: [...filter.costCenterIds] } } : {}),
      ...(filter.subscriptionId ? { subscriptionId: filter.subscriptionId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.seatMonthCharge.findMany({
        where,
        orderBy: [{ costCenterId: 'asc' }, { employeeId: 'asc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.seatMonthCharge.count({ where }),
    ]);

    return { rows: rows.map(toRecord), total };
  }

  /**
   * What the pool figures of each subscription and month in `[from, until)` need: what its invoices cost (the ones booked to the subscription with no
   * commitment and no Cost Center, `QĐ-104c`, only for the ids given: the pool of shared seats, never the purchase of a department), what the seat-months took
   * of it, and the part of those that fell to a department with no Cost Center yet (`SM1-05`). The line itself is the seats paid for less the seat-months
   * (`poolLineMinor`), worked out by the caller; nothing is stored. Narrowed to one subscription when `only` is given.
   */
  async monthlyFigures(input: {
    from: BusinessDate;
    until: BusinessDate;
    invoicedIds: readonly string[];
    only?: string;
  }): Promise<
    {
      subscriptionId: string;
      month: BusinessDate;
      invoicedMinor: bigint;
      allocatedMinor: bigint;
      withoutCostCenterMinor: bigint;
    }[]
  > {
    const only = (column: string) =>
      input.only ? Prisma.sql`AND ${Prisma.raw(column)} = ${input.only}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      {
        subscription_id: string;
        month: string;
        invoiced: string;
        allocated: string;
        without_cost_center: string;
      }[]
    >`
      SELECT COALESCE(i.subscription_id, a.subscription_id) AS subscription_id,
             to_char(COALESCE(i.month, a.month), 'YYYY-MM-DD') AS month,
             COALESCE(i.invoiced, 0)::text AS invoiced, COALESCE(a.allocated, 0)::text AS allocated,
             COALESCE(a.without_cost_center, 0)::text AS without_cost_center
        FROM (SELECT subscription_id, service_month AS month, SUM(actual_cost_minor) AS invoiced FROM invoices
               WHERE subscription_id = ANY(${[...input.invoicedIds]}::uuid[]) AND commitment_id IS NULL AND cost_center_id IS NULL
                 AND service_month >= ${input.from}::date AND service_month < ${input.until}::date ${only('subscription_id')}
               GROUP BY subscription_id, service_month) i
        FULL JOIN (SELECT subscription_id, month, SUM(amount_minor) AS allocated,
                          SUM(amount_minor) FILTER (WHERE cost_center_id IS NULL) AS without_cost_center
                     FROM seat_month_charges
                    WHERE month >= ${input.from}::date AND month < ${input.until}::date ${only('subscription_id')}
                    GROUP BY subscription_id, month) a ON a.subscription_id = i.subscription_id AND a.month = i.month
       ORDER BY 1, 2`;

    return rows.map((row) => ({
      subscriptionId: row.subscription_id,
      month: row.month,
      invoicedMinor: BigInt(row.invoiced),
      allocatedMinor: BigInt(row.allocated),
      withoutCostCenterMinor: BigInt(row.without_cost_center),
    }));
  }

  /**
   * What the year cost the company and what of it fell to no Cost Center (`MG-03`, `SM1-05`): every invoice of the year whatever it is booked to, and the
   * seat-months of the year of a department that has no Cost Center yet. The year of an invoice is the one of the month it pays for, else its commitment's.
   * An invoice that has allocation lines (W3-26) counts by its lines, whatever their bucket and Cost Center, in the year of the month of each line.
   */
  async yearTotals(year: number): Promise<{ companyMinor: bigint; withoutCostCenterMinor: bigint }> {
    const rows = await this.prisma.$queryRaw<{ company: string; without_cost_center: string }[]>`
      SELECT (COALESCE(SUM(i.actual_cost_minor) FILTER (WHERE NOT EXISTS (SELECT 1 FROM invoice_allocations a WHERE a.invoice_id = i.id)), 0)
              + (SELECT COALESCE(SUM(l.amount_minor), 0) FROM invoice_allocations l WHERE EXTRACT(YEAR FROM l.month)::int = ${year}::int))::text AS company,
             (SELECT COALESCE(SUM(s.amount_minor), 0)::text FROM seat_month_charges s
               WHERE EXTRACT(YEAR FROM s.month)::int = ${year}::int AND s.cost_center_id IS NULL) AS without_cost_center
        FROM invoices i LEFT JOIN budget_commitments c ON c.id = i.commitment_id
       WHERE COALESCE(EXTRACT(YEAR FROM i.service_month)::int, c.year) = ${year}::int`;
    const row = rows[0];

    return {
      companyMinor: BigInt(row?.company ?? '0'),
      withoutCostCenterMinor: BigInt(row?.without_cost_center ?? '0'),
    };
  }

  /** How many rows a month has, in all: a month with none was never charged, or had no seat to charge. */
  countOfMonth(month: BusinessDate, tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).seatMonthCharge.count({ where: { month: toDateColumn(month) } });
  }
}
