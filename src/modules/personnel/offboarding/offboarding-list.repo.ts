import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { OffboardingListFilter, OffboardingSummaryRecord } from './offboarding.types';

const SUMMARY = {
  id: true,
  employeeId: true,
  state: true,
  abrupt: true,
  lastWorkingDay: true,
  handoverDueOn: true,
  accountLockAt: true,
  closedAt: true,
  roleFlags: true,
} as const;

/** The reader of the list of cases: the page and the total from one snapshot, ordered by the last working day and the id. */
@Injectable()
export class OffboardingListRepo {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: OffboardingListFilter): Promise<{ items: OffboardingSummaryRecord[]; total: number }> {
    const where: Prisma.OffboardingCaseWhereInput = {
      ...(filter.departmentIds ? { departmentId: { in: [...filter.departmentIds] } } : {}),
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      // A handover that has gone past its last working day and has not become the departure (`US-03-04` AC-10).
      ...(filter.pastLastDay ? { state: 'HANDING_OVER', lastWorkingDay: { lt: toDateColumn(filter.today) } } : {}),
      // A person who has left whose company account nobody has recorded as locked yet, and whose case is still open.
      ...(filter.accountLockMissing ? { state: 'LEFT', accountLockAt: null, closedAt: null } : {}),
      // The roles the person held when the departure was recorded or its day moved (`US-03-04` AC-12): a snapshot to find the cases by.
      ...(filter.roleFlag ? { roleFlags: { has: filter.roleFlag } } : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.offboardingCase.findMany({
          where,
          select: SUMMARY,
          orderBy: [{ lastWorkingDay: 'asc' }, { id: 'asc' }],
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
        });

        return {
          items: rows.map((row) => ({
            id: row.id,
            employeeId: row.employeeId,
            state: row.state,
            abrupt: row.abrupt,
            lastWorkingDay: fromDateColumn(row.lastWorkingDay),
            handoverDueOn: row.handoverDueOn ? fromDateColumn(row.handoverDueOn) : null,
            accountLocked: row.accountLockAt !== null,
            closed: row.closedAt !== null,
            // Whether the person headed the department they leave is told by the snapshot, so the list never reads the handover of the head.
            headsDepartment: row.roleFlags.includes('DEPARTMENT_HEAD'),
          })),
          total: await tx.offboardingCase.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
