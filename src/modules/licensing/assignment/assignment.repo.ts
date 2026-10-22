import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  AssignmentDateBasis,
  AssignmentKind,
  AssignmentListFilter,
  AssignmentRecord,
  AssignmentSource,
  ExistingAssignment,
} from '../licensing.types';

type Row = Prisma.LicenseAssignmentGetPayload<object>;

/** An assignment holds a seat from the day it is made until it ends or fails: not ended as of `day` and not failed. */
const HOLDING = (day: BusinessDate): Prisma.LicenseAssignmentWhereInput => ({
  failedAt: null,
  OR: [{ validUntil: null }, { validUntil: { gt: toDateColumn(day) } }],
});

const toRecord = (row: Row): AssignmentRecord => ({
  id: row.id,
  source: row.source,
  kind: row.kind,
  planId: row.planId,
  subscriptionId: row.subscriptionId,
  employeeId: row.employeeId,
  accountIdentifier: row.accountIdentifier,
  reason: row.reason,
  costCenterId: row.costCenterId,
  effectiveFrom: fromDateColumn(row.validFrom),
  effectiveFromBasis: row.validFromBasis,
  validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
  expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
  predecessorId: row.predecessorId,
  failedAt: row.failedAt,
  createdAt: row.createdAt,
});

export interface NewAssignment {
  organizationId: string;
  source: AssignmentSource;
  kind: AssignmentKind;
  planId: string;
  subscriptionId: string | null;
  employeeId: string;
  accountIdentifier: string;
  normalizedAccountIdentifier: string;
  reason: string | null;
  costCenterId: string | null;
  effectiveFrom: BusinessDate;
  effectiveFromBasis: AssignmentDateBasis;
  expectedEndDate: BusinessDate | null;
  predecessorId: string | null;
  baselineImportId: string | null;
  createdByAppUserId: string;
}

/**
 * The one writer of `license_assignments`. Rows are never deleted and only `valid_until` and `expected_end_date` ever
 * change (the database refuses the rest), so there is no update of anything else here.
 */
@Injectable()
export class AssignmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewAssignment): Promise<AssignmentRecord> {
    const row = await tx.licenseAssignment.create({
      data: {
        organizationId: input.organizationId,
        source: input.source,
        kind: input.kind,
        planId: input.planId,
        subscriptionId: input.subscriptionId,
        employeeId: input.employeeId,
        accountIdentifier: input.accountIdentifier,
        normalizedAccountIdentifier: input.normalizedAccountIdentifier,
        reason: input.reason,
        costCenterId: input.costCenterId,
        validFrom: toDateColumn(input.effectiveFrom),
        validFromBasis: input.effectiveFromBasis,
        expectedEndDate: input.expectedEndDate ? toDateColumn(input.expectedEndDate) : null,
        predecessorId: input.predecessorId,
        baselineImportId: input.baselineImportId,
        createdByAppUserId: input.createdByAppUserId,
      },
    });

