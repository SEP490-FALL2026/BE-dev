import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  AccountIdentifierHolder,
  AssignmentInterval,
  AssignmentIntervalFilter,
} from '../public/licensing-usage.types';

type Db = DbTx | PrismaService;

/** What usage is read against of the seats: the intervals, the holders of an account identifier and who holds a seat on a day. Reads only. */
@Injectable()
export class UsageFactsRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The assignments that held a seat on some day of `[from, to]`, not failed and not cancelled, each with the day its seat could be used. */
  async intervals(
    filter: AssignmentIntervalFilter,
    toBusinessDate: (instant: Date) => BusinessDate,
    tx?: DbTx,
  ): Promise<AssignmentInterval[]> {
    const db: Db = tx ?? this.prisma;
    const rows = await db.licenseAssignment.findMany({
      where: {
        failedAt: null,
        cancelledAt: null,
        validFrom: { lte: toDateColumn(filter.to) },
        OR: [{ validUntil: null }, { validUntil: { gt: toDateColumn(filter.from) } }],
        ...(filter.employeeIds ? { employeeId: { in: [...filter.employeeIds] } } : {}),
        plan: {
          ...(filter.planIds ? { id: { in: [...filter.planIds] } } : {}),
          ...(filter.applicationId ? { applicationId: filter.applicationId } : {}),
        },
      },
      select: {
        id: true,
        planId: true,
        employeeId: true,
        validFrom: true,
        validUntil: true,
        plan: { select: { applicationId: true } },
      },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });
    if (rows.length === 0) return [];
    const rootOf = await this.chainRoots(
      db,
      rows.map((row) => row.id),
    );
    const usable = await this.usableDays(
      db,
      [...new Set(rows.map((row) => rootOf.get(row.id) ?? row.id))],
      toBusinessDate,
    );

    return rows.map((row) => {
      const chainRootId = rootOf.get(row.id) ?? row.id;

      return {
        assignmentId: row.id,
        chainRootId,
        planId: row.planId,
        applicationId: row.plan.applicationId,
        employeeId: row.employeeId,
        from: fromDateColumn(row.validFrom),
        until: row.validUntil ? fromDateColumn(row.validUntil) : null,
        usableOn: usable.get(chainRootId) ?? fromDateColumn(row.validFrom),
      };
    });
  }

  /** The first assignment of the chain each of these belongs to (itself when it has no predecessor), in one statement. */
  private async chainRoots(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
    const roots = await db.$queryRaw<{ seat_id: string; root_id: string }[]>`
      WITH RECURSIVE walk AS (
        SELECT a."id" AS seat_id, a."id" AS current_id, a."predecessor_id" AS next_id
          FROM "license_assignments" a
         WHERE a."id" = ANY(${[...ids]}::uuid[])
        UNION ALL
        SELECT w.seat_id, p."id", p."predecessor_id"
          FROM walk w JOIN "license_assignments" p ON p."id" = w.next_id
      )
      SELECT seat_id, current_id AS root_id FROM walk WHERE next_id IS NULL`;

    return new Map(roots.map((row) => [row.seat_id, row.root_id]));
  }

  /** The day each first assignment of a chain could be used: the later of its `valid_from` and the day its grant task was completed (`QĐ-77n`). */
  private async usableDays(
    db: Db,
    rootIds: readonly string[],
    toBusinessDate: (instant: Date) => BusinessDate,
  ): Promise<Map<string, BusinessDate>> {
    const firsts = await db.licenseAssignment.findMany({
      where: { id: { in: [...rootIds] } },
      select: {
        id: true,
        validFrom: true,
        provisioningTasks: {
          where: { kind: 'GRANT', status: 'COMPLETED' },
          select: { completedAt: true },
          orderBy: { completedAt: 'desc' },
          take: 1,
        },
      },
    });

    return new Map(
      firsts.map((root) => {
        const from = fromDateColumn(root.validFrom);
        const done = root.provisioningTasks[0]?.completedAt;
        const doneOn = done ? toBusinessDate(done) : null;

        return [root.id, doneOn !== null && doneOn > from ? doneOn : from] as const;
      }),
    );
  }

  /** The seats of the application under these normalized account identifiers, past ones included: a person who left is still who the account was. */
  async holdersOfAccounts(
    applicationId: string,
    normalizedIdentifiers: readonly string[],
    tx?: DbTx,
  ): Promise<AccountIdentifierHolder[]> {
    if (normalizedIdentifiers.length === 0) return [];

    return (tx ?? this.prisma).licenseAssignment.findMany({
      where: {
        failedAt: null,
        cancelledAt: null,
        normalizedAccountIdentifier: { in: [...normalizedIdentifiers] },
        plan: { applicationId },
      },
      select: { normalizedAccountIdentifier: true, employeeId: true },
      distinct: ['normalizedAccountIdentifier', 'employeeId'],
    });
  }

  /** The people who hold a seat of the application on the day, each once. */
  async currentHolders(applicationId: string, asOf: BusinessDate, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).licenseAssignment.findMany({
      where: {
        failedAt: null,
        cancelledAt: null,
        validFrom: { lte: toDateColumn(asOf) },
        OR: [{ validUntil: null }, { validUntil: { gt: toDateColumn(asOf) } }],
        plan: { applicationId },
      },
      select: { employeeId: true },
      distinct: ['employeeId'],
      orderBy: { employeeId: 'asc' },
    });

    return rows.map((row) => row.employeeId);
  }
}
