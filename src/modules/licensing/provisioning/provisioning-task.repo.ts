import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  ProvisioningChannel,
  ProvisioningFailureKind,
  ProvisioningTaskKind,
  ProvisioningTaskStatus,
} from '../licensing.types';

/** A task as it is kept, with the few facts of its assignment a card needs. */
export interface ProvisioningTaskRecord {
  id: string;
  kind: ProvisioningTaskKind;
  channel: ProvisioningChannel;
  status: ProvisioningTaskStatus;
  requestId: string;
  assignmentId: string;
  defaultResponsibleEmployeeId: string | null;
  claimedByAppUserId: string | null;
  claimedAt: Date | null;
  completedByAppUserId: string | null;
  completedAt: Date | null;
  evidence: string | null;
  failedByAppUserId: string | null;
  failedAt: Date | null;
  failureReason: string | null;
  failureKind: ProvisioningFailureKind | null;
  attempts: number;
  /** The most tries the task gets, fixed when it was made (US-01-04 AC-13). */
  maxAttempts: number;
  lastError: string | null;
  nextRetryAt: Date | null;
  closedByAppUserId: string | null;
  closedAt: Date | null;
  closeReason: string | null;
  handedOffByAppUserId: string | null;
  handedOffAt: Date | null;
  handOffEvidence: string | null;
  createdAt: Date;
  assignment: { employeeId: string; planId: string; subscriptionId: string | null; accountIdentifier: string };
}

const WITH_ASSIGNMENT = {
  assignment: { select: { employeeId: true, planId: true, subscriptionId: true, accountIdentifier: true } },
} as const;
type Row = Prisma.ProvisioningTaskGetPayload<{ include: typeof WITH_ASSIGNMENT }>;

const toRecord = (row: Row): ProvisioningTaskRecord => ({
  id: row.id,
  kind: row.kind,
  channel: row.channel,
  status: row.status,
  requestId: row.requestId,
  assignmentId: row.assignmentId,
  defaultResponsibleEmployeeId: row.defaultResponsibleEmployeeId,
  claimedByAppUserId: row.claimedByAppUserId,
  claimedAt: row.claimedAt,
  completedByAppUserId: row.completedByAppUserId,
  completedAt: row.completedAt,
  evidence: row.evidence,
  failedByAppUserId: row.failedByAppUserId,
  failedAt: row.failedAt,
  failureReason: row.failureReason,
  failureKind: row.failureKind,
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  lastError: row.lastError,
  nextRetryAt: row.nextRetryAt,
  closedByAppUserId: row.closedByAppUserId,
  closedAt: row.closedAt,
  closeReason: row.closeReason,
  handedOffByAppUserId: row.handedOffByAppUserId,
  handedOffAt: row.handedOffAt,
  handOffEvidence: row.handOffEvidence,
  createdAt: row.createdAt,
  assignment: row.assignment,
});

export interface TaskPageFilter {
  channel?: ProvisioningChannel;
  status?: ProvisioningTaskStatus;
  /** Only the tasks this employee is in charge of by default. */
  responsibleEmployeeId?: string;
  /** Only the tasks nobody is in charge of, or whose person in charge is one of these (who no longer work). */
  generalQueueOf?: readonly string[];
  skip: number;
  take: number;
}

/** Everything a failed task carries, cleared when a decision puts it back in the queue to be done. */
const CLEARED = {
  claimedByAppUserId: null,
  claimedAt: null,
  failedByAppUserId: null,
  failedAt: null,
  failureReason: null,
  failureKind: null,
  lastError: null,
  nextRetryAt: null,
  attempts: 0,
} as const;

/**
 * The one writer of `provisioning_tasks`. A task is made once with its assignment and then only moves forward: taken,
 * then completed or failed; a completed task is final and the database refuses any change to it.
 */
