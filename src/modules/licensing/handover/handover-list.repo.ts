import { Injectable } from '@nestjs/common';
import { BusinessDate, fromDateColumn, toDateColumn } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { HeadPeriodOfEmployee } from '../../organization/organization.types';
import { OPEN_DUTY, type DutyRecord } from './handover.repo';

const date = (value: Date | null): BusinessDate | null => (value ? fromDateColumn(value) : null);

/** The row of a list: what the list says of a duty, and the plan of the seat to name the tool by. */
export type DutySummaryRecord = Pick<
  DutyRecord,
  | 'id'
  | 'assignmentId'
  | 'employeeId'
  | 'source'
  | 'departmentId'
  | 'leaverIsHead'
  | 'resolveOn'
  | 'confirmerRole'
  | 'confirmerEmployeeId'
  | 'dataLoss'
  | 'dueOn'
  | 'confirmedAt'
  | 'cancelledAt'
  | 'confirmedLate'
  | 'proceededUnconfirmedAt'
> & { planId: string };

/** Whom a list is for: everything (the IT Admin, view only), or what falls to one person in the offices they hold. */
export type DutyScope =
  | { kind: 'ALL' }
  | {
      kind: 'MINE';
      employeeId: string;
      isItAdmin: boolean;
      /** The periods in which the person heads a department, from today on. */
      headPeriods: readonly HeadPeriodOfEmployee[];
    };

export interface DutyListFilter {
  scope: DutyScope;
  status?: 'OPEN' | 'CONFIRMED' | 'CANCELLED';
  employeeId?: string;
  overdue?: boolean;
  today: BusinessDate;
  page: number;
  pageSize: number;
}

const SUMMARY = {
  id: true,
  assignmentId: true,
  employeeId: true,
  source: true,
  departmentId: true,
  leaverIsHead: true,
  resolveOn: true,
  confirmerRole: true,
  confirmerEmployeeId: true,
  dataLoss: true,
  dueOn: true,
  confirmedAt: true,
  cancelledAt: true,
  confirmedLate: true,
  proceededUnconfirmedAt: true,
  assignment: { select: { planId: true } },
} as const;

/** What falls to a person: the duties of the IT Admin if they are one, the ones fixed to them, and the heads' duties they hold. */
function fallsTo(scope: Extract<DutyScope, { kind: 'MINE' }>, today: BusinessDate): Prisma.HandoverDutyWhereInput[] {
  const heads = scope.headPeriods.flatMap((period) => {
    const base = {
      confirmerRole: 'DEPARTMENT_HEAD' as const,
      confirmerEmployeeId: null,
      departmentId: period.departmentId,
    };
    const inOfficeToday = period.validFrom <= today && (period.validTo === null || period.validTo > today);
    const dayRange = {
      gte: toDateColumn(period.validFrom),
      ...(period.validTo ? { lt: toDateColumn(period.validTo) } : {}),
    };

    return [
      // The head of today looks after the duties of the people who leave and are not the head themselves.
      ...(inOfficeToday ? [{ ...base, leaverIsHead: false }] : []),
      // The successor of a head looks after the duties of the day they take office, even before it.
      { ...base, leaverIsHead: true, resolveOn: dayRange },
    ];
  });

  return [
    ...(scope.isItAdmin ? [{ confirmerRole: 'IT_ADMIN' as const }] : []),
    { confirmerEmployeeId: scope.employeeId },
    { confirmedByEmployeeId: scope.employeeId },
    ...heads.map((head) => ({ ...head, employeeId: { not: scope.employeeId } })),
  ];
}

/**
 * The read of the lists of duties: one page by deadline and its total. It writes nothing; `HandoverRepo` is the only writer of
 * `handover_duties`.
 */
@Injectable()
export class HandoverListRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** One page of duties by deadline and the total for the same filter, from one snapshot. */
  async list(filter: DutyListFilter): Promise<{ items: DutySummaryRecord[]; total: number }> {
    const clauses: Prisma.HandoverDutyWhereInput[] = [];
    if (filter.scope.kind === 'MINE') clauses.push({ OR: fallsTo(filter.scope, filter.today) });
    if (filter.employeeId) clauses.push({ employeeId: filter.employeeId });
    if (filter.status === 'OPEN') clauses.push(OPEN_DUTY);
    if (filter.status === 'CONFIRMED') clauses.push({ confirmedAt: { not: null } });
    if (filter.status === 'CANCELLED') clauses.push({ cancelledAt: { not: null } });
    if (filter.overdue) clauses.push({ ...OPEN_DUTY, dueOn: { lt: toDateColumn(filter.today) } });
    const where: Prisma.HandoverDutyWhereInput = { AND: clauses };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.handoverDuty.findMany({
          where,
          select: SUMMARY,
          orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
        });

        return {
          items: rows.map(({ assignment, resolveOn, dueOn, ...row }) => ({
            ...row,
            planId: assignment.planId,
            resolveOn: date(resolveOn),
            dueOn: fromDateColumn(dueOn),
          })),
          total: await tx.handoverDuty.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
