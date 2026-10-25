import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type BusinessDate, fromDateColumn, toDateColumn } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { Grounds } from '../grounds/grounds.policy';
import type { LeaveInterval } from '../personnel.types';
import type {
  LeaveChangeKind,
  LeaveChangeRecord,
  LeaveEndKind,
  LeaveListFilter,
  LeaveRecord,
  LeaveSummaryRecord,
} from './leave.types';

type LeaveRow = Prisma.EmployeeLeaveGetPayload<Record<string, never>>;
type ChangeRow = Prisma.EmployeeLeaveChangeGetPayload<Record<string, never>>;

const SUMMARY = {
  id: true,
  employeeId: true,
  status: true,
  startedOn: true,
  approvedReturnOn: true,
  endedOn: true,
} as const;

const dateOrNull = (value: Date | null): BusinessDate | null => (value ? fromDateColumn(value) : null);

function toRecord(row: LeaveRow): LeaveRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    startedOn: fromDateColumn(row.startedOn),
    approvedReturnOn: fromDateColumn(row.approvedReturnOn),
    status: row.status,
    endedOn: dateOrNull(row.endedOn),
    endKind: row.endKind,
    resumesLeaveId: row.resumesLeaveId,
    grounds: {
      type: row.groundsType,
      reference: row.groundsReference,
      issuer: row.groundsIssuer,
      issuedOn: fromDateColumn(row.groundsIssuedOn),
    },
    startedByAppUserId: row.startedByAppUserId,
    startedAt: row.startedAt,
    selfExecuted: row.selfExecuted,
    returnOverdueNoticedFor: dateOrNull(row.returnOverdueNoticedFor),
  };
}

const groundsColumns = (grounds: Grounds) => ({
  groundsType: grounds.type,
  groundsReference: grounds.reference,
  groundsIssuer: grounds.issuer,
  groundsIssuedOn: toDateColumn(grounds.issuedOn),
});

function toChange(row: ChangeRow): LeaveChangeRecord {
  return {
    id: row.id,
    kind: row.kind,
    oldReturnOn: dateOrNull(row.oldReturnOn),
    newReturnOn: dateOrNull(row.newReturnOn),
    returnedOn: dateOrNull(row.returnedOn),
    onSchedule: row.onSchedule,
    grounds:
      row.groundsType && row.groundsReference && row.groundsIssuer && row.groundsIssuedOn
        ? {
            type: row.groundsType,
            reference: row.groundsReference,
            issuer: row.groundsIssuer,
            issuedOn: fromDateColumn(row.groundsIssuedOn),
          }
        : null,
    recordedByAppUserId: row.recordedByAppUserId,
    recordedAt: row.recordedAt,
    selfExecuted: row.selfExecuted,
  };
}

/**
 * The one reader and writer of `employee_leaves` and its log. A leave moves only while it runs (a trigger): the approved day
 * with its basis, the mark of the reminder, and the one step to its end.
 */
