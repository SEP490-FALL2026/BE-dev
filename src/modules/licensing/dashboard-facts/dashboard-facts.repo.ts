import { Injectable } from '@nestjs/common';
import { addDays, fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { REMINDER_LEAD_DAYS } from '../expiry/expiry.policy';
import type { RightFacts } from '../my-software/my-software.policy';
import { OPEN_GRANT_TASK_STATUSES } from '../public/licensing-open-grants.types';
import type { ItAdminLicensingFacts } from '../public/licensing-dashboard.types';

/** A task that is not finished: to be done, being done, or failed and waiting for a decision. The same for a grant and a revocation. */
const OPEN_TASK = [...OPEN_GRANT_TASK_STATUSES];
/** A report that still waits for the IT Admin or its reporter: not resolved, closed or marked duplicate. */
const UNRESOLVED_SAAS_ISSUE = ['NEW', 'IN_PROGRESS', 'WAITING_REPORTER', 'WAITING_PROVIDER'] as const;

/**
 * The counts the overviews read of licensing, which no write goes through. Each method reads in one `RepeatableRead` snapshot with a
 * fixed number of statements, whatever the data. Only counts leave: no row, price, Cost Center, account identifier or key.
 */
@Injectable()
export class DashboardFactsRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The rights of a person held on the business day or starting later (as the default view of "my software"), the facts of those whose
   * expected end day is within the window of the reminder (judged by the caller with the rule of the list), and their open reports.
   */
  async employee(
    employeeId: string,
    today: BusinessDate,
  ): Promise<{ currentRights: number; nearEnd: RightFacts[]; openSaasIssues: number }> {
    const day = toDateColumn(today);
    const current: Prisma.LicenseAssignmentWhereInput = {
      employeeId,
      kind: 'PERSONAL',
      failedAt: null,
      cancelledAt: null,
      OR: [{ validUntil: null }, { validUntil: { gt: day } }],
    };

    return this.prisma.$transaction(
      async (tx) => {
        const currentRights = await tx.licenseAssignment.count({ where: current });
        const rows = await tx.licenseAssignment.findMany({
          where: {
            ...current,
            expectedEndDate: { gte: day, lte: toDateColumn(addDays(today, REMINDER_LEAD_DAYS)) },
          },
          select: {
            validFrom: true,
            validUntil: true,
            expectedEndDate: true,
            provisioningTasks: {
              where: {
                OR: [
                  { kind: 'GRANT', status: { in: OPEN_TASK } },
                  { kind: 'REVOKE', status: { in: OPEN_TASK } },
                  { kind: 'REVOKE', status: 'COMPLETED', accessState: 'UNTIL_PAID_END' },
                ],
              },
              select: { kind: true, status: true },
            },
            successors: {
              where: { kind: 'PERSONAL', failedAt: null, cancelledAt: null },
              select: { id: true },
              take: 1,
            },
          },
        });
        const openSaasIssues = await tx.saasIssue.count({
          where: { reporterEmployeeId: employeeId, state: { in: [...UNRESOLVED_SAAS_ISSUE] } },
        });

        return { currentRights, nearEnd: rows.map(toFacts), openSaasIssues };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The work of an IT Admin as the queues name it "mine": the tasks they are in charge of by default, the reports given to them. */
  async itAdmin(employeeId: string): Promise<ItAdminLicensingFacts> {
    return this.prisma.$transaction(
      async (tx) => {
        const openGrantTasks = await tx.provisioningTask.count({
          where: { kind: 'GRANT', status: { in: OPEN_TASK }, defaultResponsibleEmployeeId: employeeId },
        });
        const openRevocationTasks = await tx.provisioningTask.count({
          where: { kind: 'REVOKE', status: { in: OPEN_TASK }, defaultResponsibleEmployeeId: employeeId },
        });
        const openSaasIssues = await tx.saasIssue.count({
          where: { assignedItAdminEmployeeId: employeeId, state: { in: [...UNRESOLVED_SAAS_ISSUE] } },
        });
        const keysInStore = await tx.licenseKey.count({ where: { status: 'IN_STORE', withdrawnAt: null } });

        return { openGrantTasks, openRevocationTasks, openSaasIssues, keysInStore };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

function toFacts(row: {
  validFrom: Date;
  validUntil: Date | null;
  expectedEndDate: Date | null;
  provisioningTasks: { kind: 'GRANT' | 'REVOKE' | 'EXTEND'; status: string }[];
  successors: { id: string }[];
}): RightFacts {
  const tasks = row.provisioningTasks;

  return {
    effectiveFrom: fromDateColumn(row.validFrom),
    validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
    expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
    grantOpen: tasks.some((task) => task.kind === 'GRANT'),
    revocationOpen: tasks.some((task) => task.kind === 'REVOKE' && task.status !== 'COMPLETED'),
    accessUntilPaidEnd: tasks.some((task) => task.kind === 'REVOKE' && task.status === 'COMPLETED'),
    continued: row.successors.length > 0,
  };
}
