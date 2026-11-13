import { Injectable } from '@nestjs/common';
import { addDays, fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  CalendarWindow,
  GraceWindowFacts,
  RevocationWindowQuery,
  TransferDashboardFacts,
} from '../public/personnel-dashboard.types';

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

  /**
   * The departures whose window of revocations opens in a range of days (the day after the last working day), with the deadline kept on the case: the
   * ones not cancelled that have one. `departmentIds` narrows to the departments of an IT Admin.
   */
  async departureWindows(
    query: RevocationWindowQuery,
  ): Promise<{ id: string; employeeId: string; departmentId: string; startOn: BusinessDate; dueOn: BusinessDate }[]> {
    if (query.departmentIds?.length === 0) return [];
    const rows = await this.prisma.offboardingCase.findMany({
      where: {
        state: { not: 'CANCELLED' },
        revocationDueOn: { not: null },
        departmentId: query.departmentIds ? { in: [...query.departmentIds] } : { not: null },
        lastWorkingDay: { gte: toDateColumn(addDays(query.from, -1)), lte: toDateColumn(addDays(query.to, -1)) },
      },
      select: { id: true, employeeId: true, departmentId: true, lastWorkingDay: true, revocationDueOn: true },
      orderBy: { id: 'asc' },
    });

    return rows.flatMap((row) =>
      row.departmentId && row.revocationDueOn
        ? [
            {
              id: row.id,
              employeeId: row.employeeId,
              departmentId: row.departmentId,
              startOn: addDays(fromDateColumn(row.lastWorkingDay), 1),
              dueOn: fromDateColumn(row.revocationDueOn),
            },
          ]
        : [],
    );
  }

  /**
   * The transfers whose window of revocations opens in a range of days (the day after the grace): the ones that took effect with a grace, not taken over
   * by a departure (its rights are the departure's to take back). `departmentIds` narrows to the departments they enter, where the tasks go.
   */
  async transferWindows(
    query: RevocationWindowQuery,
  ): Promise<{ id: string; employeeId: string; departmentId: string; graceEndsOn: BusinessDate }[]> {
    if (query.departmentIds?.length === 0) return [];
    const rows = await this.prisma.departmentTransfer.findMany({
      where: {
        status: 'EFFECTIVE',
        supersededByCaseId: null,
        graceEndsOn: { gte: toDateColumn(addDays(query.from, -1)), lte: toDateColumn(addDays(query.to, -1)) },
        ...(query.departmentIds ? { toDepartmentId: { in: [...query.departmentIds] } } : {}),
      },
      select: { id: true, employeeId: true, toDepartmentId: true, graceEndsOn: true },
      orderBy: { id: 'asc' },
    });

    return rows.flatMap((row) =>
      row.graceEndsOn
        ? [
            {
              id: row.id,
              employeeId: row.employeeId,
              departmentId: row.toDepartmentId,
              graceEndsOn: fromDateColumn(row.graceEndsOn),
            },
          ]
        : [],
    );
  }

  /** The graces of the transfers of these people that took effect, newest first: the days they keep the rights of the old department. */
  async graceWindowsOf(employeeIds: readonly string[]): Promise<GraceWindowFacts[]> {
    if (employeeIds.length === 0) return [];
    const rows = await this.prisma.departmentTransfer.findMany({
      where: { employeeId: { in: [...employeeIds] }, status: 'EFFECTIVE', graceEndsOn: { not: null } },
      select: { employeeId: true, effectiveOn: true, graceEndsOn: true },
      orderBy: [{ effectiveOn: 'desc' }, { id: 'asc' }],
    });

    return rows.flatMap((row) =>
      row.graceEndsOn
        ? [
            {
              employeeId: row.employeeId,
              effectiveOn: fromDateColumn(row.effectiveOn),
              graceEndsOn: fromDateColumn(row.graceEndsOn),
            },
          ]
        : [],
    );
  }
}