@Injectable()
export class ProvisioningTaskRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      assignmentId: string;
      channel: ProvisioningChannel;
      requestId: string;
      defaultResponsibleEmployeeId: string | null;
      createdByAppUserId: string;
      /** The tries the task gets, from the retries the configuration allows now. */
      maxAttempts: number;
    },
  ): Promise<ProvisioningTaskRecord> {
    const row = await tx.provisioningTask.create({
      data: { ...input, kind: 'GRANT' },
      include: WITH_ASSIGNMENT,
    });

    return toRecord(row);
  }

  async find(id: string, tx?: DbTx): Promise<ProvisioningTaskRecord | null> {
    const row = await (tx ?? this.prisma).provisioningTask.findUnique({ where: { id }, include: WITH_ASSIGNMENT });

    return row ? toRecord(row) : null;
  }

  /** The task, locked `FOR UPDATE` for the rest of the transaction, so two people working it queue; or null. */
  async lock(tx: DbTx, id: string): Promise<ProvisioningTaskRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM provisioning_tasks WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  async markClaimed(tx: DbTx, id: string, appUserId: string, now: Date): Promise<void> {
    await tx.provisioningTask.update({
      where: { id },
      data: { status: 'IN_PROGRESS', claimedByAppUserId: appUserId, claimedAt: now },
    });
  }

  async markCompleted(tx: DbTx, id: string, appUserId: string, evidence: string, now: Date): Promise<void> {
    await tx.provisioningTask.update({
      where: { id },
      data: { status: 'COMPLETED', completedByAppUserId: appUserId, completedAt: now, evidence },
    });
  }

  async markFailed(tx: DbTx, id: string, appUserId: string, reason: string, now: Date): Promise<void> {
    await tx.provisioningTask.update({
      where: { id },
      data: {
        status: 'FAILED',
        failedByAppUserId: appUserId,
        failedAt: now,
        failureReason: reason,
        failureKind: 'NOT_DONE',
      },
    });
  }

  /**
   * What the connector reports of a failed try: the task waits for its next try (a temporary failure with retries left)
   * or goes to the failure queue. The tries made and the technical detail of the last error stay on the task.
   */
  async markFailureRecorded(
    tx: DbTx,
    id: string,
    input:
      | { next: 'RETRY_SCHEDULED'; attempts: number; lastError: string; nextRetryAt: Date }
      | {
          next: 'FAILED';
          kind: ProvisioningFailureKind;
          attempts: number;
          lastError: string;
          reason: string;
          now: Date;
        },
  ): Promise<void> {
    await tx.provisioningTask.update({
      where: { id },
      data:
        input.next === 'RETRY_SCHEDULED'
          ? {
              status: 'RETRY_SCHEDULED',
              failureKind: 'TRANSIENT',
              attempts: input.attempts,
              lastError: input.lastError,
              nextRetryAt: input.nextRetryAt,
              claimedByAppUserId: null,
              claimedAt: null,
            }
          : {
              status: 'FAILED',
              failureKind: input.kind,
              attempts: input.attempts,
              lastError: input.lastError,
              failedAt: input.now,
              failureReason: input.reason,
              nextRetryAt: null,
            },
    });
  }

  /** The decision to try again: the task is queued again on its channel with no trace of the failure but the audit. */
  async markRetried(tx: DbTx, id: string): Promise<void> {
    await tx.provisioningTask.update({ where: { id }, data: { status: 'QUEUED', ...CLEARED } });
  }

  /** The decision to hand a connector task to a person: it is queued again, by hand, with who handed it and the evidence. */
  async markHandedOff(tx: DbTx, id: string, appUserId: string, evidence: string, now: Date): Promise<void> {
    await tx.provisioningTask.update({
      where: { id },
      data: {
        status: 'QUEUED',
        channel: 'MANUAL',
        ...CLEARED,
        handedOffByAppUserId: appUserId,
        handedOffAt: now,
        handOffEvidence: evidence,
      },
    });
  }

  /** The decision to close a failed task: the end of it. The failure it closes stays on the task. */
  async markClosedFailed(tx: DbTx, id: string, appUserId: string, reason: string, now: Date): Promise<void> {
    await tx.provisioningTask.update({
      where: { id },
      data: { status: 'CLOSED_FAILED', closedByAppUserId: appUserId, closedAt: now, closeReason: reason },
    });
  }

  /** The people who are in charge by default of some task: a few IT Admins, to learn which of them still work. */
  async responsibleEmployeeIds(): Promise<string[]> {
    const groups = await this.prisma.provisioningTask.groupBy({
      by: ['defaultResponsibleEmployeeId'],
      where: { defaultResponsibleEmployeeId: { not: null } },
    });

    return groups.flatMap((group) => (group.defaultResponsibleEmployeeId ? [group.defaultResponsibleEmployeeId] : []));
  }

  /** One page of the queue, the oldest first, and the total for the same filter, from one snapshot. */
  async page(filter: TaskPageFilter): Promise<{ items: ProvisioningTaskRecord[]; total: number }> {
    const where: Prisma.ProvisioningTaskWhereInput = {
      ...(filter.channel ? { channel: filter.channel } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.responsibleEmployeeId ? { defaultResponsibleEmployeeId: filter.responsibleEmployeeId } : {}),
      ...(filter.generalQueueOf
        ? {
            OR: [
              { defaultResponsibleEmployeeId: null },
              { defaultResponsibleEmployeeId: { in: [...filter.generalQueueOf] } },
            ],
          }
        : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.provisioningTask.findMany({
          where,
          include: WITH_ASSIGNMENT,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toRecord), total: await tx.provisioningTask.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
