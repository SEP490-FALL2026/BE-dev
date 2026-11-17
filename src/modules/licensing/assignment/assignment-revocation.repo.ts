import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { ProvisioningTaskStatus } from '../public/licensing.types';

/** The task that takes a seat back, as far as a row of the list of assignments says it. */
export interface OpenRevocationTask {
  id: string;
  status: ProvisioningTaskStatus;
  notBefore: BusinessDate | null;
}

/**
 * The revocation tasks that are open for a page of assignments: a read of `provisioning_tasks` that no write goes through (the writer is
 * `ProvisioningTaskRepo`). "Open" is what the count of the seats being taken back reads (`SharedPoolCapacityRepo`): not completed, not closed as
 * failed and not cancelled, so the row and the stock agree.
 */
@Injectable()
export class AssignmentRevocationRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The open revocation task of each of these assignments, one statement whatever their number; an assignment with none is absent. */
  async openOf(assignmentIds: readonly string[]): Promise<Map<string, OpenRevocationTask>> {
    const open = new Map<string, OpenRevocationTask>();
    if (assignmentIds.length === 0) return open;
    const rows = await this.prisma.provisioningTask.findMany({
      where: {
        assignmentId: { in: [...assignmentIds] },
        kind: 'REVOKE',
        status: { notIn: ['COMPLETED', 'CLOSED_FAILED', 'CANCELLED'] },
      },
      select: { id: true, assignmentId: true, status: true, notBefore: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    for (const row of rows) {
      if (open.has(row.assignmentId)) continue;
      open.set(row.assignmentId, {
        id: row.id,
        status: row.status,
        notBefore: row.notBefore ? fromDateColumn(row.notBefore) : null,
      });
    }

    return open;
  }
}
