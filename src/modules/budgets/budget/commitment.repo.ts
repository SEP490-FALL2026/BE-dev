import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  CommittedAmount,
  CommitmentHoldInput,
  CommitmentReleaseReason,
  HeldCommitment,
} from '../public/budgets.types';
import { BudgetCommitmentNotHoldableError } from './budget.errors';
import { BudgetYearLockRepo } from './budget-year-lock.repo';
import { InvoiceRepo } from './invoice.repo';
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
    private readonly invoices: InvoiceRepo,
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

    // Only a commitment that is still held is attached, and only the ones attached are told: an invoice may have made one an
    // expense since it was read, and an expense is never changed again.
    const attached = await tx.budgetCommitment.updateManyAndReturn({
      where: { id: { in: waiting.map((commitment) => commitment.id) }, state: 'HELD', attachedVersionId: null },
      data: { attachedVersionId: input.versionId, attachedAt: input.now, unattachedReason: null },
      select: { id: true, requestId: true, amountMinor: true, currency: true, createdAt: true },
    });

    return attached
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .map(({ id, requestId, amountMinor, currency }) => ({ id, requestId, amountMinor, currency }));
  }

  /**
   * Holds the amount of each year for the request, one commitment for each year (`INV-16`), attached to the approved version of the
   * year; with no version it refuses (`BudgetCommitmentNotHoldableError`), unless the caller is the one that makes the commitment on 01/01
   * (`allowUnattached`), which waits for a budget with the reason *no budget* (`US-06-07` AC-1). The database refuses a second commitment
   * for the same request and year.
   *
   * The budget of each Cost Center and year is locked first, the earliest year first, after the row of the request the caller
   * holds: what the decision of a version attaches and what is held here never read the current budget at the same moment,
   * so a commitment never waits for a budget that was approved while it was being made.
   */
  async hold(
    tx: DbTx,
    input: CommitmentHoldInput,
    options: { allowUnattached: boolean } = { allowUnattached: false },
  ): Promise<HeldCommitment[]> {
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
      // No commitment is made without an approved version of the year (`FR-5.8a`), but the one made on 01/01 (`allowUnattached`).
      if (!current && !options.allowUnattached)
        throw new BudgetCommitmentNotHoldableError('NO_APPROVED_BUDGET', item.year);
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

  /**
   * The commitments of the request, whatever became of them, the oldest year first, with their rows locked in that order: a
   * release queues behind an invoice that is being recorded on one of them and reads it as it stands then, and two releases of the
   * same request queue the same way. An invoice takes no other lock than its own commitment, so no circle is made with the year.
   */
  async lockOfRequest(tx: DbTx, requestId: string): Promise<CommitmentOfRequest[]> {
    await tx.$queryRaw`SELECT id FROM budget_commitments WHERE request_id = ${requestId}::uuid ORDER BY year FOR UPDATE`;
    const rows = await tx.budgetCommitment.findMany({ where: { requestId }, orderBy: { year: 'asc' } });

    return rows.map((row) => ({
      id: row.id,
      year: row.year,
      amountMinor: row.amountMinor,
      releasedMinor: row.releasedMinor,
      appliedMinor: row.appliedMinor,
      state: row.state,
      organizationId: row.organizationId,
      costCenterId: row.costCenterId,
    }));
  }

  /** The requests, among these, that hold a commitment for the year already, whatever its state: one request holds one for a year (`INV-16`). */
  async requestsHoldingYear(tx: DbTx, requestIds: readonly string[], year: number): Promise<Set<string>> {
    if (requestIds.length === 0) return new Set();
    const rows = await tx.budgetCommitment.findMany({
      where: { requestId: { in: [...requestIds] }, year },
      select: { requestId: true },
    });

    return new Set(rows.map((row) => row.requestId));
  }

  /**
   * Holds the commitment of 01/01 of one request for the year (`FR-5.8`(6)): attached to the approved version of the Cost Center and year when there
   * is one, waiting for a budget with the reason *no budget* when there is not (`FR-5.8a`, the one exception), never backed by a check. The
   * lock of the Cost Center and year comes first, as in `hold`, so a version approved at the same moment either attaches it or is read here.
   * Null, with nothing written, when the approved version is in another currency than the amount: the totals of a budget never add two.
   */
  async holdYearStart(
    tx: DbTx,
    input: {
      organizationId: string;
      requestId: string;
      costCenterId: string;
      year: number;
      amountMinor: bigint;
      currency: string;
      seatMonthlyMinor: bigint;
      now: Date;
    },
  ): Promise<(HeldCommitment & { costCenterId: string }) | null> {
    await this.yearLock.lock(tx, input.costCenterId, [input.year]);
    const current = await tx.budgetVersion.findFirst({
      where: { costCenterId: input.costCenterId, year: input.year, state: 'APPROVED' },
      select: { id: true, currency: true },
    });
    if (current && current.currency !== input.currency) return null;
    const created = await tx.budgetCommitment.create({
      data: {
        organizationId: input.organizationId,
        requestId: input.requestId,
        costCenterId: input.costCenterId,
        year: input.year,
        amountMinor: input.amountMinor,
        currency: input.currency,
        state: 'HELD',
        origin: 'YEAR_START',
        seatMonthlyMinor: input.seatMonthlyMinor,
        attachedVersionId: current?.id ?? null,
        attachedAt: current ? input.now : null,
        unattachedReason: current ? null : 'NO_BUDGET',
        snapshotCheckId: null,
      },
      select: { id: true },
    });

    return {
      id: created.id,
      year: input.year,
      amountMinor: input.amountMinor,
      attachedVersionId: current?.id ?? null,
      costCenterId: input.costCenterId,
    };
  }

  /** One commitment with its row locked, so that two releases of it queue. */
  async lockById(
    tx: DbTx,
    id: string,
  ): Promise<(CommitmentOfRequest & { requestId: string; currency: string }) | null> {
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
      appliedMinor: row.appliedMinor,
      currency: row.currency,
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
    const heldMinor = row.amountMinor - releasedMinor - row.appliedMinor;
    // Nothing is left to hold: the commitment is released when none of it became an expense, and an expense when some of it did.
    const released = heldMinor === 0n;
    const data: Prisma.BudgetCommitmentUpdateManyMutationInput = { releasedMinor };
    if (released && row.appliedMinor === 0n) {
      data.state = 'RELEASED';
      data.releasedAt = input.now;
    } else if (released) {
      data.state = 'EXPENSED';
    }
    // The row is changed only if it is still as it was read, in what went back and in what became an expense.
    const changed = await tx.budgetCommitment.updateMany({
      where: { id: row.id, state: 'HELD', releasedMinor: row.releasedMinor, appliedMinor: row.appliedMinor },
      data,
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

    return { released, heldMinor };
  }

  /**
   * Takes the commitment down by what an invoice applied and, when nothing is left to hold, makes it an expense. The row is changed
   * only if it is still as it was read: the caller holds its lock, so this only refuses a writer that did not take it.
   */
  async applyInvoice(
    tx: DbTx,
    row: CommitmentRow,
    plan: { takeMinor: bigint; stateAfter: 'HELD' | 'EXPENSED' },
  ): Promise<void> {
    if (plan.takeMinor === 0n) return;
    const changed = await tx.budgetCommitment.updateMany({
      where: { id: row.id, state: 'HELD', releasedMinor: row.releasedMinor, appliedMinor: row.appliedMinor },
      data: {
        appliedMinor: row.appliedMinor + plan.takeMinor,
        ...(plan.stateAfter === 'EXPENSED' ? { state: 'EXPENSED' as const } : {}),
      },
    });
    if (changed.count !== 1) throw new Error(`The commitment ${row.id} changed while an invoice was applied to it.`);
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

  /** What each of the requests was committed for, one entry for each commitment, in one read. */
  async amountsOfRequests(requestIds: readonly string[]): Promise<CommittedAmount[]> {
    if (requestIds.length === 0) return [];

    return this.prisma.budgetCommitment.findMany({
      where: { requestId: { in: [...requestIds] } },
      select: { requestId: true, amountMinor: true, currency: true },
      orderBy: [{ requestId: 'asc' }, { year: 'asc' }],
    });
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
    state?: 'HELD' | 'RELEASED' | 'EXPENSED';
    skip: number;
    take: number;
  }) {
    const where = {
      ...(filter.state ? { state: filter.state } : {}),
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
   * What is held against the budget of each Cost Center and year and what has become an expense. Held is what the commitments
   * attached to the budget still hold, less what went back and less what became an expense. Spent is what the invoices cost, as
   * recorded against the commitments of that Cost Center and year, attached to a budget or not: an invoice that came before the
   * budget of its year is an expense of that year all the same. A commitment is held or an expense, never both for the same
   * money, so the spend is not counted twice (`FR-5.8`).
   */
  async totals(
    pairs: readonly { costCenterId: string; year: number }[],
    tx?: DbTx,
    includeUnattached = false,
  ): Promise<Map<string, CommitmentTotals>> {
    const totals = new Map<string, CommitmentTotals>();
    if (pairs.length === 0) return totals;
    const entry = (key: string): CommitmentTotals => {
      const found = totals.get(key) ?? { held: 0n, spent: 0n };
      totals.set(key, found);

      return found;
    };
    const groups = await (tx ?? this.prisma).budgetCommitment.groupBy({
      by: ['costCenterId', 'year'],
      where: {
        state: 'HELD',
        ...(includeUnattached ? {} : { attachedVersionId: { not: null } }),
        OR: pairs.map((pair) => ({ costCenterId: pair.costCenterId, year: pair.year })),
      },
      _sum: { amountMinor: true, releasedMinor: true, appliedMinor: true },
    });
    for (const group of groups) {
      entry(heldKey(group.costCenterId, group.year)).held +=
        (group._sum.amountMinor ?? 0n) - (group._sum.releasedMinor ?? 0n) - (group._sum.appliedMinor ?? 0n);
    }
    for (const [key, spent] of await this.invoices.spentOf(pairs, tx)) entry(key).spent += spent;

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
