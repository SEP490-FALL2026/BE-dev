import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { OPEN_GRANT_TASK_STATUSES } from '../public/licensing-open-grants.types';
import type { AssignmentDateBasis } from '../public/licensing.types';
import type { MySoftwareView, RightFacts } from './my-software.policy';

/** A right of the person as the list reads it: the record, its plan, and the facts its status is judged from. */
export interface MyRightRow extends RightFacts {
  assignmentId: string;
  planId: string;
  effectiveFromBasis: AssignmentDateBasis;
  successorAssignmentId: string | null;
}

/** A revocation that still runs: not done, not cancelled, not closed as failed. */
const OPEN_REVOCATION = ['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'FAILED'] as const;

/**
 * What the list of a person's own rights reads of the assignments and their tasks, which no write of it goes through (the writers are
 * `AssignmentRepo` and `ProvisioningTaskRepo`). Only the personal seats of that person are ever read, never a service account they
 * answer for, never a seat of anyone else, and never a license key, a price or a Cost Center. A seat that never held anything (its grant
 * failed or was cancelled) is not a right and is never listed. The page and its count share one snapshot, and the number of statements
 * does not grow with the page.
 */
@Injectable()
export class MySoftwareRepo {
  constructor(private readonly prisma: PrismaService) {}

  async page(
    employeeId: string,
    view: MySoftwareView,
    today: BusinessDate,
    page: { skip: number; take: number },
  ): Promise<{ items: MyRightRow[]; total: number }> {
    const day = toDateColumn(today);
    const where: Prisma.LicenseAssignmentWhereInput = {
      employeeId,
      kind: 'PERSONAL',
      failedAt: null,
      cancelledAt: null,
      ...(view === 'current'
        ? { OR: [{ validUntil: null }, { validUntil: { gt: day } }] }
        : { validUntil: { lte: day } }),
    };
    const orderBy: Prisma.LicenseAssignmentOrderByWithRelationInput[] =
      view === 'current' ? [{ validFrom: 'asc' }, { id: 'asc' }] : [{ validUntil: 'desc' }, { id: 'asc' }];

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.licenseAssignment.findMany({
          where,
          select: {
            id: true,
            planId: true,
            validFrom: true,
            validFromBasis: true,
            validUntil: true,
            expectedEndDate: true,
            provisioningTasks: {
              where: {
                OR: [
                  { kind: 'GRANT', status: { in: [...OPEN_GRANT_TASK_STATUSES] } },
                  { kind: 'REVOKE', status: { in: [...OPEN_REVOCATION] } },
                  { kind: 'REVOKE', status: 'COMPLETED', accessState: 'UNTIL_PAID_END' },
                ],
              },
              select: { kind: true, status: true },
            },
            successors: {
              where: { kind: 'PERSONAL', failedAt: null, cancelledAt: null },
              select: { id: true },
              orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
              take: 1,
            },
          },
          orderBy,
          skip: page.skip,
          take: page.take,
        });

        return { items: rows.map(toRow), total: await tx.licenseAssignment.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

function toRow(row: {
  id: string;
  planId: string;
  validFrom: Date;
  validFromBasis: AssignmentDateBasis;
  validUntil: Date | null;
  expectedEndDate: Date | null;
  provisioningTasks: { kind: 'GRANT' | 'REVOKE'; status: string }[];
  successors: { id: string }[];
}): MyRightRow {
  const tasks = row.provisioningTasks;
  const successor = row.successors[0]?.id ?? null;

  return {
    assignmentId: row.id,
    planId: row.planId,
    effectiveFrom: fromDateColumn(row.validFrom),
    effectiveFromBasis: row.validFromBasis,
    validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
    expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
    grantOpen: tasks.some((task) => task.kind === 'GRANT'),
    revocationOpen: tasks.some((task) => task.kind === 'REVOKE' && task.status !== 'COMPLETED'),
    accessUntilPaidEnd: tasks.some((task) => task.kind === 'REVOKE' && task.status === 'COMPLETED'),
    continued: successor !== null,
    successorAssignmentId: successor,
  };
}
