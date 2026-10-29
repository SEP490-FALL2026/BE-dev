import { Injectable } from '@nestjs/common';
import { toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AssignmentRecord } from '../public/licensing.types';
import { toRecord } from './assignment.repo';

/** A seat of the baseline that is held on a subscription, as the review after the installation needs to see it (F21). */
export interface BaselineSeatRow {
  assignmentId: string;
  employeeId: string;
  subscriptionId: string;
  /** The department the seat was written with; null on a row made before a personal seat carried it. */
  owningDepartmentId: string | null;
}

/**
 * What is read of the assignments by department: a read that no write goes through (the writer of `license_assignments` is
 * `AssignmentRepo`). The tools a department uses and the seats the baseline holds when it is closed.
 */
@Injectable()
export class AssignmentDepartmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of what a department uses on `day`, by start date then id, the total, and how many seats each plan holds, from
   * one snapshot (`LD-09`), grouped by the department that owns the seat, not by the department of whoever holds it now (F22,
   * `QĐ-89a`): the seats on the subscriptions the department owns (a personal seat made before it carried its department is
   * found through its subscription), the service accounts it owns (`QĐ-86c`), and the seats of its members on internal software,
   * which has no subscription and so no owner. Only the page is read in full.
   */
  async toolsOfDepartment(
    input: { memberIds: readonly string[]; departmentId: string },
    day: BusinessDate,
    skip: number,
    take: number,
  ): Promise<{ items: AssignmentRecord[]; total: number; byPlan: { planId: string; count: number }[] }> {
    const date = toDateColumn(day);
    const where: Prisma.LicenseAssignmentWhereInput = {
      validFrom: { lte: date },
      AND: [
        { OR: [{ validUntil: null }, { validUntil: { gt: date } }] },
        {
          OR: [
            { owningDepartmentId: input.departmentId },
            { kind: 'PERSONAL', owningDepartmentId: null, subscription: { ownerDepartmentId: input.departmentId } },
            {
              kind: 'PERSONAL',
              owningDepartmentId: null,
              subscriptionId: null,
              employeeId: { in: [...input.memberIds] },
            },
          ],
        },
      ],
    };

    return this.prisma.$transaction(
      async (tx) => {
        const [rows, total, groups] = await Promise.all([
          tx.licenseAssignment.findMany({ where, orderBy: [{ validFrom: 'asc' }, { id: 'asc' }], skip, take }),
          tx.licenseAssignment.count({ where }),
          tx.licenseAssignment.groupBy({ by: ['planId'], where, _count: { _all: true }, orderBy: { planId: 'asc' } }),
        ]);

        return {
          items: rows.map(toRecord),
          total,
          byPlan: groups.map((group) => ({ planId: group.planId, count: group._count._all })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * The personal seats the baseline wrote on a subscription that are open on `day`, by person then id: what closing the baseline
   * looks at to find the people who hold a seat of another department's subscription (F21, `QĐ-89e`).
   */
  async openBaselineSeats(day: BusinessDate, tx: DbTx): Promise<BaselineSeatRow[]> {
    const date = toDateColumn(day);
    const rows = await tx.licenseAssignment.findMany({
      where: {
        source: 'BASELINE',
        kind: 'PERSONAL',
        subscriptionId: { not: null },
        failedAt: null,
        cancelledAt: null,
        validFrom: { lte: date },
        OR: [{ validUntil: null }, { validUntil: { gt: date } }],
      },
      select: { id: true, employeeId: true, subscriptionId: true, owningDepartmentId: true },
      orderBy: [{ employeeId: 'asc' }, { id: 'asc' }],
    });

    return rows.flatMap((row) =>
      row.subscriptionId === null
        ? []
        : [
            {
              assignmentId: row.id,
              employeeId: row.employeeId,
              subscriptionId: row.subscriptionId,
              owningDepartmentId: row.owningDepartmentId,
            },
          ],
    );
  }
}
