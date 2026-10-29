import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { PlanLineFacts, PlanLineSummary, YearBudgetFacts } from '../public/budgets.types';
import { CommitmentRepo, heldKey } from './commitment.repo';
import { REFERENCE_VERSION } from './version.repo';

/**
 * What the check of a request reads of the budgets (`US-06-12`): the current budget of a Cost Center and year with what is
 * held and spent against it, and the purchase window of a plan line. It writes nothing and takes the transaction of the
 * caller so that a check and the decision it follows see the same data; the facade `budgets.service.ts` is how another
 * context reaches it. The budget of a year that has ended is the reference budget, the version that was current when the year
 * closed; a version that never became current is never read as a budget (F62, `QĐ-91c`).
 */
@Injectable()
export class BudgetFactsRepo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commitments: CommitmentRepo,
  ) {}

  /** The current budget of each of the years; a year without one is absent from the map, which is not a budget of nothing. */
  async yearFacts(costCenterId: string, years: readonly number[], tx?: DbTx): Promise<Map<number, YearBudgetFacts>> {
    const facts = new Map<number, YearBudgetFacts>();
    if (years.length === 0) return facts;
    const db = tx ?? this.prisma;
    const versions = await db.budgetVersion.findMany({
      where: { costCenterId, year: { in: [...years] }, ...REFERENCE_VERSION },
    });
    const totals = await this.commitments.totals(
      versions.map((version) => ({ costCenterId, year: version.year })),
      tx,
    );
    for (const version of versions) {
      const held = totals.get(heldKey(costCenterId, version.year));
      facts.set(version.year, {
        versionId: version.id,
        currency: version.currency,
        totalMinor: version.totalMinor,
        heldMinor: held?.held ?? 0n,
        spentMinor: held?.spent ?? 0n,
        highValuePercent: version.highValuePercent,
        highValueAmountMinor: version.highValueAmountMinor,
      });
    }

    return facts;
  }

  /**
   * The line a request names, read from the current version of its Cost Center and year: a revision keeps the lines of the
   * budget it changes in the same order, so the position still finds the line. Null when the line is not there.
   */
  async planLine(versionId: string, position: number, tx?: DbTx): Promise<PlanLineFacts | null> {
    const db = tx ?? this.prisma;
    const named = await db.budgetVersion.findUnique({
      where: { id: versionId },
      select: { costCenterId: true, year: true },
    });
    if (!named) return null;
    const current = await db.budgetVersion.findFirst({
      where: { costCenterId: named.costCenterId, year: named.year, ...REFERENCE_VERSION },
      select: { id: true },
    });
    if (!current) return null;
    const line = await db.budgetVersionLine.findUnique({
      where: { versionId_position: { versionId: current.id, position } },
      select: { windowFrom: true, windowTo: true },
    });
    if (!line) return null;

    return {
      costCenterId: named.costCenterId,
      year: named.year,
      versionId: current.id,
      windowFrom: fromDateColumn(line.windowFrom),
      windowTo: fromDateColumn(line.windowTo),
    };
  }

  /** The line at the position in the current version of the Cost Center and year; null when there is none. */
  async currentLine(costCenterId: string, year: number, position: number, tx?: DbTx): Promise<PlanLineFacts | null> {
    const db = tx ?? this.prisma;
    const current = await db.budgetVersion.findFirst({
      where: { costCenterId, year, ...REFERENCE_VERSION },
      select: { id: true },
    });
    if (!current) return null;
    const line = await db.budgetVersionLine.findUnique({
      where: { versionId_position: { versionId: current.id, position } },
      select: { windowFrom: true, windowTo: true },
    });
    if (!line) return null;

    return {
      costCenterId,
      year,
      versionId: current.id,
      windowFrom: fromDateColumn(line.windowFrom),
      windowTo: fromDateColumn(line.windowTo),
    };
  }

  /** One page of the lines of the current version of the Cost Center and year, in order; null when the year has no budget. */
  async currentLines(
    costCenterId: string,
    year: number,
    skip: number,
    take: number,
    tx?: DbTx,
  ): Promise<{ currency: string; items: PlanLineSummary[]; total: number } | null> {
    const db = tx ?? this.prisma;
    const current = await db.budgetVersion.findFirst({
      where: { costCenterId, year, ...REFERENCE_VERSION },
      select: { id: true, currency: true },
    });
    if (!current) return null;
    const [rows, total] = await Promise.all([
      db.budgetVersionLine.findMany({ where: { versionId: current.id }, orderBy: { position: 'asc' }, skip, take }),
      db.budgetVersionLine.count({ where: { versionId: current.id } }),
    ]);

    return {
      currency: current.currency,
      total,
      items: rows.map((row) => ({
        position: row.position,
        description: row.description,
        planId: row.planId,
        amountMinor: row.amountMinor,
        windowFrom: fromDateColumn(row.windowFrom),
        windowTo: fromDateColumn(row.windowTo),
      })),
    };
  }
}
