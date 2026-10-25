import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OPEN_GRANT_TASK_STATUSES } from '../licensing-open-grants.types';

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
    const [rows, total] = await Promise.all([
      db.provisioningTask.findMany({
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
      }),
      db.provisioningTask.count({ where }),
    ]);

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
}
