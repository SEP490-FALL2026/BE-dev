import { Injectable } from '@nestjs/common';
import { toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { AssignmentRecord } from '../public/licensing.types';
import { toRecord } from './assignment-record.mapper';

/**
 * What is read of the assignments by department: a read that no write goes through (the writer of `license_assignments` is
 * `AssignmentRepo`). The tools a department uses.
 */
@Injectable()
export class AssignmentDepartmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of what a department uses on `day`, by start date then id, the total, and how many seats each plan holds, from
   * one snapshot, grouped by the department the seat was written for, not by the department of whoever holds it now: the seats written with the department, the service accounts it owns, and the personal seats of its members that carry no department. Only the page is read in full.
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
            {
              kind: 'PERSONAL',
              owningDepartmentId: null,
              employeeId: { in: [...input.memberIds] },
            },
          ],
        },
      ],
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.licenseAssignment.findMany({
          where,
          orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
          skip,
          take,
        });
        const total = await tx.licenseAssignment.count({ where });
        const groups = await tx.licenseAssignment.groupBy({
          by: ['planId'],
          where,
          _count: { _all: true },
          orderBy: { planId: 'asc' },
        });

        return {
          items: rows.map(toRecord),
          total,
          byPlan: groups.map((group) => ({ planId: group.planId, count: group._count._all })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
