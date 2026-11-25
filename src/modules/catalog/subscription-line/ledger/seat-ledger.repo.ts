import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../../core/business-date';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { isCheckViolation, isUniqueViolation } from '../../../../infrastructure/database/unique-violation';
import {
  SeatLedgerBelowOccupancyError,
  SeatLedgerClosedError,
  SeatLedgerItemGrantedError,
} from '../subscription-line.errors';
import type {
  NewSeatChange,
  SeatChangeBasis,
  SeatChangeReason,
  SeatChangeRecord,
  SeatChangeSource,
} from './seat-ledger.types';

type Row = Prisma.SeatChangeGetPayload<object>;

const toRecord = (row: Row): SeatChangeRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  subscriptionLineId: row.subscriptionLineId,
  effectiveOn: fromDateColumn(row.effectiveOn),
  delta: row.delta,
  reason: row.reason as SeatChangeReason,
  source: row.source as SeatChangeSource,
  basis: row.basis as SeatChangeBasis,
  requestId: row.requestId,
  beneficiaryEmployeeId: row.beneficiaryEmployeeId,
  seatPurchaseId: row.seatPurchaseId,
  renewalId: row.renewalId,
  refundedSeatChangeId: row.refundedSeatChangeId,
  note: row.note,
  outOfProcess: row.outOfProcess,
  autoRecorded: row.autoRecorded,
  recordedByEmployeeId: row.recordedByEmployeeId,
  recordedAt: row.recordedAt,
});

const ORDER: Prisma.SeatChangeOrderByWithRelationInput[] = [
  { effectiveOn: 'asc' },
  { recordedAt: 'asc' },
  { id: 'asc' },
];

/** The columns of a row to add: what the caller leaves out is empty, and a row with a request is of a request item. */
function dataOf(input: NewSeatChange): Prisma.SeatChangeUncheckedCreateInput {
  return {
    organizationId: input.organizationId,
    subscriptionLineId: input.subscriptionLineId,
    effectiveOn: toDateColumn(input.effectiveOn),
    delta: input.delta,
    reason: input.reason,
    source: input.source,
    basis: input.basis ?? (input.requestId ? 'REQUEST_ITEM' : 'NONE'),
    requestId: input.requestId ?? null,
    beneficiaryEmployeeId: input.beneficiaryEmployeeId ?? null,
    seatPurchaseId: input.seatPurchaseId ?? null,
    renewalId: input.renewalId ?? null,
    refundedSeatChangeId: input.refundedSeatChangeId ?? null,
    note: input.note ?? null,
    outOfProcess: input.outOfProcess ?? false,
    autoRecorded: input.autoRecorded ?? false,
    recordedByEmployeeId: input.recordedByEmployeeId ?? null,
  };
}

/** What the database says of a row it refuses: the capacity trigger, the grant of an item, the line that takes no row. */
function asLedgerError(error: unknown): unknown {
  if (isCheckViolation(error, 'seat_changes_below_occupancy')) return new SeatLedgerBelowOccupancyError();
  if (isUniqueViolation(error, 'seat_changes_grant_item_key', 'request_id')) return new SeatLedgerItemGrantedError();
  if (isCheckViolation(error, 'seat_changes_line_has_ledger')) return new SeatLedgerClosedError('NO_LEDGER');
  if (isCheckViolation(error, 'seat_changes_effective_on_in_service'))
    return new SeatLedgerClosedError('OUT_OF_SERVICE');

  return error;
}

/**
 * The one writer of `seat_changes`, the ledger of the seats of a line: rows are added and never changed (a trigger). Every write runs
 * under the lock of its line (the row check of the database takes it, tier 6a, after the period and before the row), READ COMMITTED.
 * The seats of a day are the sum of the deltas that took effect up to it (W3-15).
 */
