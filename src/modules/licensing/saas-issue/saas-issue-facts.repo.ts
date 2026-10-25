import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OPEN_GRANT_TASK_STATUSES } from '../licensing-open-grants.types';
import type { ReportableAssignment } from './saas-issue.policy';

/** A right the caller may report on, with the grant that is not finished for it, if any. */
export interface EligibleRow {
  assignmentId: string;
  planId: string;
  grantTaskId: string | null;
}

const OPEN_GRANT = { kind: 'GRANT' as const, status: { in: [...OPEN_GRANT_TASK_STATUSES] } };

/**
 * What a report reads of the assignments and the grant tasks, which no write of it goes through (the writers are `AssignmentRepo` and
 * `ProvisioningTaskRepo`): the right a person reports on, the rights they may report on and the grant that is not finished for each.
 * Each read is a fixed number of statements, however many rights it covers.
 */
@Injectable()
export class SaasIssueFactsRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The plan of each of these assignments, in one statement. */
  async planIdsOf(assignmentIds: readonly string[]): Promise<Map<string, string>> {
    if (assignmentIds.length === 0) return new Map();
    const rows = await this.prisma.licenseAssignment.findMany({
      where: { id: { in: [...assignmentIds] } },
      select: { id: true, planId: true },
    });

    return new Map(rows.map((row) => [row.id, row.planId]));
  }

  /** Whether a grant task with this id exists. */
  async grantTaskExists(id: string, tx?: DbTx): Promise<boolean> {
    const row = await (tx ?? this.prisma).provisioningTask.findFirst({
      where: { id, kind: 'GRANT' },
      select: { id: true },
    });

    return row !== null;
  }

  /** The assignment as the rules judge it for a report, and the plan and the unfinished grant of it; null when it does not exist. */
  async assignmentFacts(
    tx: DbTx,
    id: string,
  ): Promise<{ assignment: ReportableAssignment; planId: string; grantTaskId: string | null } | null> {
    const row = await tx.licenseAssignment.findUnique({
      where: { id },
      select: {
        employeeId: true,
        kind: true,
        failedAt: true,
        cancelledAt: true,
        validUntil: true,
        planId: true,
        provisioningTasks: { where: OPEN_GRANT, select: { id: true }, orderBy: { id: 'asc' }, take: 1 },
      },
    });
    if (!row) return null;

    return {
      assignment: {
        employeeId: row.employeeId,
        kind: row.kind,
        failedAt: row.failedAt,
        cancelledAt: row.cancelledAt,
        validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
      },
      planId: row.planId,
      grantTaskId: row.provisioningTasks[0]?.id ?? null,
    };
  }

  /** One page of the personal rights a person holds today or will, with the unfinished grant of each, and the total. */
  async eligiblePage(
    employeeId: string,
    today: BusinessDate,
    page: { skip: number; take: number },
  ): Promise<{ items: EligibleRow[]; total: number }> {
    const where: Prisma.LicenseAssignmentWhereInput = {
      employeeId,
      kind: 'PERSONAL',
      failedAt: null,
      cancelledAt: null,
      OR: [{ validUntil: null }, { validUntil: { gt: toDateColumn(today) } }],
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.licenseAssignment.findMany({
          where,
          select: {
            id: true,
            planId: true,
            provisioningTasks: { where: OPEN_GRANT, select: { id: true }, orderBy: { id: 'asc' }, take: 1 },
          },
          orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
          skip: page.skip,
          take: page.take,
        });

        return {
          items: rows.map((row) => ({
            assignmentId: row.id,
            planId: row.planId,
            grantTaskId: row.provisioningTasks[0]?.id ?? null,
          })),
          total: await tx.licenseAssignment.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
