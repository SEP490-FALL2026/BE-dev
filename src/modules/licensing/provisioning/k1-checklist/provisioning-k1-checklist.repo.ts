import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
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

  /**
   * One advisory lock per person, held to the end of the transaction: two K1 revocations of the same person that are completed at once meet
   * one after the other, so exactly one of them is the last and takes the lock of the mailbox (`QĐ-111az`, R-1). It is taken after the
   * lock of the task and of the assignment, and nothing that holds it waits for a task of another transaction.
   */
  async lockPerson(tx: DbTx, employeeId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`k1-checklist:${employeeId}`}, 0))`;
  }

  /**
   * The revocations of these people that are not over (neither completed, nor cancelled, nor closed as failed; a failed one is still to do),
   * with the plan of the seat. The caller keeps those of a K1 plan: the kind of a plan is the catalog's.
   */
  async liveRevocationsOf(
    employeeIds: readonly string[],
    tx?: DbTx,
  ): Promise<{ taskId: string; employeeId: string; planId: string }[]> {
    if (employeeIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).provisioningTask.findMany({
      where: {
        kind: 'REVOKE',
        status: { notIn: ['COMPLETED', 'CANCELLED', 'CLOSED_FAILED'] },
        assignment: { employeeId: { in: [...employeeIds] } },
      },
      select: { id: true, assignment: { select: { employeeId: true, planId: true } } },
    });

    return rows.map((row) => ({
      taskId: row.id,
      employeeId: row.assignment.employeeId,
      planId: row.assignment.planId,
    }));
  }

  /**
   * The checklists kept by the completed revocations of these people, in one read: only a K1 revocation keeps one, so a person with none is not
   * in the map. What the system reads to find the people whose last K1 revocation ticked the lock of the mailbox when it could not write it then.
   */
  async completedOf(employeeIds: readonly string[], tx?: DbTx): Promise<Map<string, StoredK1Checklist[]>> {
    if (employeeIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).provisioningTask.findMany({
      where: {
        kind: 'REVOKE',
        status: 'COMPLETED',
        k1Checklist: { not: Prisma.DbNull },
        assignment: { employeeId: { in: [...employeeIds] } },
      },
      select: { k1Checklist: true, assignment: { select: { employeeId: true } } },
    });
    const kept = new Map<string, StoredK1Checklist[]>();
    for (const row of rows) {
      const checklist = k1ChecklistJson.decode(row.k1Checklist);
      if (checklist) kept.set(row.assignment.employeeId, [...(kept.get(row.assignment.employeeId) ?? []), checklist]);
    }

    return kept;
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