    return toRecord(row);
  }

  async find(id: string, tx?: DbTx): Promise<AssignmentRecord | null> {
    const row = await (tx ?? this.prisma).licenseAssignment.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The assignment, locked `FOR UPDATE` for the rest of the transaction, or null. */
  async lock(tx: DbTx, id: string): Promise<AssignmentRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM license_assignments WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  /** Ends the assignment the day `until` (that day no longer counts). */
  async end(tx: DbTx, id: string, until: BusinessDate): Promise<void> {
    await tx.licenseAssignment.update({ where: { id }, data: { validUntil: toDateColumn(until) } });
  }

  /**
   * Marks the assignment as failed: it ends the day it started, so its period is empty and no day counts it among the
   * seats taken. The database lets this happen once and only to an assignment that is still open.
   */
  async markFailed(tx: DbTx, id: string, now: Date): Promise<void> {
    await tx.$executeRaw`UPDATE license_assignments SET failed_at = ${now}, valid_until = valid_from WHERE id = ${id}::uuid`;
  }

  /** Every assignment of one subscription, or of one internal plan that has none, as a judgement needs to see them. */
  async existingOf(
    target: { subscriptionId: string | null; planId: string },
    tx?: DbTx,
  ): Promise<ExistingAssignment[]> {
    const rows = await (tx ?? this.prisma).licenseAssignment.findMany({
      where: target.subscriptionId
        ? { subscriptionId: target.subscriptionId }
        : { planId: target.planId, subscriptionId: null },
      select: { employeeId: true, kind: true, normalizedAccountIdentifier: true, validFrom: true, validUntil: true },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      employeeId: row.employeeId,
      kind: row.kind,
      normalizedAccountIdentifier: row.normalizedAccountIdentifier,
      effectiveFrom: fromDateColumn(row.validFrom),
      validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
    }));
  }

  /** How many assignments of the subscription occupy `day`. */
  async countOccupying(subscriptionId: string, day: BusinessDate, tx?: DbTx): Promise<number> {
    const date = toDateColumn(day);

    return (tx ?? this.prisma).licenseAssignment.count({
      where: {
        subscriptionId,
        validFrom: { lte: date },
        OR: [{ validUntil: null }, { validUntil: { gt: date } }],
      },
    });
  }

  /** The assignments of the subscription that have not ended and have not failed as of `day` (a future start included). */
  async countHolding(subscriptionId: string, day: BusinessDate, tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).licenseAssignment.count({ where: { subscriptionId, ...HOLDING(day) } });
  }

  /** The assignments of these plan ids that have not ended and have not failed as of `day`, by start then id. */
  async holdingOfPlans(planIds: readonly string[], day: BusinessDate): Promise<AssignmentRecord[]> {
    if (planIds.length === 0) return [];
    const rows = await this.prisma.licenseAssignment.findMany({
      where: { planId: { in: [...planIds] }, ...HOLDING(day) },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** How many different people hold an assignment of these plan ids that has not ended and has not failed. */
  async countHoldersOfPlans(planIds: readonly string[], day: BusinessDate): Promise<number> {
    if (planIds.length === 0) return 0;
    const groups = await this.prisma.licenseAssignment.groupBy({
      by: ['employeeId'],
      where: { planId: { in: [...planIds] }, ...HOLDING(day) },
    });

    return groups.length;
  }

  /** Who holds a seat on `day`, with the number of assignments each holds (a service account counts as a seat). */
  async openHolders(day: BusinessDate): Promise<{ employeeId: string; seats: number }[]> {
    const date = toDateColumn(day);
    const groups = await this.prisma.licenseAssignment.groupBy({
      by: ['employeeId'],
      where: { validFrom: { lte: date }, OR: [{ validUntil: null }, { validUntil: { gt: date } }] },
      _count: { _all: true },
    });

    return groups.map((group) => ({ employeeId: group.employeeId, seats: group._count._all }));
  }

  /** The assignments these people hold on `day`, by start date then id. */
  async openOf(employeeIds: readonly string[], day: BusinessDate): Promise<AssignmentRecord[]> {
    if (employeeIds.length === 0) return [];
    const date = toDateColumn(day);
    const rows = await this.prisma.licenseAssignment.findMany({
      where: {
        employeeId: { in: [...employeeIds] },
        validFrom: { lte: date },
        OR: [{ validUntil: null }, { validUntil: { gt: date } }],
      },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** How many assignments came from the baseline import. */
  async countBaseline(): Promise<number> {
    return this.prisma.licenseAssignment.count({ where: { source: 'BASELINE' } });
  }

  /** One page of assignments by start date then id, and the total for the same filter, from one snapshot. */
  async page(filter: AssignmentListFilter): Promise<{ items: AssignmentRecord[]; total: number }> {
    const where: Prisma.LicenseAssignmentWhereInput = {
      ...(filter.subscriptionId ? { subscriptionId: filter.subscriptionId } : {}),
      ...(filter.planId ? { planId: filter.planId } : {}),
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.licenseAssignment.findMany({
          where,
          orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toRecord), total: await tx.licenseAssignment.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
