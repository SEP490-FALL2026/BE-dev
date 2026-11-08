import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetNotYourCostCenterError } from '../budget/budget.errors';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { CommitmentRepo, heldKey } from '../budget/commitment.repo';
import { DecisionRepo } from '../budget/decision.repo';
import { InvoiceRepo } from '../budget/invoice.repo';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionLineRepo } from '../budget/version-line.repo';
import { VersionRepo } from '../budget/version.repo';
import { VersionViewService } from '../budget/version-view.service';
import type {
  BudgetSummaryWire,
  MineVersionSummaryWire,
  MineWire,
  TableRowWire,
  VersionLineWire,
} from '../budget/budget.dto';

/**
 * What is read of the budgets themselves (`US-06-09` AC-5, `US-06-10` AC-7). A head of department reads the budget of the
 * department they head: the proposal they sent and the lines of the current version, with the total, and nothing of what
 * is left, of the checks of the requests, of other departments or of the company. Finance reads the table of all the
 * current versions. For a year that has ended they read the reference budget, the version that was current when the year closed,
 * and never a version that did not become current (`QĐ-91c`).
 */
@Injectable()
export class BudgetViewService {
  constructor(
    private readonly versions: VersionRepo,
    private readonly lineRepo: VersionLineRepo,
    private readonly proposals: ProposalRepo,
    private readonly commitments: CommitmentRepo,
    private readonly decisions: DecisionRepo,
    private readonly views: VersionViewService,
    private readonly facts: BudgetFactsService,
    private readonly invoices: InvoiceRepo,
  ) {}

  /** Throws BudgetNotYourCostCenterError when the caller heads no department. */
  async mine(actor: AuthenticatedPrincipal, year: number, costCenterId?: string): Promise<MineWire> {
    const ownId = await this.ownCostCenter(actor, { year, costCenterId });
    const [costCenter, current, history, latest] = await Promise.all([
      this.facts.costCenter(ownId),
      this.versions.reference(ownId, year),
      this.proposals.chainOf(ownId, year),
      this.versions.latestOf(ownId, year),
    ]);
    // Why the latest version was refused, for the head who sent the proposal behind it.
    const refusal =
      latest?.state === 'REJECTED' ? (await this.decisions.latestOf([latest.id])).get(latest.id) : undefined;
    // The proposal behind the current version, else the one the head sent last.
    const proposal =
      (current?.proposalId ? history.find((entry) => entry.id === current.proposalId) : undefined) ??
      history[0] ??
      null;
    const money = proposal ? await this.facts.formatter(proposal.currency) : null;
    const total = current ? (await this.facts.formatter(current.currency))(current.totalMinor) : null;

    return {
      costCenter,
      year,
      status: current ? 'ACTIVE' : 'NO_ACTIVE_BUDGET',
      total,
      version: current ? { id: current.id, number: current.number } : null,
      latestRefusal: refusal?.reason ? { reason: refusal.reason, at: refusal.decidedAt.toISOString() } : null,
      proposal:
        proposal && money ? { id: proposal.id, state: proposal.state, total: money(proposal.totalMinor) } : null,
    };
  }

