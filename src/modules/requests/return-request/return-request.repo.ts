import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ReturnSource } from './return-request.policy';

export type ReturnRequestState = 'AWAITING_REVOCATION' | 'COMPLETED' | 'FAILED';

/** A return as it is kept (`BM-03`): one seat, who sent it and why, what the plan asked of the handover, and how it ended. */
export interface ReturnRequestRecord {
  id: string;
  organizationId: string;
  assignmentId: string;
  planId: string;
  revocationTaskId: string;
  requestedByEmployeeId: string;
  holderEmployeeId: string;
  departmentId: string;
  source: ReturnSource;
  reason: string;
  requestedOn: BusinessDate;
  revocationNote: string | null;
  handoverRequired: boolean;
  handoverDueOn: BusinessDate | null;
  handoverConfirmedAt: Date | null;
  handoverConfirmedByEmployeeId: string | null;
  handoverFlagged: boolean;
  originRequestId: string | null;
  state: ReturnRequestState;
  completedAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

/** What a row of a list needs of a return: who, which seat, the state and the handover, none of the long texts. */
export type ReturnRequestSummaryRecord = Pick<
  ReturnRequestRecord,
  | 'id'
  | 'assignmentId'
  | 'planId'
  | 'requestedByEmployeeId'
  | 'holderEmployeeId'
  | 'departmentId'
  | 'source'
  | 'requestedOn'
  | 'handoverRequired'
  | 'handoverDueOn'
  | 'handoverConfirmedAt'
  | 'handoverFlagged'
  | 'state'
  | 'completedAt'
  | 'failedAt'
  | 'createdAt'
>;

export interface NewReturnRequest {
  id: string;
  organizationId: string;
  assignmentId: string;
  planId: string;
  revocationTaskId: string;
  requestedByEmployeeId: string;
  holderEmployeeId: string;
  departmentId: string;
  source: ReturnSource;
  reason: string;
  requestedOn: BusinessDate;
  revocationNote: string | null;
  handoverRequired: boolean;
  handoverDueOn: BusinessDate | null;
  originRequestId: string | null;
  createdByAppUserId: string;
}

/** Whose returns a list shows: everybody's for the IT Admin, else those of the holder or sender, and of the department headed. */
export interface ReturnListFilter {
  scope: { all: true } | { employeeId: string; headedDepartmentId: string | null };
  state?: ReturnRequestState;
  assignmentId?: string;
  skip: number;
  take: number;
}

const SUMMARY_SELECT = {
  id: true,
  assignmentId: true,
  planId: true,
  requestedByEmployeeId: true,
  holderEmployeeId: true,
  departmentId: true,
  source: true,
  requestedOn: true,
  handoverRequired: true,
  handoverDueOn: true,
  handoverConfirmedAt: true,
  handoverFlagged: true,
  state: true,
  completedAt: true,
  failedAt: true,
  createdAt: true,
} satisfies Prisma.ReturnRequestSelect;

const toSummary = (
  row: Prisma.ReturnRequestGetPayload<{ select: typeof SUMMARY_SELECT }>,
): ReturnRequestSummaryRecord => ({
  ...row,
  requestedOn: fromDateColumn(row.requestedOn),
  handoverDueOn: row.handoverDueOn ? fromDateColumn(row.handoverDueOn) : null,
});

const toRecord = (row: Prisma.ReturnRequestGetPayload<object>): ReturnRequestRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  assignmentId: row.assignmentId,
  planId: row.planId,
  revocationTaskId: row.revocationTaskId,
  requestedByEmployeeId: row.requestedByEmployeeId,
  holderEmployeeId: row.holderEmployeeId,
  departmentId: row.departmentId,
  source: row.source,
  reason: row.reason,
  requestedOn: fromDateColumn(row.requestedOn),
  revocationNote: row.revocationNote,
  handoverRequired: row.handoverRequired,
  handoverDueOn: row.handoverDueOn ? fromDateColumn(row.handoverDueOn) : null,
  handoverConfirmedAt: row.handoverConfirmedAt,
  handoverConfirmedByEmployeeId: row.handoverConfirmedByEmployeeId,
  handoverFlagged: row.handoverFlagged,
  originRequestId: row.originRequestId,
  state: row.state,
  completedAt: row.completedAt,
  failedAt: row.failedAt,
  failureReason: row.failureReason,
  createdAt: row.createdAt,
});

