import { Injectable } from '@nestjs/common';
import { manyPaidSoftwareColumns } from '../access-request/access-request-record.mapper';
import { fromDateColumn, toDateColumn } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { LineCancelCause, LineRecord, LineState, SystemCancelCause } from '../access-request/group-request.types';

export interface NewLine {
  requestId: string;
  employeeId: string;
  state: Extract<LineState, 'AWAITING_NEED' | 'NEED_CONFIRMED'>;
  needStepId: string;
  expectedEndDate: string | null;
  /** GH-3 of the person (`BR-MF1-01g`), with the reason the sender gave for them; absent or null when not flagged. */
  manyPaidSoftware?: { count: number; reason: string } | null;
}

/** What a move of a line writes with the new state: when and by whom it ended, why, and when a withdrawal was asked. */
export interface LineMove {
  state: LineState;
  endedAt?: Date;
  endedByEmployeeId?: string | null;
  endReason?: string | null;
  cancelCause?: LineCancelCause | SystemCancelCause;
  withdrawalRequestedAt?: Date;
}

const LINE_SELECT = {
  employeeId: true,
  state: true,
  needStepId: true,
  expectedEndDate: true,
  endedAt: true,
  endedByEmployeeId: true,
  endReason: true,
  cancelCause: true,
  withdrawalRequestedAt: true,
  beneficiary: { select: { position: true } },
} satisfies Prisma.AccessRequestLineSelect;

function toLine(
  requestId: string,
  row: Prisma.AccessRequestLineGetPayload<{ select: typeof LINE_SELECT }>,
): LineRecord {
  return {
    requestId,
    employeeId: row.employeeId,
    position: row.beneficiary.position,
    state: row.state,
    needStepId: row.needStepId,
    expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
    endedAt: row.endedAt,
    endedByEmployeeId: row.endedByEmployeeId,
    endReason: row.endReason,
    cancelCause: row.cancelCause,
    withdrawalRequestedAt: row.withdrawalRequestedAt,
  };
}

/**
 * The one writer of `access_request_lines` (`US-05-17`): the people of a request for a group, each with a state of their own. The
 * database keeps the moves a line may make; this writes them. The request is locked by the caller before any line is, and the
 * lines of a decision are locked in the order the people were named, so two decisions never wait on each other in a circle.
 */
@Injectable()
export class RequestLineRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(tx: DbTx, lines: readonly NewLine[]): Promise<void> {
    await tx.accessRequestLine.createMany({
      data: lines.map((line) => ({
        requestId: line.requestId,
        employeeId: line.employeeId,
        state: line.state,
        needStepId: line.needStepId,
        expectedEndDate: line.expectedEndDate ? toDateColumn(line.expectedEndDate) : null,
        ...manyPaidSoftwareColumns(line.manyPaidSoftware),
      })),
    });
  }

  /** Locks the lines of the request, or those of the people named, in the order the people were named; returns them as they are now. */
  async lock(tx: DbTx, requestId: string, employeeIds?: readonly string[]): Promise<LineRecord[]> {
    const locked =
      employeeIds === undefined
        ? await tx.$queryRaw<{ employee_id: string }[]>`SELECT l.employee_id
            FROM access_request_lines l JOIN access_request_beneficiaries b
              ON b.request_id = l.request_id AND b.employee_id = l.employee_id
           WHERE l.request_id = ${requestId}::uuid ORDER BY b.position FOR UPDATE OF l`
        : await tx.$queryRaw<{ employee_id: string }[]>`SELECT l.employee_id
            FROM access_request_lines l JOIN access_request_beneficiaries b
              ON b.request_id = l.request_id AND b.employee_id = l.employee_id
           WHERE l.request_id = ${requestId}::uuid AND l.employee_id = ANY(${[...employeeIds]}::uuid[])
           ORDER BY b.position FOR UPDATE OF l`;

    return this.read(
      tx,
      requestId,
      locked.map((row) => row.employee_id),
    );
  }

  /** The lines of the request in the order the people were named, optionally only those of the people named. */
  async read(db: DbTx | PrismaService, requestId: string, employeeIds?: readonly string[]): Promise<LineRecord[]> {
    const rows = await db.accessRequestLine.findMany({
      where: { requestId, ...(employeeIds === undefined ? {} : { employeeId: { in: [...employeeIds] } }) },
      orderBy: { beneficiary: { position: 'asc' } },
      select: LINE_SELECT,
    });

    return rows.map((row) => toLine(requestId, row));
  }

  /** One page of the lines of the request in the order the people were named, and how many there are; only one person's when named. */
  async page(
    requestId: string,
    employeeId: string | null,
    skip: number,
    take: number,
  ): Promise<{ items: LineRecord[]; total: number }> {
    const where = { requestId, ...(employeeId === null ? {} : { employeeId }) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.accessRequestLine.findMany({
        where,
        orderBy: { beneficiary: { position: 'asc' } },
        skip,
        take,
        select: LINE_SELECT,
      }),
      this.prisma.accessRequestLine.count({ where }),
    ]);

    return { items: rows.map((row) => toLine(requestId, row)), total };
  }

  /** Moves a line; the caller holds the lock and has judged that the move is allowed (the database judges it too). */
  async move(tx: DbTx, requestId: string, employeeId: string, move: LineMove): Promise<void> {
    await tx.accessRequestLine.update({
      where: { requestId_employeeId: { requestId, employeeId } },
      data: {
        state: move.state,
        ...(move.endedAt === undefined ? {} : { endedAt: move.endedAt }),
        ...(move.endedByEmployeeId === undefined ? {} : { endedByEmployeeId: move.endedByEmployeeId }),
        ...(move.endReason === undefined ? {} : { endReason: move.endReason }),
        ...(move.cancelCause === undefined ? {} : { cancelCause: move.cancelCause }),
        ...(move.withdrawalRequestedAt === undefined ? {} : { withdrawalRequestedAt: move.withdrawalRequestedAt }),
      },
    });
  }
}
