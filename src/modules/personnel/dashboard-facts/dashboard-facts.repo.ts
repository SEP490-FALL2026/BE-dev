import { Injectable } from '@nestjs/common';
import { toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { CalendarWindow, TransferDashboardFacts } from '../public/personnel-dashboard.types';

/** What the counts of the departures are cut by: the scope, the calendar window, this month, the cases past their deadline (told apart by id). */
export interface DepartureCountInput {
  departmentIds?: readonly string[] | undefined;
  calendar: CalendarWindow;
  /** This month as instants: `[from, to)`. */
  month: { from: Date; to: Date };
  /** The cases past the deadline of their revocations, which the seats of `licensing` decide: they are not "awaiting" any more. */
  overdueIds: readonly string[];
}

/**
 * The counts the role overviews read of personnel (`US-12-15` AC-3, AC-4, AC-7, SPEC P21), which no write goes through: one statement each, the
 * same filter as the list that shows the rows. Only counts leave, never a person, a reason or a document.
 */
@Injectable()
export class PersonnelDashboardFactsRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The departures of people of these departments that are still handing over. */
  handingOverCases(departmentIds: readonly string[]): Promise<number> {
    if (departmentIds.length === 0) return Promise.resolve(0);

    return this.prisma.offboardingCase.count({
      where: { departmentId: { in: [...departmentIds] }, state: 'HANDING_OVER' },
    });
  }

  /** The notices of heads that wait to be rejected or recorded. */
  noticesAwaitingHandling(): Promise<number> {
    return this.prisma.personnelNotice.count({ where: { status: 'PENDING_VERIFICATION' } });
  }

  /**
   * The departures by where they stand, in one snapshot. Cancelled cases stand nowhere. "Awaiting" is a case whose access is blocked (the system
   * announced its block moment, `QĐ-110b`) that is not closed and is not late.
   */
  async departureCounts(input: DepartureCountInput): Promise<{
    upcoming: number;
    awaitingRevocation: number;
    closedThisMonth: number;
    mailboxLockPending: number;
  }> {
    if (input.departmentIds?.length === 0) {
      return { upcoming: 0, awaitingRevocation: 0, closedThisMonth: 0, mailboxLockPending: 0 };
    }
    const scope: Prisma.OffboardingCaseWhereInput = input.departmentIds
      ? { departmentId: { in: [...input.departmentIds] } }
      : {};
    const live: Prisma.OffboardingCaseWhereInput = {
      ...scope,
      state: { in: ['HANDING_OVER', 'LEFT'] },
      closedAt: null,
    };

    return this.prisma.$transaction(
      async (tx) => ({
        upcoming: await tx.offboardingCase.count({
          where: {
            ...scope,
            state: 'HANDING_OVER',
            lastWorkingDay: { gte: toDateColumn(input.calendar.from), lte: toDateColumn(input.calendar.to) },
          },
        }),
        awaitingRevocation: await tx.offboardingCase.count({
          where: { ...live, blockAnnouncedAt: { not: null }, id: { notIn: [...input.overdueIds] } },
        }),
        closedThisMonth: await tx.offboardingCase.count({
          where: { ...scope, closedAt: { gte: input.month.from, lt: input.month.to } },
        }),
        mailboxLockPending: await tx.offboardingCase.count({
          where: { ...live, accountLockAt: { not: null }, mailboxLockAt: null },
        }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The transfers by phase on `today`, as `transferPhase` tells them: only a transfer that took effect and is not closed has one of these three. */
  async transferCounts(input: {
    departmentIds?: readonly string[] | undefined;
    today: BusinessDate;
  }): Promise<TransferDashboardFacts> {
    if (input.departmentIds?.length === 0) return { inGrace: 0, graceEndingSoon: 0, revoking: 0 };
    const day = toDateColumn(input.today);
    const open: Prisma.DepartmentTransferWhereInput = {
      status: 'EFFECTIVE',
      closedAt: null,
      ...(input.departmentIds
        ? {
            OR: [
              { fromDepartmentId: { in: [...input.departmentIds] } },
              { toDepartmentId: { in: [...input.departmentIds] } },
            ],
          }
        : {}),
    };
    // A transfer that has no grace (it took effect before the grace existed and was not given one) is still in the grace, as the phase says.
    const keepsGrace: Prisma.DepartmentTransferWhereInput = {
      OR: [{ graceEndsOn: null }, { graceEndsOn: { gte: day } }],
    };

    return this.prisma.$transaction(
      async (tx) => ({
        inGrace: await tx.departmentTransfer.count({ where: { AND: [open, keepsGrace] } }),
        graceEndingSoon: await tx.departmentTransfer.count({
          where: { AND: [open, { graceEndsOn: { gte: day }, graceReminderOn: { lte: day } }] },
        }),
        revoking: await tx.departmentTransfer.count({ where: { AND: [open, { graceEndsOn: { lt: day } }] } }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * The people of the files (a departure or a transfer not cancelled) that kept what an IT Admin answered for when they were recorded (R-8),
   * one entry for each file: whether the person still answers for something is for the catalog to say.
   */
  async handoverFileEmployees(): Promise<string[]> {
    const rows = await this.prisma.itAdminHandover.findMany({
      where: {
        OR: [
          { offboardingCase: { is: { state: { not: 'CANCELLED' } } } },
          { departmentTransfer: { is: { status: { not: 'CANCELLED' } } } },
        ],
      },
      select: {
        offboardingCase: { select: { employeeId: true } },
        departmentTransfer: { select: { employeeId: true } },
      },
      orderBy: { id: 'asc' },
    });

    return rows.flatMap((row) => {
      const employeeId = row.offboardingCase?.employeeId ?? row.departmentTransfer?.employeeId;

      return employeeId ? [employeeId] : [];
    });
  }
}