  async mineLines(
    actor: AuthenticatedPrincipal,
    year: number,
    query: { page: number; pageSize: number; costCenterId?: string },
  ): Promise<Page<VersionLineWire>> {
    const costCenterId = await this.ownCostCenter(actor, { year, costCenterId: query.costCenterId });
    const current = await this.versions.reference(costCenterId, year);
    if (!current) return pageOf([], 0, query.page, query.pageSize);
    const { items, total } = await this.lineRepo.pageLines(
      current.id,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    // The head sees what is planned, not what Finance thought of it.
    const lines = await this.views.lineWires(current.currency, items);

    return pageOf(
      lines.map((line) => ({ ...line, financeComment: null, adjustmentReason: null })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** The current versions of all Cost Centers, and the reference budget of the years that ended: for Finance only. */
  async table(query: { year?: number; page: number; pageSize: number }): Promise<Page<TableRowWire>> {
    const { items, total } = await this.versions.page({
      referenceOnly: true,
      ...(query.year ? { year: query.year } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const [centers, held] = await Promise.all([
      this.facts.costCenters(items.map((version) => version.costCenterId)),
      this.commitments.totals(items.map((version) => ({ costCenterId: version.costCenterId, year: version.year }))),
    ]);
    const rows = await Promise.all(
      items.map(async (version) => {
        const money = await this.facts.formatter(version.currency);
        const costCenter = centers.get(version.costCenterId);
        if (!costCenter) throw new Error(`The Cost Center ${version.costCenterId} of a version does not exist.`);

        const { held: committed, spent } = held.get(heldKey(version.costCenterId, version.year)) ?? {
          held: 0n,
          spent: 0n,
        };
        const remaining = version.totalMinor - committed - spent;

        return {
          costCenter,
          year: version.year,
          versionId: version.id,
          number: version.number,
          base: money(version.baseMinor),
          reserve: money(version.reserveMinor),
          total: money(version.totalMinor),
          committed: money(committed),
          spent: money(spent),
          remaining: money(remaining),
          overCommitted: remaining < 0n,
        };
      }),
    );

    return pageOf(rows, total, query.page, query.pageSize);
  }

  /**
   * The company-wide figures of a year, added up for each currency, for Finance only. A Cost Center is over budget when what is
   * held and spent against it is more than its budget; the spent figure is brought up to date whenever an invoice is recorded.
   */
  async summary(year: number): Promise<BudgetSummaryWire> {
    const versions = await this.versions.referenceFiguresOfYear(year);
    const held = await this.commitments.totals(
      versions.map((version) => ({ costCenterId: version.costCenterId, year: version.year })),
    );
    const sums = new Map<string, SummarySums>();
    for (const version of versions) {
      const { held: committed, spent } = held.get(heldKey(version.costCenterId, version.year)) ?? {
        held: 0n,
        spent: 0n,
      };
      const sum = sums.get(version.currency) ?? emptySums();
      sum.base += version.baseMinor;
      sum.reserve += version.reserveMinor;
      sum.total += version.totalMinor;
      sum.committed += committed;
      sum.spent += spent;
      sum.costCenterCount += 1;
      if (version.totalMinor - committed - spent < 0n) sum.overBudgetCount += 1;
      sums.set(version.currency, sum);
    }

    const totals: BudgetSummaryWire['totals'] = {};
    for (const [currency, sum] of sums) {
      const money = await this.facts.formatter(currency);
      totals[currency] = {
        currency,
        base: money(sum.base),
        reserve: money(sum.reserve),
        total: money(sum.total),
        committed: money(sum.committed),
        spent: money(sum.spent),
        remaining: money(sum.total - sum.committed - sum.spent),
        costCenterCount: sum.costCenterCount,
        overBudgetCount: sum.overBudgetCount,
      };
    }

    return { year, totals, lastInvoiceRecordedAt: (await this.invoices.lastRecordedAt(year))?.toISOString() ?? null };
  }

  async mineVersions(
    actor: AuthenticatedPrincipal,
    query: { year?: number; page: number; pageSize: number; costCenterId?: string },
  ): Promise<Page<MineVersionSummaryWire>> {
    const costCenterId = await this.ownCostCenter(actor, { year: query.year, costCenterId: query.costCenterId });
    const { items, total } = await this.versions.pageSentOf(costCenterId, {
      year: query.year,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    const wires: MineVersionSummaryWire[] = items.map((item) => ({
      id: item.id,
      year: item.year,
      number: item.number,
      state: item.state,
      sentAt: item.sentAt.toISOString(),
    }));

    return pageOf(wires, total, query.page, query.pageSize);
  }

  /** The Cost Center the caller asks about: the one they answer for, or the one they name when they answer for more than one that year. */
  private async ownCostCenter(
    actor: AuthenticatedPrincipal,
    pick: { year?: number; costCenterId?: string },
  ): Promise<string> {
    const unit = await this.facts.pickHeadedUnit(actor.employeeId, await this.facts.today(new Date()), pick);
    if (unit.costCenter === null) throw new BudgetNotYourCostCenterError();

    return unit.costCenter.id;
  }
}

interface SummarySums {
  base: bigint;
  reserve: bigint;
  total: bigint;
  committed: bigint;
  spent: bigint;
  costCenterCount: number;
  overBudgetCount: number;
}

const emptySums = (): SummarySums => ({
  base: 0n,
  reserve: 0n,
  total: 0n,
  committed: 0n,
  spent: 0n,
  costCenterCount: 0,
  overBudgetCount: 0,
});
