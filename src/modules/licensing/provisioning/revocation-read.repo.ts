import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ProvisioningTaskStatus, RevocationSource } from '../licensing.types';

export interface PersonalSeatRow {
  assignmentId: string;
  employeeId: string;
  planId: string;
  subscriptionId: string | null;
  grantReason: string | null;
  effectiveFrom: BusinessDate;
  validUntil: BusinessDate | null;
  revocation: { taskId: string; status: ProvisioningTaskStatus; source: RevocationSource } | null;
}

export interface TerminatingRow {
  taskId: string;
  assignmentId: string;
  employeeId: string;
  planId: string;
  subscriptionId: string | null;
  accessUntil: BusinessDate;
}

/**
 * What the lists of revocation read of the assignments and the tasks together: a read of two tables that no write goes
 * through (the writers are `AssignmentRepo` and `ProvisioningTaskRepo`). Each read is a fixed number of statements, however
 * many seats or people it covers.
 */
@Injectable()
export class RevocationReadRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The personal seats a person holds on `day` or will (not failed, not cancelled, not yet ended), with the revocation of each. */
  async personalSeatsOf(employeeId: string, day: BusinessDate, tx?: DbTx): Promise<PersonalSeatRow[]> {
    const rows = await (tx ?? this.prisma).licenseAssignment.findMany({
      where: {
        employeeId,
        kind: 'PERSONAL',
        failedAt: null,
        cancelledAt: null,
        OR: [{ validUntil: null }, { validUntil: { gt: toDateColumn(day) } }],
      },
      select: {
        id: true,
        employeeId: true,
        planId: true,
        subscriptionId: true,
        reason: true,
        validFrom: true,
        validUntil: true,
        provisioningTasks: {
          where: { kind: 'REVOKE', status: { notIn: ['CLOSED_FAILED', 'CANCELLED'] } },
          select: { id: true, status: true, revocationSource: true },
        },
      },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => {
      const task = row.provisioningTasks[0];

      return {
        assignmentId: row.id,
        employeeId: row.employeeId,
        planId: row.planId,
        subscriptionId: row.subscriptionId,
        grantReason: row.reason,
        effectiveFrom: fromDateColumn(row.validFrom),
        validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
        revocation:
          task && task.revocationSource
            ? { taskId: task.id, status: task.status, source: task.revocationSource }
            : null,
      };
    });
  }

  /** How many personal seats each of these people holds on `day` or will, in one statement (the people with none are absent). */
  async countPersonalSeats(employeeIds: readonly string[], day: BusinessDate, tx?: DbTx): Promise<Map<string, number>> {
    if (employeeIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).licenseAssignment.groupBy({
      by: ['employeeId'],
      where: {
        employeeId: { in: [...employeeIds] },
        kind: 'PERSONAL',
        failedAt: null,
        cancelledAt: null,
        OR: [{ validUntil: null }, { validUntil: { gt: toDateColumn(day) } }],
      },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.employeeId, row._count._all]));
  }

  /** The K1 seats of these people whose renewal is cancelled and whose access runs on past `day`. */
  async terminatingOf(employeeIds: readonly string[], day: BusinessDate, tx?: DbTx): Promise<TerminatingRow[]> {
    if (employeeIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).provisioningTask.findMany({
      where: {
        kind: 'REVOKE',
        status: 'COMPLETED',
        accessState: 'UNTIL_PAID_END',
        assignment: { employeeId: { in: [...employeeIds] }, validUntil: { gt: toDateColumn(day) } },
      },
      select: {
        id: true,
        assignment: { select: { id: true, employeeId: true, planId: true, subscriptionId: true, validUntil: true } },
      },
      orderBy: [{ assignment: { validUntil: 'asc' } }, { id: 'asc' }],
    });

    return rows.flatMap((row) =>
      row.assignment.validUntil
        ? [
            {
              taskId: row.id,
              assignmentId: row.assignment.id,
              employeeId: row.assignment.employeeId,
              planId: row.assignment.planId,
              subscriptionId: row.assignment.subscriptionId,
              accessUntil: fromDateColumn(row.assignment.validUntil),
            },
          ]
        : [],
    );
  }
}
