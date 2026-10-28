import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OPEN_GRANT_TASK_STATUSES } from '../licensing-open-grants.types';

/**
 * The open provisioning tasks that keep a department in use: a read of the tasks together with the assignment each is for, which no
 * write goes through (the writers are `AssignmentRepo` and `ProvisioningTaskRepo`). A page and its total are two statements, however
 * many tasks there are.
 */
@Injectable()
export class ProvisioningDepartmentUseRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The first `take` open tasks (queued, waiting for a retry, being worked or failed; a grant or a revocation) whose assignment belongs
   * to the department, by id, and how many there are in all. An assignment belongs to the department that is its owning department,
   * or, when it has none (a seat written before a personal seat carried it), the one that owns its subscription
   * (`subscriptionIds`, asked of the catalog).
   */
  async openOfDepartment(
    departmentId: string,
    subscriptionIds: readonly string[],
    take: number,
    tx?: DbTx,
  ): Promise<{ items: { taskId: string; planId: string }[]; total: number }> {
    const db = tx ?? this.prisma;
    const where = {
      status: { in: [...OPEN_GRANT_TASK_STATUSES] },
      assignment: {
        OR: [{ owningDepartmentId: departmentId }, { subscriptionId: { in: [...subscriptionIds] } }],
      },
    };
    const rows = await db.provisioningTask.findMany({
      where,
      select: { id: true, assignment: { select: { planId: true } } },
      orderBy: { id: 'asc' },
      take: Math.max(0, take),
    });
    const total = await db.provisioningTask.count({ where });

    return { items: rows.map((row) => ({ taskId: row.id, planId: row.assignment.planId })), total };
  }
}
