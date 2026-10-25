import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

export type MoveStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export type MoveConfirmedRole = 'DEPARTMENT_HEAD' | 'FALLBACK_APPROVER';

/** A proposal to move a service account to another department, as it is kept. */
export interface MoveRecord {
  id: string;
  organizationId: string;
  assignmentId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  newResponsibleEmployeeId: string;
  effectiveFrom: BusinessDate;
  expectedEndDate: BusinessDate | null;
  status: MoveStatus;
  proposedByAppUserId: string;
  proposedAt: Date;
  confirmedByEmployeeId: string | null;
  confirmedByRole: MoveConfirmedRole | null;
  confirmedAt: Date | null;
  cancelledByAppUserId: string | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  resultingAssignmentId: string | null;
}

export interface NewMove {
  organizationId: string;
  assignmentId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  newResponsibleEmployeeId: string;
  effectiveFrom: BusinessDate;
  expectedEndDate: BusinessDate | null;
  proposedByAppUserId: string;
}

export interface MoveListFilter {
  status?: MoveStatus;
  /** Only the proposals into these receiving units; null reads them all. */
  toDepartmentIds: readonly string[] | null;
  skip: number;
  take: number;
}

type Row = Prisma.ServiceAccountMoveGetPayload<object>;

const toRecord = (row: Row): MoveRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  assignmentId: row.assignmentId,
  fromDepartmentId: row.fromDepartmentId,
  toDepartmentId: row.toDepartmentId,
  newResponsibleEmployeeId: row.newResponsibleEmployeeId,
  effectiveFrom: fromDateColumn(row.effectiveFrom),
  expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
  status: row.status,
  proposedByAppUserId: row.proposedByAppUserId,
  proposedAt: row.proposedAt,
  confirmedByEmployeeId: row.confirmedByEmployeeId,
  confirmedByRole: row.confirmedByRole,
  confirmedAt: row.confirmedAt,
  cancelledByAppUserId: row.cancelledByAppUserId,
  cancelledAt: row.cancelledAt,
  cancelledReason: row.cancelledReason,
  resultingAssignmentId: row.resultingAssignmentId,
});

/**
 * The one writer of `service_account_moves`. A proposal is written once, decided once (the database refuses every other change) and
 * never deleted; the one that waits for an assignment is unique in the database.
 */
@Injectable()
export class ServiceAccountMoveRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewMove): Promise<MoveRecord> {
    const row = await tx.serviceAccountMove.create({
      data: {
        organizationId: input.organizationId,
        assignmentId: input.assignmentId,
        fromDepartmentId: input.fromDepartmentId,
        toDepartmentId: input.toDepartmentId,
        newResponsibleEmployeeId: input.newResponsibleEmployeeId,
        effectiveFrom: toDateColumn(input.effectiveFrom),
        expectedEndDate: input.expectedEndDate ? toDateColumn(input.expectedEndDate) : null,
        proposedByAppUserId: input.proposedByAppUserId,
      },
    });

    return toRecord(row);
  }

  async find(id: string, tx?: DbTx): Promise<MoveRecord | null> {
    const row = await (tx ?? this.prisma).serviceAccountMove.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The proposal, locked `FOR UPDATE` for the rest of the transaction, or null. */
  async lock(tx: DbTx, id: string): Promise<MoveRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM service_account_moves WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.find(id, tx);
  }

  async markConfirmed(
    tx: DbTx,
    id: string,
    input: { employeeId: string; role: MoveConfirmedRole; resultingAssignmentId: string; now: Date },
  ): Promise<MoveRecord> {
    const row = await tx.serviceAccountMove.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        confirmedByEmployeeId: input.employeeId,
        confirmedByRole: input.role,
        confirmedAt: input.now,
        resultingAssignmentId: input.resultingAssignmentId,
      },
    });

    return toRecord(row);
  }

  async markCancelled(
    tx: DbTx,
    id: string,
    input: { appUserId: string; reason: string; now: Date },
  ): Promise<MoveRecord> {
    const row = await tx.serviceAccountMove.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledByAppUserId: input.appUserId,
        cancelledAt: input.now,
        cancelledReason: input.reason,
      },
    });

    return toRecord(row);
  }

  /** The receiving units that have a proposal waiting, each once. */
  async departmentsWithPending(): Promise<string[]> {
    const groups = await this.prisma.serviceAccountMove.groupBy({
      by: ['toDepartmentId'],
      where: { status: 'PENDING' },
      orderBy: { toDepartmentId: 'asc' },
    });

    return groups.map((group) => group.toDepartmentId);
  }

  /** One page by the day the move takes effect then id, and the total for the same filter, from one snapshot. */
  async page(filter: MoveListFilter): Promise<{ items: MoveRecord[]; total: number }> {
    const where: Prisma.ServiceAccountMoveWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.toDepartmentIds ? { toDepartmentId: { in: [...filter.toDepartmentIds] } } : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.serviceAccountMove.findMany({
          where,
          orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toRecord), total: await tx.serviceAccountMove.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
