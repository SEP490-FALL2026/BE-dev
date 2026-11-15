import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
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

  /** Removes these rows; the ones that took a commitment down are not among them (an expense does not come back, see `SeatMonthService`). */
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

  async insertMany(tx: DbTx, rows: readonly NewSeatMonthCharge[]): Promise<void> {
    if (rows.length === 0) return;
    await tx.seatMonthCharge.createMany({
      data: rows.map((row) => ({ ...row, month: toDateColumn(row.month) })),
    });
  }

  /** How many rows a month has, in all: a month with none was never charged, or had no seat to charge. */
  countOfMonth(month: BusinessDate, tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).seatMonthCharge.count({ where: { month: toDateColumn(month) } });
  }
}
