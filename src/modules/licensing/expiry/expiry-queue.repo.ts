import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ProvisioningTaskStatus } from '../licensing.types';

/** An open personal right whose end date has passed, with the revocation of it that is under way, if one is. */
export interface ExpiredRight {
  assignmentId: string;
  employeeId: string;
  planId: string;
  expectedEndDate: BusinessDate;
  revocation: { taskId: string; status: ProvisioningTaskStatus } | null;
}

/** The right the IT Admin asks to revoke, as it is before any rule judges it. */
export interface RightFacts {
  kind: 'PERSONAL' | 'SERVICE';
  expectedEndDate: BusinessDate | null;
  open: boolean;
  employeeId: string;
  revocation: { taskId: string; status: ProvisioningTaskStatus } | null;
}

/**
 * Reads the rights that have ended and are still held (`US-03-05`): a read, not a table of its own, so a right leaves the queue the
 * moment its record ends and no row can disagree with it. Nothing is written here; the revocation is opened through the gate.
 */
@Injectable()
export class ExpiryQueueRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every open personal right whose end date is before `today`, the earliest end first and then by id, with its live revocation
   * task. One statement however many there are; only the columns the queue needs.
   */
  async expired(today: BusinessDate, tx?: DbTx): Promise<ExpiredRight[]> {
    const rows = await (tx ?? this.prisma).licenseAssignment.findMany({
      where: {
        kind: 'PERSONAL',
        validUntil: null,
        failedAt: null,
        cancelledAt: null,
        expectedEndDate: { lt: toDateColumn(today) },
      },
      select: {
        id: true,
        employeeId: true,
        planId: true,
        expectedEndDate: true,
        provisioningTasks: {
          where: { kind: 'REVOKE', status: { notIn: ['CLOSED_FAILED', 'CANCELLED'] } },
          select: { id: true, status: true },
        },
      },
      orderBy: [{ expectedEndDate: 'asc' }, { id: 'asc' }],
    });

    return rows.flatMap((row) => {
      if (!row.expectedEndDate) return [];
      const task = row.provisioningTasks[0];

      return [
        {
          assignmentId: row.id,
          employeeId: row.employeeId,
          planId: row.planId,
          expectedEndDate: fromDateColumn(row.expectedEndDate),
          revocation: task ? { taskId: task.id, status: task.status } : null,
        },
      ];
    });
  }

  /** The facts of one right, or null when there is no such right. */
  async factsOf(assignmentId: string, tx?: DbTx): Promise<RightFacts | null> {
    const row = await (tx ?? this.prisma).licenseAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        kind: true,
        expectedEndDate: true,
        validUntil: true,
        failedAt: true,
        cancelledAt: true,
        employeeId: true,
        provisioningTasks: {
          where: { kind: 'REVOKE', status: { notIn: ['CLOSED_FAILED', 'CANCELLED'] } },
          select: { id: true, status: true },
        },
      },
    });
    if (!row) return null;
    const task = row.provisioningTasks[0];

    return {
      kind: row.kind,
      expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
      open: row.validUntil === null && row.failedAt === null && row.cancelledAt === null,
      employeeId: row.employeeId,
      revocation: task ? { taskId: task.id, status: task.status } : null,
    };
  }
}
