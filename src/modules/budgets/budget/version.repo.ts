import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { VersionStateName } from './budget.policy';
import { lineData, type VersionLineRecord } from './version-line.repo';

export type VersionState = VersionStateName;

export interface VersionRecord {
  id: string;
  organizationId: string;
  costCenterId: string;
  year: number;
  number: number;
  kind: 'INITIAL' | 'REVISION';
  state: VersionState;
  proposalId: string | null;
  basedOnVersionId: string | null;
  baseMinor: bigint;
  reserveMinor: bigint;
  totalMinor: bigint;
  currency: string;
  highValuePercent: number;
  /** The amount over which a line is high value, whatever is left; null when the version sets none. */
  highValueAmountMinor: bigint | null;
  quarters: [bigint, bigint, bigint, bigint] | null;
  reason: string | null;
  createdByEmployeeId: string;
  createdAt: Date;
  sentByEmployeeId: string | null;
  sentAt: Date | null;
  /** When the draft was detached from the proposal that was withdrawn or given back; null for any other version. */
  detachedAt: Date | null;
  /** Closed with its year without ever being the budget of the year. */
  neverCurrent: boolean;
  expiredAt: Date | null;
  /** The refused version this one follows, when it is made again from the same proposal. */
  rejectedPredecessorId: string | null;
}

export interface NewVersion {
  organizationId: string;
  costCenterId: string;
  year: number;
  kind: 'INITIAL' | 'REVISION';
  proposalId: string | null;
  basedOnVersionId: string | null;
  rejectedPredecessorId?: string | null;
  baseMinor: bigint;
  reserveMinor: bigint;
  currency: string;
  highValuePercent: number;
  highValueAmountMinor: bigint | null;
  quarters: [bigint, bigint, bigint, bigint] | null;
  reason: string | null;
  createdByEmployeeId: string;
  now: Date;
  lines: Omit<VersionLineRecord, 'position'>[];
}

/** The fields of a version Finance changes while it is a draft: a key that is present is written. */
export interface VersionPatch {
  baseMinor?: bigint;
  reserveMinor?: bigint;
  highValuePercent?: number;
  highValueAmountMinor?: bigint | null;
  quarters?: [bigint, bigint, bigint, bigint] | null;
  reason?: string | null;
}

const toRecord = (row: Prisma.BudgetVersionGetPayload<object>): VersionRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  costCenterId: row.costCenterId,
  year: row.year,
  number: row.number,
  kind: row.kind,
  state: row.state,
  proposalId: row.proposalId,
  basedOnVersionId: row.basedOnVersionId,
  baseMinor: row.baseMinor,
  reserveMinor: row.reserveMinor,
  totalMinor: row.totalMinor,
  currency: row.currency,
  highValuePercent: row.highValuePercent,
  highValueAmountMinor: row.highValueAmountMinor,
  quarters:
    row.q1Minor === null || row.q2Minor === null || row.q3Minor === null || row.q4Minor === null
      ? null
      : [row.q1Minor, row.q2Minor, row.q3Minor, row.q4Minor],
  reason: row.reason,
  createdByEmployeeId: row.createdByEmployeeId,
  createdAt: row.createdAt,
  sentByEmployeeId: row.sentByEmployeeId,
  sentAt: row.sentAt,
  detachedAt: row.detachedAt,
  neverCurrent: row.neverCurrent,
  expiredAt: row.expiredAt,
  rejectedPredecessorId: row.rejectedPredecessorId,
});

const quarterColumns = (quarters: [bigint, bigint, bigint, bigint] | null) => ({
  q1Minor: quarters?.[0] ?? null,
  q2Minor: quarters?.[1] ?? null,
  q3Minor: quarters?.[2] ?? null,
  q4Minor: quarters?.[3] ?? null,
});

/**
 * The version that is the budget of a year as it is read: the current one, or the one that was current when the year ended
 * (the reference budget, `QĐ-91c`). A version that never became current is never read as the budget.
 */
export const REFERENCE_VERSION: Prisma.BudgetVersionWhereInput = {
  OR: [{ state: 'APPROVED' }, { state: 'EXPIRED', neverCurrent: false }],
};

export interface VersionFilter {
  costCenterIds?: readonly string[];
  state?: VersionState;
  /** Only the versions that are the budget of their year: current, or the reference budget of a year that ended. */
  referenceOnly?: boolean;
  year?: number;
  skip: number;
  take: number;
}