@Injectable()
export class SeatLedgerRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adds a row. Throws SeatLedgerBelowOccupancyError when the seats would fall below the seats taken or below zero on a day,
   * SeatLedgerItemGrantedError when the item already took a seat, SeatLedgerClosedError when the line takes no row on that day.
   */
  async insert(tx: DbTx, input: NewSeatChange): Promise<SeatChangeRecord> {
    try {
      const row = await tx.seatChange.create({ data: dataOf(input) });

      return toRecord(row);
    } catch (error) {
      throw asLedgerError(error);
    }
  }

  async find(id: string, tx?: DbTx): Promise<SeatChangeRecord | null> {
    const row = await (tx ?? this.prisma).seatChange.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** Every row of a line in the order they take effect. */
  async ofLine(lineId: string, tx?: DbTx): Promise<SeatChangeRecord[]> {
    const rows = await (tx ?? this.prisma).seatChange.findMany({
      where: { subscriptionLineId: lineId },
      orderBy: ORDER,
    });

    return rows.map(toRecord);
  }

  /** The seats a line serves on `day`: the sum of the rows that took effect up to it (zero before the first). */
  async seatsOn(lineId: string, day: BusinessDate, tx?: DbTx): Promise<number> {
    const sum = await (tx ?? this.prisma).seatChange.aggregate({
      where: { subscriptionLineId: lineId, effectiveOn: { lte: toDateColumn(day) } },
      _sum: { delta: true },
    });

    return sum._sum.delta ?? 0;
  }

  /** The top-up an item of a request already took, if it did (one per item). */
  async findItemGrant(requestId: string, beneficiaryEmployeeId: string, tx?: DbTx): Promise<SeatChangeRecord | null> {
    const row = await (tx ?? this.prisma).seatChange.findFirst({
      where: { requestId, beneficiaryEmployeeId, reason: 'TOP_UP', source: 'GRANT' },
    });

    return row ? toRecord(row) : null;
  }

  /** The rows of these requests, oldest first (what the request detail shows of the seats bought for it). */
  async ofRequests(requestIds: readonly string[], tx?: DbTx): Promise<SeatChangeRecord[]> {
    if (requestIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).seatChange.findMany({
      where: { requestId: { in: [...requestIds] } },
      orderBy: ORDER,
    });

    return rows.map(toRecord);
  }

  /** All rows of these lines taking effect on or before `until`, ordered chronologically. */
  async ofLinesUpTo(lineIds: readonly string[], until: BusinessDate, tx?: DbTx): Promise<SeatChangeRecord[]> {
    if (lineIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).seatChange.findMany({
      where: { subscriptionLineId: { in: [...lineIds] }, effectiveOn: { lte: toDateColumn(until) } },
      orderBy: ORDER,
    });

    return rows.map(toRecord);
  }

  /** Seat totals on `day` for each of `lineIds` that has ledger entries up to `day`. */
  async listPagedByLine(
    lineId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    total: number;
    items: Array<{
      id: string;
      effectiveOn: BusinessDate;
      delta: number;
      reason: string;
      source: string;
      basis: string;
      requestId: string | null;
      beneficiaryEmployeeId: string | null;
      seatPurchase: { id: string; code: string } | null;
      note: string | null;
      outOfProcess: boolean;
      autoRecorded: boolean;
      recordedByEmployeeId: string | null;
      recordedAt: Date;
    }>;
  } | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const line = await tx.subscriptionLine.findUnique({ where: { id: lineId }, select: { id: true } });
        if (!line) return null;
        const total = await tx.seatChange.count({ where: { subscriptionLineId: lineId } });
        const rows = await tx.seatChange.findMany({
          where: { subscriptionLineId: lineId },
          include: { seatPurchase: { select: { id: true, code: true } } },
          orderBy: [{ effectiveOn: 'desc' }, { recordedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        });

        return {
          total,
          items: rows.map((row) => ({
            id: row.id,
            effectiveOn: fromDateColumn(row.effectiveOn),
            delta: row.delta,
            reason: row.reason,
            source: row.source,
            basis: row.basis,
            requestId: row.requestId,
            beneficiaryEmployeeId: row.beneficiaryEmployeeId,
            seatPurchase: row.seatPurchase ? { id: row.seatPurchase.id, code: row.seatPurchase.code } : null,
            note: row.note,
            outOfProcess: row.outOfProcess,
            autoRecorded: row.autoRecorded,
            recordedByEmployeeId: row.recordedByEmployeeId,
            recordedAt: row.recordedAt,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async seatsOnOfLines(lineIds: readonly string[], day: BusinessDate, tx?: DbTx): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (lineIds.length === 0) return result;
    const rows = await (tx ?? this.prisma).seatChange.groupBy({
      by: ['subscriptionLineId'],
      where: { subscriptionLineId: { in: [...lineIds] }, effectiveOn: { lte: toDateColumn(day) } },
      _sum: { delta: true },
    });
    for (const row of rows) {
      result.set(row.subscriptionLineId, row._sum.delta ?? 0);
    }

    return result;
  }

  /** Keys `${requestId}:${beneficiaryEmployeeId}` that already hold a `TOP_UP` `GRANT` ledger entry. */
  async existingTopUpItems(
    items: readonly { requestId: string; beneficiaryEmployeeId: string }[],
    tx?: DbTx,
  ): Promise<Set<string>> {
    if (items.length === 0) return new Set();
    const requestIds = [...new Set(items.map((item) => item.requestId))];
    const employeeIds = [...new Set(items.map((item) => item.beneficiaryEmployeeId))];
    const rows = await (tx ?? this.prisma).seatChange.findMany({
      where: {
        reason: 'TOP_UP',
        source: 'GRANT',
        requestId: { in: requestIds },
        beneficiaryEmployeeId: { in: employeeIds },
      },
      select: { requestId: true, beneficiaryEmployeeId: true },
    });

    return new Set(
      rows
        .filter((row) => row.requestId !== null && row.beneficiaryEmployeeId !== null)
        .map((row) => `${row.requestId}:${row.beneficiaryEmployeeId}`),
    );
  }

  /** Seat purchase ids linked to `TOP_UP` `GRANT` changes for `requestId`. */
  async topUpPurchaseIdsOfRequest(requestId: string, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).seatChange.findMany({
      where: {
        requestId,
        reason: 'TOP_UP',
        seatPurchaseId: { not: null },
      },
      select: { seatPurchaseId: true },
      distinct: ['seatPurchaseId'],
    });

    return rows.flatMap((row) => (row.seatPurchaseId ? [row.seatPurchaseId] : []));
  }

  /** Total seats already reduced (`>= 0`) pointing at `refundedSeatChangeId`. */
  async sumRefundedFor(refundedSeatChangeId: string, tx?: DbTx): Promise<number> {
    const sum = await (tx ?? this.prisma).seatChange.aggregate({
      where: { refundedSeatChangeId },
      _sum: { delta: true },
    });

    return Math.abs(sum._sum.delta ?? 0);
  }

  /** Future `MEMBER` ledger entries (`effectiveOn > afterDay`) for `lineId`, ordered chronologically. */
  async futureMemberChanges(lineId: string, afterDay: BusinessDate, tx?: DbTx): Promise<SeatChangeRecord[]> {
    const rows = await (tx ?? this.prisma).seatChange.findMany({
      where: {
        subscriptionLineId: lineId,
        source: 'MEMBER',
        effectiveOn: { gt: toDateColumn(afterDay) },
      },
      orderBy: ORDER,
    });

    return rows.map(toRecord);
  }
}
