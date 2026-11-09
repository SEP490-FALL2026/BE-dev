import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ProvisioningTaskStatus, RevocationSource } from '../public/licensing.types';

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

/** A seat the person holds today, as the department head reads it: which plan, since when, until when. */
export interface HeldSeatRow {
  assignmentId: string;
  planId: string;
  effectiveFrom: BusinessDate;
  validUntil: BusinessDate | null;
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
          // Under way only while a reason that was not withdrawn asks for it (a withdrawn reason is read nowhere).
          where: {
            kind: 'REVOKE',
            status: { notIn: ['CLOSED_FAILED', 'CANCELLED'] },
            reasons: { some: { withdrawnAt: null } },
          },
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

  /**
   * The personal seats a person holds on `day` (begun, not failed, not cancelled, not yet ended), one page and the total. They share
   * one snapshot when the caller has no transaction of its own, and the page reads only what the answer shows (`API-LIST-DETAIL.1`).
   */
  async heldPage(
    employeeId: string,
    day: BusinessDate,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: HeldSeatRow[]; total: number }> {
    const where = {
      employeeId,
      kind: 'PERSONAL' as const,
      failedAt: null,
      cancelledAt: null,
      validFrom: { lte: toDateColumn(day) },
      OR: [{ validUntil: null }, { validUntil: { gt: toDateColumn(day) } }],
    };
    const read = async (db: DbTx) => {
      const rows = await db.licenseAssignment.findMany({
        where,
        select: { id: true, planId: true, validFrom: true, validUntil: true },
        orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      });

      return {
        items: rows.map((row) => ({
          assignmentId: row.id,
          planId: row.planId,
          effectiveFrom: fromDateColumn(row.validFrom),
          validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
        })),
        total: await db.licenseAssignment.count({ where }),
      };
    };

    return tx
      ? read(tx)
      : this.prisma.$transaction(read, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
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

  /**
   * The paid applications each of these people uses on `day` or will (GH-3, `BR-MF1-01g`): their personal seats not failed, not
   * cancelled and not ended, of an application that is not internal and of a plan that is not `K5`. Two plans of one application are
   * one application. One statement; the people with none are absent.
   */
  async paidApplicationsOf(
    employeeIds: readonly string[],
    day: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, Set<string>>> {
    if (employeeIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).licenseAssignment.findMany({
      where: {
        employeeId: { in: [...employeeIds] },
        kind: 'PERSONAL',
        failedAt: null,
        cancelledAt: null,
        OR: [{ validUntil: null }, { validUntil: { gt: toDateColumn(day) } }],
        plan: { provisioningType: { not: 'K5' }, application: { kind: { not: 'INTERNAL' } } },
      },
      select: { employeeId: true, plan: { select: { applicationId: true } } },
    });
    const found = new Map<string, Set<string>>();
    for (const row of rows) {
      const applications = found.get(row.employeeId) ?? new Set<string>();
      applications.add(row.plan.applicationId);
      found.set(row.employeeId, applications);
    }

    return found;
  }

  /**
   * Which of these seats have a revocation under way or done (a task of the kind that is not cancelled and not closed as failed)
   * that was asked for with one of these sources and this reference, whatever else asked for it too. One statement.
   */
  async openedByReference(
    sources: readonly RevocationSource[],
    referenceId: string,
    assignmentIds: readonly string[],
    tx?: DbTx,
  ): Promise<Set<string>> {
    if (assignmentIds.length === 0) return new Set();
    const rows = await (tx ?? this.prisma).provisioningTask.findMany({
      where: {
        kind: 'REVOKE',
        status: { notIn: ['CLOSED_FAILED', 'CANCELLED'] },
        assignmentId: { in: [...assignmentIds] },
        reasons: { some: { source: { in: [...sources] }, referenceId, withdrawnAt: null } },
      },
      select: { assignmentId: true },
    });

    return new Set(rows.map((row) => row.assignmentId));
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
