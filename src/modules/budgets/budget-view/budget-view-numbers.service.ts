import { Injectable } from '@nestjs/common';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { BudgetFactsRepo } from '../budget/budget-facts.repo';
import { CommitmentRepo } from '../budget/commitment.repo';
import { InvoiceRepo } from '../budget/invoice.repo';
import { CycleRepo } from '../cycle/cycle.repo';
import { PendingSpendContributions } from '../public/budgets.extension-points';
import { RunningUncommittedFactsService } from '../running-uncommitted/running-uncommitted-facts.service';

export interface BudgetViewNumbers {
  committed: bigint;
  spent: bigint;
  pendingSpend: bigint;
  runningUncommitted: bigint;
  noPriceRightCount: number;
  priorPeriodAdjustment: bigint;
}

/** Batched figures for all three views. Unattached commitments count here while the spend check keeps its attached-only contract. */
@Injectable()
export class BudgetViewNumbersService {
  constructor(
    private readonly commitments: CommitmentRepo,
    private readonly pending: PendingSpendContributions,
    private readonly invoices: InvoiceRepo,
    private readonly cycles: CycleRepo,
    private readonly organization: OrganizationReadApi,
    private readonly budgets: BudgetFactsRepo,
    private readonly runningUncommitted: RunningUncommittedFactsService,
  ) {}

  /** What the adjustments approved for the year added to the base of the Cost Center (`AD-1`); nothing when it has none. */
  async adjustmentOf(costCenterId: string, year: number): Promise<bigint> {
    return (await this.budgets.approvedOfCostCenters([costCenterId], year)).get(costCenterId)?.adjustmentMinor ?? 0n;
  }

  async totals(pairs: readonly { costCenterId: string; year: number }[]): Promise<Map<string, BudgetViewNumbers>> {
    if (pairs.length === 0) return new Map();
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('The installation has no organization.');
    const [held, pending, prior, running] = await Promise.all([
      this.commitments.totals(pairs, undefined, true),
      this.pending.totals(pairs),
      this.invoices.priorPeriodAdjustments(pairs, organization.timeZone),
      this.runningUncommitted.totalsWithFlags(pairs),
    ]);
    return new Map(
      pairs.map(({ costCenterId, year }) => {
        const key = `${costCenterId}:${year}`;
        return [
          key,
          {
            committed: held.get(key)?.held ?? 0n,
            spent: held.get(key)?.spent ?? 0n,
            pendingSpend: pending.get(key) ?? 0n,
            runningUncommitted: running.totals.get(key) ?? 0n,
            noPriceRightCount: running.noPriceRightCounts.get(key) ?? 0,
            priorPeriodAdjustment: prior.get(key) ?? 0n,
          },
        ];
      }),
    );
  }

  async cycle(year: number) {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('The installation has no organization.');
    return this.cycles.findByYear(organization.id, year);
  }

  async lastInvoice(year: number): Promise<string | null> {
    return (await this.invoices.lastRecordedAt(year))?.toISOString() ?? null;
  }
}