/** The one writer of `budget_versions`, their lines and the history of the lines, and their reads. */
@Injectable()
export class VersionRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The number the next version of the Cost Center and year takes, from the versions already there. */
  async nextNumber(tx: DbTx, costCenterId: string, year: number): Promise<number> {
    const last = await tx.budgetVersion.aggregate({ where: { costCenterId, year }, _max: { number: true } });

    return (last._max.number ?? 0) + 1;
  }

  async insert(tx: DbTx, input: NewVersion): Promise<string> {
    const number = await this.nextNumber(tx, input.costCenterId, input.year);
    const total = input.baseMinor + input.reserveMinor;
    const created = await tx.budgetVersion.create({
      data: {
        organizationId: input.organizationId,
        costCenterId: input.costCenterId,
        year: input.year,
        number,
        kind: input.kind,
        state: 'DRAFT',
        proposalId: input.proposalId,
        basedOnVersionId: input.basedOnVersionId,
        rejectedPredecessorId: input.rejectedPredecessorId ?? null,
        baseMinor: input.baseMinor,
        reserveMinor: input.reserveMinor,
        totalMinor: total,
        currency: input.currency,
        highValuePercent: input.highValuePercent,
        highValueAmountMinor: input.highValueAmountMinor,
        ...quarterColumns(input.quarters),
        reason: input.reason,
        createdByEmployeeId: input.createdByEmployeeId,
        createdAt: input.now,
        lines: { create: input.lines.map((line, index) => ({ position: index + 1, ...lineData(line) })) },
      },
      select: { id: true },
    });

    return created.id;
  }

  async findById(id: string, tx?: DbTx): Promise<VersionRecord | null> {
    const row = await (tx ?? this.prisma).budgetVersion.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /**
   * `FOR NO KEY UPDATE`, not `FOR UPDATE`: a commitment attached to the current version takes `FOR KEY SHARE` on its row through
   * the foreign key while it holds the budget year lock, and this lock is taken before that one, so a lock that conflicts with
   * `KEY SHARE` would wait for the year lock and the commitment would wait for the version in a circle. Two writers of a version
   * still queue: this mode conflicts with itself, and every change of a version is a change of a non-key column.
   */
  async lockById(tx: DbTx, id: string): Promise<VersionRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM budget_versions WHERE id = ${id}::uuid FOR NO KEY UPDATE`;

    return locked.length === 0 ? null : this.findById(id, tx);
  }

  /**
   * Locks every version the Cost Center has for the year, in the order of their ids, and reads them: what a decision or the
   * closure of the year changes more than one of, so that two of them never wait for each other's rows in a circle.
   */
  async lockAllOfYear(tx: DbTx, costCenterId: string, year: number): Promise<VersionRecord[]> {
    await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM budget_versions WHERE cost_center_id = ${costCenterId}::uuid AND year = ${year} ORDER BY id FOR NO KEY UPDATE`;
    const rows = await tx.budgetVersion.findMany({ where: { costCenterId, year }, orderBy: { id: 'asc' } });

    return rows.map(toRecord);
  }

  /** Every version that was sent and waits for a decision, in the order of their ids (what a stretch of waiting for the approver tells). */
  async sentOnes(tx: DbTx): Promise<VersionRecord[]> {
    const rows = await tx.budgetVersion.findMany({ where: { state: 'SENT' }, orderBy: { id: 'asc' } });

    return rows.map(toRecord);
  }

  /** The ids of every version the Cost Center has for the year, whatever their state. */
  async idsOf(tx: DbTx, costCenterId: string, year: number): Promise<string[]> {
    const rows = await tx.budgetVersion.findMany({ where: { costCenterId, year }, select: { id: true } });

    return rows.map((row) => row.id);
  }

  /** Whether any version of any Cost Center and year exists, in whatever state: what locks the month the fiscal year begins. */
  async anyExists(tx: DbTx): Promise<boolean> {
    return (await tx.budgetVersion.findFirst({ select: { id: true } })) !== null;
  }

  /** The current version of the Cost Center and year, if any: at most one (INV-21). */
  async current(costCenterId: string, year: number, tx?: DbTx): Promise<VersionRecord | null> {
    const row = await (tx ?? this.prisma).budgetVersion.findFirst({ where: { costCenterId, year, state: 'APPROVED' } });

    return row ? toRecord(row) : null;
  }

  /** The budget of the year as it is read: the current version, or the reference budget of a year that ended (F62). */
  async reference(costCenterId: string, year: number, tx?: DbTx): Promise<VersionRecord | null> {
    const row = await (tx ?? this.prisma).budgetVersion.findFirst({
      where: { costCenterId, year, ...REFERENCE_VERSION },
      orderBy: { number: 'desc' },
    });

    return row ? toRecord(row) : null;
  }

  /**
   * The version of the Cost Center and year that is being built or waits for a decision, if any. A draft that a withdrawn or
   * given-back proposal left behind is detached and does not count (F36).
   */
  async inFlight(costCenterId: string, year: number, tx?: DbTx): Promise<VersionRecord | null> {
    const row = await (tx ?? this.prisma).budgetVersion.findFirst({
      where: { costCenterId, year, state: { in: ['DRAFT', 'SENT', 'CHANGES_REQUESTED'] }, detachedAt: null },
    });

    return row ? toRecord(row) : null;
  }

  /** The newest version made from the proposal, whatever its state: what says whether the proposal can be followed (F63). */
  async latestOfProposal(proposalId: string, tx?: DbTx): Promise<VersionRecord | null> {
    const row = await (tx ?? this.prisma).budgetVersion.findFirst({
      where: { proposalId },
      orderBy: { number: 'desc' },
    });

    return row ? toRecord(row) : null;
  }

  async page(filter: VersionFilter): Promise<{ items: VersionRecord[]; total: number }> {
    const where: Prisma.BudgetVersionWhereInput = {
      ...(filter.costCenterIds ? { costCenterId: { in: [...filter.costCenterIds] } } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.referenceOnly ? REFERENCE_VERSION : {}),
      ...(filter.year ? { year: filter.year } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.budgetVersion.findMany({
        where,
        orderBy: [{ year: 'desc' }, { costCenterId: 'asc' }, { number: 'desc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.budgetVersion.count({ where }),
    ]);

    return { items: rows.map(toRecord), total };
  }

  async patch(tx: DbTx, id: string, patch: VersionPatch): Promise<void> {
    const base = patch.baseMinor;
    const reserve = patch.reserveMinor;
    const current = await tx.budgetVersion.findUniqueOrThrow({
      where: { id },
      select: { baseMinor: true, reserveMinor: true },
    });
    const nextBase = base ?? current.baseMinor;
    const nextReserve = reserve ?? current.reserveMinor;
    await tx.budgetVersion.update({
      where: { id },
      data: {
        baseMinor: nextBase,
        reserveMinor: nextReserve,
        totalMinor: nextBase + nextReserve,
        ...(patch.highValuePercent !== undefined ? { highValuePercent: patch.highValuePercent } : {}),
        ...(patch.highValueAmountMinor !== undefined ? { highValueAmountMinor: patch.highValueAmountMinor } : {}),
        ...(patch.quarters !== undefined ? quarterColumns(patch.quarters) : {}),
        ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
      },
    });
  }

  async setState(tx: DbTx, id: string, state: VersionState): Promise<void> {
    await tx.budgetVersion.update({ where: { id }, data: { state } });
  }

  /**
   * Closes the version with its fiscal year (`QĐ-91c`): the current one stays the reference budget of the year, one that never
   * became current says so. Only the closure of the year writes this, in the transaction of its Cost Center and year.
   */
  async expire(tx: DbTx, id: string, input: { neverCurrent: boolean; now: Date }): Promise<void> {
    await tx.budgetVersion.update({
      where: { id },
      data: { state: 'EXPIRED', neverCurrent: input.neverCurrent, expiredAt: input.now },
    });
  }

  /** The Cost Centers and years before `fiscalYear` that still hold a version the closure of the year changes. */
  async endedYearsToClose(fiscalYear: number): Promise<{ costCenterId: string; year: number }[]> {
    return this.prisma.budgetVersion.findMany({
      where: { year: { lt: fiscalYear }, state: { in: ['DRAFT', 'SENT', 'CHANGES_REQUESTED', 'APPROVED'] } },
      distinct: ['costCenterId', 'year'],
      select: { costCenterId: true, year: true },
      orderBy: [{ year: 'asc' }, { costCenterId: 'asc' }],
    });
  }

  /**
   * Marks the drafts of a proposal that was withdrawn or given back as detached from it (F36, `QĐ-91a`): they stay `DRAFT`, are
   * not deleted, and are written in the transaction of the withdrawal or of the return.
   */
  async detachDraftsOf(tx: DbTx, proposalId: string, now: Date): Promise<number> {
    const { count } = await tx.budgetVersion.updateMany({
      where: { proposalId, state: 'DRAFT', detachedAt: null },
      data: { detachedAt: now },
    });

    return count;
  }

  /** The total of each of these versions, for the views that say what a revision changes. */
  async totalsOf(ids: readonly string[]): Promise<Map<string, bigint>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.budgetVersion.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, totalMinor: true },
    });

    return new Map(rows.map((row) => [row.id, row.totalMinor]));
  }

  /** The newest version of the Cost Center and year that is read as its budget or is not closed: what the head is told of. */
  async latestOf(costCenterId: string, year: number): Promise<VersionRecord | null> {
    const row = await this.prisma.budgetVersion.findFirst({
      where: { costCenterId, year, neverCurrent: false },
      orderBy: { number: 'desc' },
    });

    return row ? toRecord(row) : null;
  }

  async setSent(tx: DbTx, id: string, byEmployeeId: string, now: Date): Promise<void> {
    await tx.budgetVersion.update({
      where: { id },
      data: { state: 'SENT', sentByEmployeeId: byEmployeeId, sentAt: now },
    });
  }
}
