import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { k1ChecklistJson } from './provisioning-k1-checklist.json';
import type { StoredK1Checklist } from './provisioning-k1-checklist.policy';

/**
 * The one reader and writer of `provisioning_tasks.k1_checklist`. The rest of the task is `ProvisioningTaskRepo`'s: the card of a task is read
 * there, and this column is read here only for the K1 revocations whose card shows it.
 */
@Injectable()
export class ProvisioningK1ChecklistRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Keeps the checklist on the task. It is written before the task is marked completed, in the same transaction: a completed task is never
   * changed again.
   */
  async write(tx: DbTx, taskId: string, checklist: StoredK1Checklist): Promise<void> {
    await tx.provisioningTask.update({
      where: { id: taskId },
      data: { k1Checklist: k1ChecklistJson.encode(checklist) },
    });
  }

  /** The checklists kept by these tasks, in one read; a task that keeps none is not in the map. */
  async readOf(taskIds: readonly string[], tx?: DbTx): Promise<Map<string, StoredK1Checklist>> {
    if (taskIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).provisioningTask.findMany({
      where: { id: { in: [...taskIds] } },
      select: { id: true, k1Checklist: true },
    });
    const kept = new Map<string, StoredK1Checklist>();
    for (const row of rows) {
      const checklist = k1ChecklistJson.decode(row.k1Checklist);
      if (checklist) kept.set(row.id, checklist);
    }

    return kept;
  }
}
