import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { YearBudgetFacts } from '../public/budgets.types';
import { CommitmentRepo, heldKey } from './commitment.repo';
import { REFERENCE_VERSION } from './version.repo';

/**
 * What the check of a request reads of the budgets (`US-06-12`): the current budget of a Cost Center and year with what is
 * held and spent against it, and the purchase window of a plan line. It writes nothing and takes the transaction of the
 * caller so that a check and the decision it follows see the same data; the facade `budgets.service.ts` is how another
 * context reaches it. The budget of a year that has ended is the reference budget, the version that was current when the year
 * closed; a version that never became current is never read as a budget (`QĐ-91c`).
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
        baseMinor: version.baseMinor,
        reserveMinor: version.reserveMinor,
        heldMinor: held?.held ?? 0n,
        spentMinor: held?.spent ?? 0n,
      });
    }

    return facts;
  }
}
