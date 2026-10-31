import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CommitmentHoldInput, CommitmentReleaseReason, HeldCommitment } from '../public/budgets.types';
import { BudgetYearLockRepo } from './budget-year-lock.repo';
import type { CommitmentRow } from './commitment-release.policy';

export interface AttachedCommitment {
  id: string;
  requestId: string;
  amountMinor: bigint;
  currency: string;
}

/**
 * The commitments of the budget, as far as the decision of a version needs them: attaching the ones that wait for a budget
 * and adding up what is held. It is the only code that writes `budget_commitments`; the slices that create and release them
 * extend it.
 */
@Injectable()
export class CommitmentRepo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly yearLock: BudgetYearLockRepo,
  ) {}

  /**
   * Attaches to `versionId` the commitments of the Cost Center and the year that wait for a budget (US-06-07 AC-3). Only
   * that Cost Center and that year: a commitment of another year is never attached by the budget of this one (AC-4).
   */
  async attachWaiting(
    tx: DbTx,
    input: { costCenterId: string; year: number; versionId: string; now: Date },
  ): Promise<AttachedCommitment[]> {
    const waiting = await tx.budgetCommitment.findMany({
      where: { costCenterId: input.costCenterId, year: input.year, state: 'HELD', attachedVersionId: null },
      select: { id: true, requestId: true, amountMinor: true, currency: true },
      orderBy: { createdAt: 'asc' },
    });
    if (waiting.length === 0) return [];

    await tx.budgetCommitment.updateMany({
      where: { id: { in: waiting.map((commitment) => commitment.id) } },
      data: { attachedVersionId: input.versionId, attachedAt: input.now, unattachedReason: null },
    });

    return waiting;
  }

  /**
   * Holds the amount of each year for the request, one commitment for each year (`INV-16`): attached to the current budget of
   * the year when there is one, and waiting for one with the reason *no budget* when there is not (`US-06-07` AC-1). The
   * database refuses a second commitment for the same request and year.
   *
   * The budget of each Cost Center and year is locked first, the earliest year first, after the row of the request the caller
   * holds: what the decision of a version attaches and what is held here never read the current budget at the same moment,
   * so a commitment never waits for a budget that was approved while it was being made.
   */
  async hold(tx: DbTx, input: CommitmentHoldInput): Promise<HeldCommitment[]> {
    await this.yearLock.lock(
      tx,
      input.costCenterId,
      input.items.map((item) => item.year),
    );
    const held: HeldCommitment[] = [];
    for (const item of input.items) {
      const current = await tx.budgetVersion.findFirst({
        where: { costCenterId: input.costCenterId, year: item.year, state: 'APPROVED' },
        select: { id: true },
      });
      const created = await tx.budgetCommitment.create({
        data: {
          organizationId: input.organizationId,
          requestId: input.requestId,
          costCenterId: input.costCenterId,
          year: item.year,
          amountMinor: item.amountMinor,
          currency: input.currency,
          state: 'HELD',
          attachedVersionId: current?.id ?? null,
          attachedAt: current ? input.now : null,
          unattachedReason: current ? null : 'NO_BUDGET',
          snapshotCheckId: input.snapshotCheckId,
        },
        select: { id: true },
      });
      held.push({
        id: created.id,
        year: item.year,
        amountMinor: item.amountMinor,
        attachedVersionId: current?.id ?? null,
      });
    }

    return held;
  }

  /** The commitments of the request, whatever became of them, the oldest year first. */
  async ofRequest(tx: DbTx, requestId: string): Promise<CommitmentOfRequest[]> {
    const rows = await tx.budgetCommitment.findMany({ where: { requestId }, orderBy: { year: 'asc' } });

    return rows.map((row) => ({
      id: row.id,
      year: row.year,
      amountMinor: row.amountMinor,
      releasedMinor: row.releasedMinor,
      state: row.state,
      organizationId: row.organizationId,
      costCenterId: row.costCenterId,
    }));
  }

  /** One commitment with its row locked, so that two releases of it queue. */
  async lockById(tx: DbTx, id: string): Promise<(CommitmentOfRequest & { requestId: string }) | null> {
    const found = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM budget_commitments WHERE id = ${id}::uuid FOR UPDATE`;
    if (found.length === 0) return null;
    const row = await tx.budgetCommitment.findUnique({ where: { id } });
    if (!row) return null;

    return {
      id: row.id,
      requestId: row.requestId,
      year: row.year,
      amountMinor: row.amountMinor,
      releasedMinor: row.releasedMinor,
      state: row.state,
      organizationId: row.organizationId,
      costCenterId: row.costCenterId,
    };
  }

  /**
   * Takes `takeMinor` back to the budget and writes it in the ledger. The commitment is released when none is left. The row is
   * changed only if it is still as it was read, so a release that lost a race is told and writes nothing.
   */
  async release(
    tx: DbTx,
    row: CommitmentRow,
    input: {
      takeMinor: bigint;
      reason: CommitmentReleaseReason | 'REMAINDER';
      reasonText: string | null;
      releasedByEmployeeId: string | null;
      now: Date;
    },
  ): Promise<{ released: boolean; heldMinor: bigint }> {
    const releasedMinor = row.releasedMinor + input.takeMinor;
    const released = releasedMinor === row.amountMinor;
    const changed = await tx.budgetCommitment.updateMany({
      where: { id: row.id, state: 'HELD', releasedMinor: row.releasedMinor },
      data: { releasedMinor, ...(released ? { state: 'RELEASED' as const, releasedAt: input.now } : {}) },
    });
    if (changed.count !== 1) throw new Error(`The commitment ${row.id} changed while it was being released.`);
    await tx.budgetCommitmentRelease.create({
      data: {
        commitmentId: row.id,
        amountMinor: input.takeMinor,
        reason: input.reason,
        reasonText: input.reasonText,
        releasedByEmployeeId: input.releasedByEmployeeId,
        releasedAt: input.now,
      },
    });

    return { released, heldMinor: row.amountMinor - releasedMinor };
  }

  /** What went back to the budget from one commitment, the oldest first. */
  async pageReleases(commitmentId: string, skip: number, take: number) {
    const where = { commitmentId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.budgetCommitmentRelease.findMany({
        where,
        orderBy: [{ releasedAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.budgetCommitmentRelease.count({ where }),
    ]);

    return { rows, total };
  }

  async exists(id: string): Promise<boolean> {
    return (await this.prisma.budgetCommitment.count({ where: { id } })) > 0;
  }

  /** The years the request already holds a commitment for, among the years asked about. */
  async yearsHeldBy(tx: DbTx, requestId: string, years: readonly number[]): Promise<number[]> {
    const rows = await tx.budgetCommitment.findMany({
      where: { requestId, year: { in: [...years] } },
      select: { year: true },
      orderBy: { year: 'asc' },
    });

    return rows.map((row) => row.year);
  }

  /** Whether the request holds any commitment: Finance reads such a request from the commitment (`US-06-09` AC-2). */
  async existsFor(requestId: string): Promise<boolean> {
    return (await this.prisma.budgetCommitment.count({ where: { requestId } })) > 0;
  }

  /** One page of the commitments, the newest first; `attached` narrows to the ones attached to a budget or waiting for one. */
  async page(filter: {
    id?: string;
    attached?: boolean;
    year?: number;
    costCenterId?: string;
    requestId?: string;
    skip: number;
    take: number;
  }) {
    const where = {
      ...(filter.attached === undefined ? {} : { attachedVersionId: filter.attached ? { not: null } : null }),
      ...(filter.year ? { year: filter.year } : {}),
      ...(filter.costCenterId ? { costCenterId: filter.costCenterId } : {}),
      ...(filter.requestId ? { requestId: filter.requestId } : {}),
      ...(filter.id ? { id: filter.id } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.budgetCommitment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.budgetCommitment.count({ where }),
    ]);

    return { rows, total };
  }

  /**
   * What is held against the budget of each Cost Center and year and what has become an expense, from the commitments that
   * are attached to it. A commitment is one or the other, never both, so the spend is not counted twice (`FR-5.8`).
   */
  async totals(
    pairs: readonly { costCenterId: string; year: number }[],
    tx?: DbTx,
  ): Promise<Map<string, CommitmentTotals>> {
    const totals = new Map<string, CommitmentTotals>();
    if (pairs.length === 0) return totals;
    const groups = await (tx ?? this.prisma).budgetCommitment.groupBy({
      by: ['costCenterId', 'year', 'state'],
      where: {
        state: { in: ['HELD', 'EXPENSED'] },
        attachedVersionId: { not: null },
        OR: pairs.map((pair) => ({ costCenterId: pair.costCenterId, year: pair.year })),
      },
      _sum: { amountMinor: true, releasedMinor: true },
    });
    for (const group of groups) {
      const key = heldKey(group.costCenterId, group.year);
      const entry = totals.get(key) ?? { held: 0n, spent: 0n };
      // What went back to the budget is not held any more.
      const amount = (group._sum.amountMinor ?? 0n) - (group._sum.releasedMinor ?? 0n);
      if (group.state === 'HELD') entry.held += amount;
      else entry.spent += amount;
      totals.set(key, entry);
    }

    return totals;
  }

  /**
   * The first `limit` commitments of the Cost Center that are still held, by id, and how many there are: a Cost Center with one
   * cannot be retired (`QĐ-87d(2)`). A commitment is held until nothing of it is left; one that became an expense or was released
   * keeps nothing in use.
   */
  async heldOn(
    costCenterId: string,
    limit: number,
    tx?: DbTx,
  ): Promise<{ rows: { id: string; year: number }[]; total: number }> {
    const db = tx ?? this.prisma;
    const where = { costCenterId, state: 'HELD' as const };
    const rows = await db.budgetCommitment.findMany({
      where,
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true, year: true },
    });

    return { rows, total: await db.budgetCommitment.count({ where }) };
  }
}

export interface CommitmentOfRequest extends CommitmentRow {
  organizationId: string;
  costCenterId: string;
}

/** What a commitment total says about the budget of a Cost Center and year. */
export interface CommitmentTotals {
  held: bigint;
  spent: bigint;
}

export const heldKey = (costCenterId: string, year: number): string => `${costCenterId}:${year}`;
