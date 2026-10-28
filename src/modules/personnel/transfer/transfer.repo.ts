import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BusinessDate, fromDateColumn, toDateColumn } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { Grounds } from '../grounds/grounds.policy';
import type {
  HeadHandoverFacts,
  TransferChangeRecord,
  TransferListFilter,
  TransferRecord,
  TransferSummaryRecord,
} from './transfer.types';

type TransferRow = Prisma.DepartmentTransferGetPayload<Record<string, never>>;

const SUMMARY = {
  id: true,
  employeeId: true,
  fromDepartmentId: true,
  toDepartmentId: true,
  effectiveOn: true,
  status: true,
} as const;

function toRecord(row: TransferRow): TransferRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    fromDepartmentId: row.fromDepartmentId,
    toDepartmentId: row.toDepartmentId,
    effectiveOn: fromDateColumn(row.effectiveOn),
    status: row.status,
    closesPlacementId: row.closesPlacementId,
    opensPlacementId: row.opensPlacementId,
    headHandover: (row.headHandover as HeadHandoverFacts | null) ?? null,
    grounds: {
      type: row.groundsType,
      reference: row.groundsReference,
      issuer: row.groundsIssuer,
      issuedOn: fromDateColumn(row.groundsIssuedOn),
    },
    recordedByAppUserId: row.recordedByAppUserId,
    recordedByTicketId: row.recordedByTicketId,
    recordedAt: row.recordedAt,
    effectiveAt: row.effectiveAt,
    cancelledAt: row.cancelledAt,
    cancelledByAppUserId: row.cancelledByAppUserId,
    cancelledByTicketId: row.cancelledByTicketId,
    cancelledReason: row.cancelledReason,
    closedAt: row.closedAt,
    closedByAppUserId: row.closedByAppUserId,
  };
}

const groundsColumns = (grounds: Grounds) => ({
  groundsType: grounds.type,
  groundsReference: grounds.reference,
  groundsIssuer: grounds.issuer,
  groundsIssuedOn: toDateColumn(grounds.issuedOn),
});

/**
 * The one reader and writer of `department_transfers` and its log of changes. A transfer only moves while it waits (a trigger):
 * its day, the placements and head periods it wrote, and then the one step to taking effect or being cancelled.
 */