@Injectable()
export class LeaveRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: Omit<LeaveRecord, 'id' | 'status' | 'endedOn' | 'endKind' | 'startedAt' | 'returnOverdueNoticedFor'> & {
      noticeId?: string | null;
    },
  ): Promise<LeaveRecord> {
    const created = await tx.employeeLeave.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        employeeId: input.employeeId,
        startedOn: toDateColumn(input.startedOn),
        approvedReturnOn: toDateColumn(input.approvedReturnOn),
        resumesLeaveId: input.resumesLeaveId,
        ...groundsColumns(input.grounds),
        startedByAppUserId: input.startedByAppUserId,
        selfExecuted: input.selfExecuted,
        noticeId: input.noticeId ?? null,
      },
    });

    return toRecord(created);
  }

  async find(id: string, tx?: DbTx): Promise<LeaveRecord | null> {
    const row = await (tx ?? this.prisma).employeeLeave.findUnique({ where: { id } });

    return row && toRecord(row);
  }

  /** The row held `FOR UPDATE` until the transaction ends, read after the lock; null when there is none. */
  async lock(tx: DbTx, id: string): Promise<LeaveRecord | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM employee_leaves WHERE id = ${id}::uuid FOR UPDATE`;

    return rows.length === 0 ? null : this.find(id, tx);
  }

  /** The leave of the employee that runs, held `FOR UPDATE` (at most one: a partial unique index); null when there is none. */
  async lockActiveOf(tx: DbTx, employeeId: string): Promise<LeaveRecord | null> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM employee_leaves WHERE employee_id = ${employeeId}::uuid AND status = 'ACTIVE' FOR UPDATE`;

    return rows[0] ? this.find(rows[0].id, tx) : null;
  }

  /** The leave that was ended for a handover and not carried on since, the latest one; null when there is none. */
  async findEndedForDeparture(tx: DbTx, employeeId: string): Promise<LeaveRecord | null> {
    const row = await tx.employeeLeave.findFirst({
      where: { employeeId, endKind: 'DEPARTURE_STARTED', resumedBy: { none: {} } },
      orderBy: [{ endedOn: 'desc' }, { id: 'desc' }],
    });

    return row && toRecord(row);
  }

  async changeReturnDate(tx: DbTx, id: string, approvedReturnOn: BusinessDate, grounds: Grounds): Promise<LeaveRecord> {
    const row = await tx.employeeLeave.update({
      where: { id },
      data: { approvedReturnOn: toDateColumn(approvedReturnOn), ...groundsColumns(grounds) },
    });

    return toRecord(row);
  }

  async end(tx: DbTx, id: string, endedOn: BusinessDate, endKind: LeaveEndKind): Promise<LeaveRecord> {
    const row = await tx.employeeLeave.update({
      where: { id },
      data: { status: 'ENDED', endedOn: toDateColumn(endedOn), endKind },
    });

    return toRecord(row);
  }

  async insertChange(
    tx: DbTx,
    input: {
      leaveId: string;
      kind: LeaveChangeKind;
      oldReturnOn?: BusinessDate;
      newReturnOn?: BusinessDate;
      returnedOn?: BusinessDate;
      onSchedule?: boolean;
      grounds?: Grounds;
      recordedByAppUserId: string;
      selfExecuted: boolean;
    },
  ): Promise<void> {
    await tx.employeeLeaveChange.create({
      data: {
        id: randomUUID(),
        leaveId: input.leaveId,
        kind: input.kind,
        oldReturnOn: input.oldReturnOn ? toDateColumn(input.oldReturnOn) : null,
        newReturnOn: input.newReturnOn ? toDateColumn(input.newReturnOn) : null,
        returnedOn: input.returnedOn ? toDateColumn(input.returnedOn) : null,
        onSchedule: input.onSchedule ?? null,
        ...(input.grounds ? groundsColumns(input.grounds) : {}),
        recordedByAppUserId: input.recordedByAppUserId,
        selfExecuted: input.selfExecuted,
      },
    });
  }

  /** One page of leaves, the nearest day of return first, and the total for the same filter, from one snapshot. */
  async list(filter: LeaveListFilter): Promise<{ items: LeaveSummaryRecord[]; total: number }> {
    const where: Prisma.EmployeeLeaveWhereInput = {
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(filter.overdueReturn
        ? { status: 'ACTIVE', approvedReturnOn: { lt: toDateColumn(filter.today) } }
        : filter.status
          ? { status: filter.status }
          : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.employeeLeave.findMany({
          where,
          select: SUMMARY,
          orderBy: [{ approvedReturnOn: 'asc' }, { id: 'asc' }],
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
        });

        return {
          items: rows.map((row) => ({
            ...row,
            startedOn: fromDateColumn(row.startedOn),
            approvedReturnOn: fromDateColumn(row.approvedReturnOn),
            endedOn: dateOrNull(row.endedOn),
          })),
          total: await tx.employeeLeave.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** One page of the log of a leave, oldest first, and its total, from one snapshot. */
  async listChanges(
    leaveId: string,
    page: { page: number; pageSize: number },
  ): Promise<{ items: LeaveChangeRecord[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.employeeLeaveChange.findMany({
          where: { leaveId },
          orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
          skip: (page.page - 1) * page.pageSize,
          take: page.pageSize,
        });

        return { items: rows.map(toChange), total: await tx.employeeLeaveChange.count({ where: { leaveId } }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The leaves of the people that overlap the days `from` to `to`, in one statement, whatever the number of people. */
  async intervals(employeeIds: readonly string[], from: BusinessDate, to: BusinessDate): Promise<LeaveInterval[]> {
    if (employeeIds.length === 0) return [];
    const rows = await this.prisma.employeeLeave.findMany({
      where: {
        employeeId: { in: [...employeeIds] },
        startedOn: { lte: toDateColumn(to) },
        OR: [{ endedOn: null }, { endedOn: { gt: toDateColumn(from) } }],
      },
      select: { employeeId: true, startedOn: true, endedOn: true },
      orderBy: [{ employeeId: 'asc' }, { startedOn: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      employeeId: row.employeeId,
      startedOn: fromDateColumn(row.startedOn),
      endedOn: dateOrNull(row.endedOn),
    }));
  }

  /** The leaves that run past their approved day of return and have not been told about that day, the oldest day first. */
  async listOverdueUnnoticed(today: BusinessDate, limit: number): Promise<LeaveRecord[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM employee_leaves
       WHERE status = 'ACTIVE' AND approved_return_on < ${today}::date
         AND return_overdue_noticed_for IS DISTINCT FROM approved_return_on
       ORDER BY approved_return_on, id LIMIT ${limit}`;
    if (rows.length === 0) return [];
    const found = await this.prisma.employeeLeave.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      orderBy: [{ approvedReturnOn: 'asc' }, { id: 'asc' }],
    });

    return found.map(toRecord);
  }

  /** Marks that the reminder for this approved day was written; false when it already was or the day moved meanwhile. */
  async markOverdueNoticed(tx: DbTx, id: string, approvedReturnOn: BusinessDate): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE employee_leaves SET return_overdue_noticed_for = approved_return_on
       WHERE id = ${id}::uuid AND status = 'ACTIVE' AND approved_return_on = ${approvedReturnOn}::date
         AND return_overdue_noticed_for IS DISTINCT FROM approved_return_on
       RETURNING id`;

    return rows.length > 0;
  }
}