/**
 * The one writer of `return_requests`. The database keeps the rest: at most one return waits for the revocation of a seat, what a
 * return says when it is sent never changes, a confirmation of the handover is written once, and a return that has ended never
 * changes again.
 */
@Injectable()
export class ReturnRequestRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewReturnRequest): Promise<ReturnRequestRecord> {
    const row = await tx.returnRequest.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        assignmentId: input.assignmentId,
        planId: input.planId,
        revocationTaskId: input.revocationTaskId,
        requestedByEmployeeId: input.requestedByEmployeeId,
        holderEmployeeId: input.holderEmployeeId,
        departmentId: input.departmentId,
        source: input.source,
        reason: input.reason,
        requestedOn: toDateColumn(input.requestedOn),
        revocationNote: input.revocationNote,
        handoverRequired: input.handoverRequired,
        handoverDueOn: input.handoverDueOn ? toDateColumn(input.handoverDueOn) : null,
        originRequestId: input.originRequestId,
        createdByAppUserId: input.createdByAppUserId,
      },
    });

    return toRecord(row);
  }

  async findById(id: string, tx?: DbTx): Promise<ReturnRequestRecord | null> {
    const row = await (tx ?? this.prisma).returnRequest.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The return, locked `FOR UPDATE` until the transaction ends, or null. */
  async lockById(tx: DbTx, id: string): Promise<ReturnRequestRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM return_requests WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.findById(id, tx);
  }

  /** The return of this seat that waits for its revocation, if there is one. */
  async findAwaitingOf(assignmentId: string, tx: DbTx): Promise<ReturnRequestRecord | null> {
    const row = await tx.returnRequest.findFirst({ where: { assignmentId, state: 'AWAITING_REVOCATION' } });

    return row ? toRecord(row) : null;
  }

  /** The return that waits on this revocation task, read without a lock: the work of the task is judged by it. */
  async findAwaitingByTask(taskId: string, tx: DbTx): Promise<ReturnRequestRecord | null> {
    const row = await tx.returnRequest.findFirst({ where: { revocationTaskId: taskId, state: 'AWAITING_REVOCATION' } });

    return row ? toRecord(row) : null;
  }

  /** The return that waits on this revocation task, locked `FOR UPDATE`, or null. */
  async lockAwaitingByTask(tx: DbTx, taskId: string): Promise<ReturnRequestRecord | null> {
    const found = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM return_requests WHERE revocation_task_id = ${taskId}::uuid AND state = 'AWAITING_REVOCATION' FOR UPDATE`;

    return found.length === 0 ? null : this.findById(found[0].id, tx);
  }

  async confirmHandover(tx: DbTx, id: string, employeeId: string, at: Date): Promise<void> {
    await tx.returnRequest.update({
      where: { id },
      data: { handoverConfirmedAt: at, handoverConfirmedByEmployeeId: employeeId },
    });
  }

  async markCompleted(tx: DbTx, id: string, at: Date, flagged: boolean): Promise<void> {
    await tx.returnRequest.update({
      where: { id },
      data: { state: 'COMPLETED', completedAt: at, handoverFlagged: flagged },
    });
  }

  async markFailed(tx: DbTx, id: string, at: Date, reason: string): Promise<void> {
    await tx.returnRequest.update({ where: { id }, data: { state: 'FAILED', failedAt: at, failureReason: reason } });
  }

  /** One page, the newest first then by id, with the total for the same filter, from one snapshot (`API-LIST-DETAIL.1`). */
  async page(filter: ReturnListFilter): Promise<{ items: ReturnRequestSummaryRecord[]; total: number }> {
    const visible: Prisma.ReturnRequestWhereInput =
      'all' in filter.scope
        ? {}
        : {
            OR: [
              { holderEmployeeId: filter.scope.employeeId },
              { requestedByEmployeeId: filter.scope.employeeId },
              ...(filter.scope.headedDepartmentId ? [{ departmentId: filter.scope.headedDepartmentId }] : []),
            ],
          };
    const where: Prisma.ReturnRequestWhereInput = {
      ...visible,
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.assignmentId ? { assignmentId: filter.assignmentId } : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.returnRequest.findMany({
          where,
          select: SUMMARY_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toSummary), total: await tx.returnRequest.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
