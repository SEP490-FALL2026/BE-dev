import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../../core/business-date';
import { OPEN_GRANT_TASK_STATUSES, type GrantedSeatOfRequest } from '../../public/licensing-open-grants.types';

export interface OpenGrantTaskRow {
  taskId: string;
  status: (typeof OPEN_GRANT_TASK_STATUSES)[number];
  requestId: string | null;
  assignmentId: string;
  planId: string;
  createdAt: Date;
}

/**
 * The grants of a person that are not finished: a read of the tasks together with the assignment each is for, which no write goes
 * through (the writers are `AssignmentRepo` and `ProvisioningTaskRepo`). A page and its total are two statements, however many tasks.
 */
@Injectable()
export class OpenGrantTaskRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The open grant tasks of the person, oldest first, and how many there are in all. */
  async pageOf(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: OpenGrantTaskRow[]; total: number }> {
    const db = tx ?? this.prisma;
    const where = {
      kind: 'GRANT' as const,
      status: { in: [...OPEN_GRANT_TASK_STATUSES] },
      assignment: { employeeId },
    };
    const rows = await db.provisioningTask.findMany({
      where,
      select: {
        id: true,
        status: true,
        requestId: true,
        assignmentId: true,
        createdAt: true,
        assignment: { select: { planId: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: page.skip,
      take: page.take,
    });
    const total = await db.provisioningTask.count({ where });

    return {
      items: rows.map((row) => ({
        taskId: row.id,
        status: row.status as OpenGrantTaskRow['status'],
        requestId: row.requestId,
        assignmentId: row.assignmentId,
        planId: row.assignment.planId,
        createdAt: row.createdAt,
      })),
      total,
    };
  }

  /**
   * The seats the grants of these requests made that are still held on `onDate`: not failed, not cancelled, not closed by the day (a period
   * that closes after it, or none) and not expected to end before it. A request for a group has one for each person granted. Read with the
   * request rows locked by the caller; nothing here changes a seat. One statement.
   */
  async heldSeatsOfRequests(
    requestIds: readonly string[],
    onDate: BusinessDate,
    tx?: DbTx,
  ): Promise<GrantedSeatOfRequest[]> {
    if (requestIds.length === 0) return [];
    const day = toDateColumn(onDate);
    const rows = await (tx ?? this.prisma).provisioningTask.findMany({
      where: {
        kind: 'GRANT',
        requestId: { in: [...requestIds] },
        status: { notIn: ['CANCELLED', 'CLOSED_FAILED'] },
        assignment: {
          failedAt: null,
          cancelledAt: null,
          AND: [
            { OR: [{ validUntil: null }, { validUntil: { gt: day } }] },
            { OR: [{ expectedEndDate: null }, { expectedEndDate: { gte: day } }] },
          ],
        },
      },
      select: {
        requestId: true,
        assignment: {
          select: { id: true, employeeId: true, planId: true, expectedEndDate: true, validUntil: true },
        },
      },
      orderBy: [{ requestId: 'asc' }, { assignmentId: 'asc' }],
    });

    return rows.flatMap((row) =>
      row.requestId === null
        ? []
        : [
            {
              requestId: row.requestId,
              assignmentId: row.assignment.id,
              employeeId: row.assignment.employeeId,
              planId: row.assignment.planId,
              expectedEndDate: row.assignment.expectedEndDate ? fromDateColumn(row.assignment.expectedEndDate) : null,
              validUntil: row.assignment.validUntil ? fromDateColumn(row.assignment.validUntil) : null,
            },
          ],
    );
  }
}
