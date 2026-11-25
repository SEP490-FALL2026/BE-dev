import { Injectable } from '@nestjs/common';
import { addDays, fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { seatHeldRange } from '../../../core/seat-month-cost';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SeatInForce, SeatOfMonth } from '../public/licensing-seat-month.types';
import { AssignmentChainRepo } from './assignment-chain.repo';

/**
 * What is read of the seats on subscriptions for the cost of a month (`SM-1`): a read that no write goes through (the writer of
 * `license_assignments` is `AssignmentRepo`; the request of a seat is read by the chain it was carried through, `AssignmentChainRepo`). A seat counts for the days it is in force (`seatHeldRange`), and a seat whose grant failed or was
 * cancelled never was.
 */
@Injectable()
export class AssignmentSeatMonthRepo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chains: AssignmentChainRepo,
  ) {}

  /** The plans that have a seat on a subscription (or on `subscriptionId`, when given) touching `[start, nextStart)`, in one statement. */
  async planIdsTouching(
    start: BusinessDate,
    nextStart: BusinessDate,
    tx?: DbTx,
    subscriptionId?: string,
  ): Promise<string[]> {
    const rows = await (tx ?? this.prisma).licenseAssignment.findMany({
      where: this.touching(start, nextStart, subscriptionId),
      select: { planId: true },
      distinct: ['planId'],
    });

    return rows.map((row) => row.planId);
  }

  /**
   * The seats of these plans on a subscription (or on `subscriptionId`, when given) that are in force on at least one day of `[start, nextStart)`, with the
   * request that asked for each.
   */
  async seatsOfPlans(
    planIds: readonly string[],
    start: BusinessDate,
    nextStart: BusinessDate,
    tx?: DbTx,
    subscriptionId?: string,
  ): Promise<SeatOfMonth[]> {
    const held = await this.loadHeldSeats(planIds, start, nextStart, tx, subscriptionId);

    return held.map(({ row, heldRange, requestId }) => ({
      assignmentId: row.id,
      subscriptionId: row.subscriptionId,
      planId: row.planId,
      employeeId: row.employeeId,
      kind: row.kind,
      owningDepartmentId: row.owningDepartmentId,
      heldFrom: heldRange.from,
      heldUntil: heldRange.until,
      requestId,
    }));
  }

  /**
   * The seats of these plans that are in force on `day` (`heldFrom <= day && (heldUntil === null || day < heldUntil)`),
   * with source, holder, owning department, and resolved chain request id.
   */
  async seatsInForceOfPlans(planIds: readonly string[], day: BusinessDate, tx?: DbTx): Promise<SeatInForce[]> {
    const held = await this.loadHeldSeats(planIds, day, addDays(day, 1), tx);

    return held.map(({ row, heldRange, requestId }) => ({
      assignmentId: row.id,
      subscriptionId: row.subscriptionId,
      planId: row.planId,
      requestId,
      source: row.source,
      kind: row.kind,
      employeeId: row.employeeId,
      owningDepartmentId: row.owningDepartmentId,
      heldFrom: heldRange.from,
      heldUntil: heldRange.until,
    }));
  }

  private async loadHeldSeats(
    planIds: readonly string[],
    start: BusinessDate,
    nextStart: BusinessDate,
    tx?: DbTx,
    subscriptionId?: string,
  ) {
    if (planIds.length === 0) return [];
    const db = tx ?? this.prisma;
    const rows = await db.licenseAssignment.findMany({
      where: { ...this.touching(start, nextStart, subscriptionId), planId: { in: [...planIds] } },
      select: {
        id: true,
        subscriptionId: true,
        planId: true,
        employeeId: true,
        kind: true,
        source: true,
        owningDepartmentId: true,
        validFrom: true,
        grantedOn: true,
        validUntil: true,
      },
      orderBy: [{ subscriptionId: 'asc' }, { id: 'asc' }],
    });
    // The request is the one of the last grant completed along the chain of the seat (a renewal, a handover), as a revocation finds it (`SM1-01`).
    const requestOf = await this.chains.grantsOfChains(
      db,
      rows.map((row) => row.id),
    );

    return rows.flatMap((row) => {
      const held = seatHeldRange({
        validFrom: fromDateColumn(row.validFrom),
        grantedOn: row.grantedOn ? fromDateColumn(row.grantedOn) : null,
        validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
        // A seat a Request asked for begins with its grant, never with the day it was decided (`SM1-02`).
        needsGrant: row.source === 'REQUEST',
      });
      if (!held || row.subscriptionId === null) return [];
      if (held.from >= nextStart || (held.until !== null && held.until <= start)) return [];

      return [
        {
          row: { ...row, subscriptionId: row.subscriptionId },
          heldRange: held,
          requestId: requestOf.get(row.id) ?? null,
        },
      ];
    });
  }

  /** The seats on a subscription whose period reaches into the month, grants that failed or were cancelled left out (the days are checked after). */
  private touching(start: BusinessDate, nextStart: BusinessDate, subscriptionId?: string) {
    return {
      subscriptionId: subscriptionId ?? { not: null },
      failedAt: null,
      cancelledAt: null,
      validFrom: { lt: toDateColumn(nextStart) },
      OR: [{ validUntil: null }, { validUntil: { gt: toDateColumn(start) } }],
    };
  }
}
