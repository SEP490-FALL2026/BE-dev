import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { YearBudgetFacts } from '../public/budgets.types';
import { adjustmentDeltasOf } from './budget.policy';
import { CommitmentRepo, heldKey } from './commitment.repo';
import { REFERENCE_VERSION } from './version.repo';

/**
 * What the check of a request reads of the budgets (`US-06-12`): the current budget of a Cost Center and year with what is
 * held and spent against it, and the purchase window of a plan line. It writes nothing and takes the transaction of the
 * caller so that a check and the decision it follows see the same data; the facade `budgets.service.ts` is how another
 * context reaches it. The budget of a year that has ended is the reference budget, the version that was current when the year
 * closed; a version that never became current is never read as a budget (`QĐ-91c`).
 *
 * The budget a request is checked against is the EFFECTIVE one (`AD-1`, `QĐ-111bh`): the base of that version plus the adjustments approved for the Cost Center and year
 * (what it received less what it gave), the reserve as it is. The version stays as the starting point; `approvedOfYear`, `approvedOfCostCenters` and `yearFacts` all give the
 * effective base, so a review, a reminder and the check read the same figure.
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
      const deltas = await this.deltasOf(db, version.year, [costCenterId], new Map([[costCenterId, version.id]]));
      const adjustmentMinor = deltas.get(costCenterId) ?? 0n;
      facts.set(version.year, {
        versionId: version.id,
        currency: version.currency,
        totalMinor: version.totalMinor + adjustmentMinor,
        baseMinor: version.baseMinor + adjustmentMinor,
        reserveMinor: version.reserveMinor,
        versionBaseMinor: version.baseMinor,
        adjustmentMinor,
        heldMinor: held?.held ?? 0n,
        spentMinor: held?.spent ?? 0n,
      });
    }

    return facts;
  }

  /**
   * The effective budget of every Cost Center that has one for the year, the newest version of each: the Cost Centers a review of the year closes its month for
   * (`RV-1`). A Cost Center with none has nothing to compare, so it has no light and is absent.
   */
  async approvedOfYear(year: number, tx?: DbTx): Promise<Map<string, EffectiveBudget>> {
    return this.effectiveOf({ year, ...REFERENCE_VERSION }, year, tx);
  }

  /**
   * The effective budget (base with the adjustments, the reserve, the currency it is kept in) of one year in each of the Cost Centers, in one statement; a Cost
   * Center with none is absent from the map, which is not a budget of nothing. What a notice about the year after reads (`QĐ-111al`).
   */
  async approvedOfCostCenters(
    costCenterIds: readonly string[],
    year: number,
    tx?: DbTx,
  ): Promise<Map<string, EffectiveBudget>> {
    if (costCenterIds.length === 0) return new Map();

    return this.effectiveOf(
      { costCenterId: { in: [...new Set(costCenterIds)] }, year, ...REFERENCE_VERSION },
      year,
      tx,
    );
  }

  /**
   * What the Cost Centers of the organization hold of the year, base and reserve with the adjustments: the newest version of each that is sent, sent back or
   * approved (the same ones the annual ceiling is checked on when a version is sent), the approved ones with what was adjusted. What is left of the ceiling is
   * the ceiling less the reserve of the shared pool less this (`R-36`).
   */
  async allocatedOfYear(organizationId: string, year: number, tx?: DbTx): Promise<bigint> {
    const db = tx ?? this.prisma;
    const rows = await db.budgetVersion.findMany({
      where: { organizationId, year, state: { in: ['SENT', 'CHANGES_REQUESTED', 'APPROVED'] }, detachedAt: null },
      orderBy: [{ costCenterId: 'asc' }, { number: 'desc' }],
    });
    const newest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!newest.has(row.costCenterId)) newest.set(row.costCenterId, row);
    const approved = new Map<string, string>();
    for (const [costCenterId, row] of newest) if (row.state === 'APPROVED') approved.set(costCenterId, row.id);
    const deltas = await this.deltasOf(db, year, undefined, approved);
    let total = 0n;
    for (const [costCenterId, row] of newest) total += row.totalMinor + (deltas.get(costCenterId) ?? 0n);

    return total;
  }

  private async effectiveOf(
    where: Prisma.BudgetVersionWhereInput,
    year: number,
    tx?: DbTx,
  ): Promise<Map<string, EffectiveBudget>> {
    const db = tx ?? this.prisma;
    const versions = await db.budgetVersion.findMany({ where, orderBy: [{ costCenterId: 'asc' }, { number: 'desc' }] });
    const newest = new Map<string, (typeof versions)[number]>();
    for (const version of versions) if (!newest.has(version.costCenterId)) newest.set(version.costCenterId, version);
    const versionIdOf = new Map<string, string>();
    for (const [costCenterId, version] of newest) versionIdOf.set(costCenterId, version.id);
    const deltas = await this.deltasOf(db, year, [...newest.keys()], versionIdOf);
    const budgets = new Map<string, EffectiveBudget>();
    for (const [costCenterId, version] of newest) {
      const adjustmentMinor = deltas.get(costCenterId) ?? 0n;
      budgets.set(costCenterId, {
        versionId: version.id,
        currency: version.currency,
        baseMinor: version.baseMinor + adjustmentMinor,
        reserveMinor: version.reserveMinor,
        adjustmentMinor,
      });
    }

    return budgets;
  }

  /** What the approved adjustments of the year add to the base of the Cost Centers (all of them when none is named), given the version each reads as its budget. */
  private async deltasOf(
    db: DbTx | PrismaService,
    year: number,
    costCenterIds: readonly string[] | undefined,
    versionIdOf: ReadonlyMap<string, string>,
  ): Promise<Map<string, bigint>> {
    if (versionIdOf.size === 0) return new Map();
    const named = costCenterIds === undefined ? undefined : [...costCenterIds];
    const rows = await db.budgetAdjustment.findMany({
      where: {
        year,
        state: 'APPROVED',
        ...(named === undefined
          ? {}
          : { OR: [{ fromCostCenterId: { in: named } }, { toCostCenterId: { in: named } }] }),
      },
      select: { fromCostCenterId: true, toCostCenterId: true, amountMinor: true, createdVersionId: true },
    });

    return adjustmentDeltasOf(rows, versionIdOf);
  }
}

/** The budget of a Cost Center and year as it is read: the base with what the adjustments added to it, and the reserve. */
export interface EffectiveBudget {
  versionId: string;
  currency: string;
  /** The base of the version plus `adjustmentMinor`. */
  baseMinor: bigint;
  reserveMinor: bigint;
  /** What the approved adjustments added to (positive) or took from (negative) the base of the version. */
  adjustmentMinor: bigint;
}
