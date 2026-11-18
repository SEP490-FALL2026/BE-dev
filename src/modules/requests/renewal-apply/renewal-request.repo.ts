import { Injectable } from '@nestjs/common';
import { toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { PendingRenewal } from '../../licensing/public/licensing-renewal.types';

export interface NewRenewalDetail {
  requestId: string;
  assignmentId: string;
  previousExpectedEndDate: BusinessDate;
  newExpectedEndDate: BusinessDate | null;
  consecutiveMonths: number;
}

/** The states in which a request has no decision left to wait for: any other and its renewal still waits. */
const ENDED_STATES = ['REJECTED', 'IT_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'CANCELLED'] as const;

/**
 * The one writer of `access_request_renewals`: the detail a request for a renewal adds to its request, and the record that was
 * made when it was approved. The database keeps the rest (what was asked never changes, and the record is written once). The
 * request itself is written by the repository of requests, in the same transaction.
 */
@Injectable()
export class RenewalRequestRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewRenewalDetail): Promise<void> {
    await tx.accessRequestRenewal.create({
      data: {
        requestId: input.requestId,
        assignmentId: input.assignmentId,
        previousExpectedEndDate: toDateColumn(input.previousExpectedEndDate),
        newExpectedEndDate: input.newExpectedEndDate === null ? null : toDateColumn(input.newExpectedEndDate),
        consecutiveMonths: input.consecutiveMonths,
      },
    });
  }

  /** Writes the record the approval made after the old one; the caller holds the lock of the request. */
  async markApplied(tx: DbTx, requestId: string, successorAssignmentId: string, at: Date): Promise<void> {
    await tx.accessRequestRenewal.update({ where: { requestId }, data: { successorAssignmentId, appliedAt: at } });
  }

  /** Whether the seat has a request for its renewal that has not ended: not refused, withdrawn, completed or failed. */
  async hasOpenFor(assignmentId: string, tx?: DbTx): Promise<boolean> {
    const open = await (tx ?? this.prisma).accessRequestRenewal.count({
      where: { assignmentId, request: { state: { notIn: [...ENDED_STATES] } } },
    });

    return open > 0;
  }

  /**
   * The request that has not ended of each of these seats, in one read (a seat has at most one: a second is refused under the lock of the
   * seat), and whether it was approved: the IT Admin has then still to extend the right (`AWAITING_EXECUTION`).
   */
  async pendingOf(assignmentIds: readonly string[], tx?: DbTx): Promise<Map<string, PendingRenewal>> {
    if (assignmentIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).accessRequestRenewal.findMany({
      where: { assignmentId: { in: [...assignmentIds] }, request: { state: { notIn: [...ENDED_STATES] } } },
      select: { assignmentId: true, requestId: true, request: { select: { state: true } } },
      orderBy: { requestId: 'asc' },
    });

    return new Map(
      rows.map((row) => [
        row.assignmentId,
        { requestId: row.requestId, state: row.request.state, approved: row.request.state === 'AWAITING_EXECUTION' },
      ]),
    );
  }
}
