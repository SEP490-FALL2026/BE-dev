import { Injectable } from '@nestjs/common';
import { toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  AccessState,
  ProvisioningChannel,
  ProvisioningFailureKind,
  ProvisioningTaskStatus,
  RevocationCompletion,
  RevocationSource,
} from '../licensing.types';
import { SUMMARY_SELECT, WITH_ASSIGNMENT, toRecord, type ProvisioningTaskRecord } from './provisioning-task.record';

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

/**
 * What a task that waits in the queue again cannot carry (the status check of the table: no taker, no failed day or person, no
 * retry time). A hand-off clears only this: the last error, the kind and the reason of the failure and the tries made stay with the
 * task for the person who takes it (F08); the table asks only that the kind and the reason come together.
 */
const QUEUED_AGAIN = {
  claimedByAppUserId: null,
  claimedAt: null,
  failedByAppUserId: null,
  failedAt: null,
  nextRetryAt: null,
} as const;

/** Everything a failed task carries, cleared when the decision is to try it again on its channel. */
const CLEARED = { ...QUEUED_AGAIN, failureKind: null, failureReason: null, lastError: null, attempts: 0 } as const;

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

  /**
   * A task in progress carries no failure kind or reason (the status check of the table), so a task handed off with them sheds both
   * when a person takes it; its last error and its tries stay, and the audit event of the failure keeps the rest.
   */
  async markClaimed(tx: DbTx, id: string, appUserId: string, now: Date): Promise<void> {
    await tx.provisioningTask.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        claimedByAppUserId: appUserId,
        claimedAt: now,
        failureKind: null,
        failureReason: null,
      },
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

  /**
   * The decision to hand a connector task to a person: it is queued again, by hand, with who handed it and when. No evidence is
   * written (it is asked when the manual work completes, F08); the last error, the failure kind and reason and the tries made are kept.
   */
  async markHandedOff(tx: DbTx, id: string, appUserId: string, now: Date): Promise<void> {
    await tx.provisioningTask.update({
      where: { id },
      data: {
        status: 'QUEUED',
        channel: 'MANUAL',
        ...QUEUED_AGAIN,
        handedOffByAppUserId: appUserId,
        handedOffAt: now,
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

  /**
   * The grant task of a request, locked `FOR UPDATE` until the transaction ends, or null when the request has none. A request
   * for one person has at most one: its grant makes one assignment and one task. A request for a group has one for each person,
   * so the task is the one of the seat of that person (`employeeId`).
   */
  async lockGrantOfRequest(tx: DbTx, requestId: string, employeeId?: string): Promise<ProvisioningTaskRecord | null> {
    const locked =
      employeeId === undefined
        ? await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM provisioning_tasks WHERE request_id = ${requestId}::uuid AND kind = 'GRANT' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`
        : await tx.$queryRaw<{ id: string }[]>`SELECT t.id FROM provisioning_tasks t
            JOIN license_assignments a ON a.id = t.assignment_id
           WHERE t.request_id = ${requestId}::uuid AND t.kind = 'GRANT' AND a.employee_id = ${employeeId}::uuid
           ORDER BY t.created_at DESC LIMIT 1 FOR UPDATE OF t`;
    if (locked.length === 0) return null;

    return this.find(locked[0].id, tx);
  }

  /** The cancellation of a task whose request was withdrawn: the end of it. A failure it had stays on the task. */
  async markCancelled(tx: DbTx, id: string, appUserId: string, reason: string, now: Date): Promise<void> {
    await tx.provisioningTask.update({
      where: { id },
      data: { status: 'CANCELLED', closedByAppUserId: appUserId, closedAt: now, closeReason: reason },
    });
  }

  /** A revocation of a seat: queued for a person, with the source that opened it. It has no request. */
  async insertRevocation(
    tx: DbTx,
    input: {
      organizationId: string;
      assignmentId: string;
      source: RevocationSource;
      defaultResponsibleEmployeeId: string | null;
      createdByAppUserId: string;
      maxAttempts: number;
    },
  ): Promise<ProvisioningTaskRecord> {
    const row = await tx.provisioningTask.create({
      data: {
        organizationId: input.organizationId,
        assignmentId: input.assignmentId,
        kind: 'REVOKE',
        channel: 'MANUAL',
        revocationSource: input.source,
        defaultResponsibleEmployeeId: input.defaultResponsibleEmployeeId,
        createdByAppUserId: input.createdByAppUserId,
        maxAttempts: input.maxAttempts,
      },
      include: WITH_ASSIGNMENT,
    });

    return toRecord(row);
  }

  /**
   * The revocation of a seat that is still alive (not closed as failed, not cancelled; a completed one is alive too: it ended
   * the seat), locked `FOR UPDATE` until the transaction ends, or null when the seat has none.
   */
  async lockLiveRevocation(tx: DbTx, assignmentId: string): Promise<ProvisioningTaskRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM provisioning_tasks
       WHERE assignment_id = ${assignmentId}::uuid AND kind = 'REVOKE' AND status NOT IN ('CLOSED_FAILED', 'CANCELLED')
       FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(locked[0].id, tx);
  }

  /** The completion of a revocation: who did it, the evidence, how it was done and what is known of the access. */
  async markRevocationCompleted(
    tx: DbTx,
    id: string,
    appUserId: string,
    input: {
      completion: RevocationCompletion;
      evidence: string;
      note: string | null;
      paidThroughOn: BusinessDate | null;
      accessState: AccessState | null;
      accessCutOn: BusinessDate | null;
      accessEvidence: string | null;
    },
    now: Date,
  ): Promise<void> {
    await tx.provisioningTask.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedByAppUserId: appUserId,
        completedAt: now,
        evidence: input.evidence,
        completion: input.completion,
        completionNote: input.note,
        paidThroughOn: input.paidThroughOn ? toDateColumn(input.paidThroughOn) : null,
        accessState: input.accessState,
        accessCutOn: input.accessCutOn ? toDateColumn(input.accessCutOn) : null,
        accessEvidence: input.accessEvidence,
      },
    });
  }

  /** The one change a completed revocation takes: its access, left to run to the end of the paid period, was cut on a day. */
  async markAccessCut(
    tx: DbTx,
    id: string,
    input: { accessCutOn: BusinessDate; accessEvidence: string },
  ): Promise<void> {
    await tx.provisioningTask.update({
      where: { id },
      data: {
        accessState: 'CUT',
        accessCutOn: toDateColumn(input.accessCutOn),
        accessEvidence: input.accessEvidence,
      },
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

  /**
   * One page of the queue as summaries, the oldest first, and the total for the same filter, from one snapshot. The
   * evidence, the last error, the failure reason, the hand-off evidence and the close reason (long text a detail shows)
   * are not selected (`LD-08`); the record carries them as null.
   */
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
          select: SUMMARY_SELECT,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return {
          items: rows.map((row) =>
            toRecord({
              ...row,
              evidence: null,
              lastError: null,
              failureReason: null,
              handOffEvidence: null,
              closeReason: null,
              accessEvidence: null,
              completionNote: null,
            }),
          ),
          total: await tx.provisioningTask.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