@Injectable()
export class TransferRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: Omit<
      TransferRecord,
      | 'id'
      | 'status'
      | 'recordedAt'
      | 'effectiveAt'
      | 'cancelledAt'
      | 'cancelledByAppUserId'
      | 'cancelledByTicketId'
      | 'cancelledReason'
      | 'closedAt'
      | 'closedByAppUserId'
    > & { noticeId?: string | null },
  ): Promise<TransferRecord> {
    const created = await tx.departmentTransfer.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        employeeId: input.employeeId,
        fromDepartmentId: input.fromDepartmentId,
        toDepartmentId: input.toDepartmentId,
        // The titles are not named: the database gives the row the catalogue entry the person has (spec L.10).
        effectiveOn: toDateColumn(input.effectiveOn),
        closesPlacementId: input.closesPlacementId,
        opensPlacementId: input.opensPlacementId,
        headHandover: input.headHandover ? (input.headHandover as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        ...groundsColumns(input.grounds),
        recordedByAppUserId: input.recordedByAppUserId,
        recordedByTicketId: input.recordedByTicketId,
        noticeId: input.noticeId ?? null,
      },
    });

    return toRecord(created);
  }

  async find(id: string, tx?: DbTx): Promise<TransferRecord | null> {
    const row = await (tx ?? this.prisma).departmentTransfer.findUnique({ where: { id } });

    return row && toRecord(row);
  }

  /** The row held `FOR UPDATE` until the transaction ends, read after the lock; null when there is none. */
  async lock(tx: DbTx, id: string): Promise<TransferRecord | null> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM department_transfers WHERE id = ${id}::uuid FOR UPDATE`;

    return rows.length === 0 ? null : this.find(id, tx);
  }

  /** The transfer of the employee that has not taken effect, if there is one (at most one: a partial unique index). */
  async findPendingOf(tx: DbTx, employeeId: string): Promise<TransferRecord | null> {
    const row = await tx.departmentTransfer.findFirst({ where: { employeeId, status: 'PENDING' } });

    return row && toRecord(row);
  }

  /** How many reviews of the tools the transfer opened still wait for the head (a part of the record that is not closed). */
  countOpenReviews(tx: DbTx, transferId: string): Promise<number> {
    return tx.transferReview.count({ where: { transferId, status: 'OPEN' } });
  }

  /** Whether a transfer that waits names this person to follow the head of the department it leaves. */
  async isNamedSuccessorOfPending(tx: DbTx, employeeId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM department_transfers
       WHERE status = 'PENDING' AND head_handover ->> 'successorEmployeeId' = ${employeeId} LIMIT 1`;

    return rows.length > 0;
  }

  /**
   * The transfers of the employee whose day has come and that are still waiting become effective (the hourly sweep was not
   * the first to see them). Returns what became effective.
   */
  async settleDue(tx: DbTx, employeeId: string, today: BusinessDate): Promise<TransferRecord[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE department_transfers SET status = 'EFFECTIVE', effective_at = now()
       WHERE employee_id = ${employeeId}::uuid AND status = 'PENDING' AND effective_on <= ${today}::date
       RETURNING id`;

    return this.findMany(
      tx,
      rows.map((row) => row.id),
    );
  }

  /** The waiting transfer that opened this placement takes effect now; null when none waits (already effective or moved). */
  async settleByOpenedPlacement(tx: DbTx, placementId: string): Promise<TransferRecord | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE department_transfers SET status = 'EFFECTIVE', effective_at = now()
       WHERE opens_placement_id = ${placementId}::uuid AND status = 'PENDING'
       RETURNING id`;

    return rows[0] ? this.find(rows[0].id, tx) : null;
  }

  /** The waiting transfer takes effect (today's own transfer, which no sweep needs to wait for). */
  async settle(tx: DbTx, id: string): Promise<TransferRecord | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE department_transfers SET status = 'EFFECTIVE', effective_at = now()
       WHERE id = ${id}::uuid AND status = 'PENDING' RETURNING id`;

    return rows[0] ? this.find(id, tx) : null;
  }

  private async findMany(tx: DbTx, ids: string[]): Promise<TransferRecord[]> {
    if (ids.length === 0) return [];
    const rows = await tx.departmentTransfer.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });

    return rows.map(toRecord);
  }

  /** Moves a waiting transfer to another day: the placements and the head handover it now names. */
  async reschedule(
    tx: DbTx,
    id: string,
    to: {
      effectiveOn: BusinessDate;
      closesPlacementId: string;
      opensPlacementId: string;
      headHandover: HeadHandoverFacts | null;
    },
  ): Promise<TransferRecord> {
    const row = await tx.departmentTransfer.update({
      where: { id },
      data: {
        effectiveOn: toDateColumn(to.effectiveOn),
        closesPlacementId: to.closesPlacementId,
        opensPlacementId: to.opensPlacementId,
        headHandover: to.headHandover ? (to.headHandover as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });

    return toRecord(row);
  }

  async cancel(
    tx: DbTx,
    id: string,
    by: { appUserId: string | null; ticketId: string | null; reason: string },
  ): Promise<TransferRecord> {
    const row = await tx.departmentTransfer.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByAppUserId: by.appUserId,
        cancelledByTicketId: by.ticketId,
        cancelledReason: by.reason,
      },
    });

    return toRecord(row);
  }

  /** Closes an effective transfer that is not closed yet: only the two columns of the closing change. */
  async close(tx: DbTx, id: string, appUserId: string): Promise<TransferRecord> {
    const row = await tx.departmentTransfer.update({
      where: { id },
      data: { closedAt: new Date(), closedByAppUserId: appUserId },
    });

    return toRecord(row);
  }

  async insertChange(
    tx: DbTx,
    input: {
      transferId: string;
      kind: 'RESCHEDULED' | 'CANCELLED';
      oldEffectiveOn: BusinessDate;
      newEffectiveOn: BusinessDate | null;
      reason: string;
      grounds: Grounds;
      changedByAppUserId: string | null;
      changedByTicketId: string | null;
    },
  ): Promise<void> {
    await tx.departmentTransferChange.create({
      data: {
        id: randomUUID(),
        transferId: input.transferId,
        kind: input.kind,
        oldEffectiveOn: toDateColumn(input.oldEffectiveOn),
        newEffectiveOn: input.newEffectiveOn ? toDateColumn(input.newEffectiveOn) : null,
        reason: input.reason,
        ...groundsColumns(input.grounds),
        changedByAppUserId: input.changedByAppUserId,
        changedByTicketId: input.changedByTicketId,
      },
    });
  }

  /**
   * One page of transfers, newest effective day first, and the total for the same filter, from one snapshot. With
   * `departmentIds` only the transfers that leave or enter one of those units are listed (the scope of an IT Admin).
   */
  async list(filter: TransferListFilter): Promise<{ items: TransferSummaryRecord[]; total: number }> {
    const where: Prisma.DepartmentTransferWhereInput = {
      ...(filter.departmentIds
        ? {
            OR: [
              { fromDepartmentId: { in: [...filter.departmentIds] } },
              { toDepartmentId: { in: [...filter.departmentIds] } },
            ],
          }
        : {}),
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.effectiveFrom || filter.effectiveTo
        ? {
            effectiveOn: {
              ...(filter.effectiveFrom ? { gte: toDateColumn(filter.effectiveFrom) } : {}),
              ...(filter.effectiveTo ? { lte: toDateColumn(filter.effectiveTo) } : {}),
            },
          }
        : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.departmentTransfer.findMany({
          where,
          select: SUMMARY,
          orderBy: [{ effectiveOn: 'desc' }, { id: 'asc' }],
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
        });

        return {
          items: rows.map((row) => ({ ...row, effectiveOn: fromDateColumn(row.effectiveOn) })),
          total: await tx.departmentTransfer.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** One page of the log of moves and cancellations of a transfer, oldest first, and its total, from one snapshot. */
  async listChanges(
    transferId: string,
    page: { page: number; pageSize: number },
  ): Promise<{ items: TransferChangeRecord[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.departmentTransferChange.findMany({
          where: { transferId },
          orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
          skip: (page.page - 1) * page.pageSize,
          take: page.pageSize,
        });

        return {
          items: rows.map((row) => ({
            id: row.id,
            kind: row.kind,
            oldEffectiveOn: fromDateColumn(row.oldEffectiveOn),
            newEffectiveOn: row.newEffectiveOn ? fromDateColumn(row.newEffectiveOn) : null,
            reason: row.reason,
            grounds: {
              type: row.groundsType,
              reference: row.groundsReference,
              issuer: row.groundsIssuer,
              issuedOn: fromDateColumn(row.groundsIssuedOn),
            },
            changedByAppUserId: row.changedByAppUserId,
            changedByTicketId: row.changedByTicketId,
            changedAt: row.changedAt,
          })),
          total: await tx.departmentTransferChange.count({ where: { transferId } }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
