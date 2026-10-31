import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetNotYourCostCenterError } from '../budget/budget.errors';
import { BudgetSupportService } from '../budget/budget-support.service';
import { CommitmentRepo, heldKey } from '../budget/commitment.repo';
import { DecisionRepo } from '../budget/decision.repo';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionLineRepo } from '../budget/version-line.repo';
import { VersionRepo } from '../budget/version.repo';
import { VersionViewService } from '../budget/version-view.service';
import type { MineWire, TableRowWire, VersionLineWire } from '../budget/budget.dto';

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
    private readonly support: BudgetSupportService,
  ) {}

  /** Throws BudgetNotYourCostCenterError when the caller heads no department. */
  async mine(actor: AuthenticatedPrincipal, year: number): Promise<MineWire> {
    const costCenterId = await this.ownCostCenter(actor);
    const [costCenter, current, history, latest] = await Promise.all([
      this.support.costCenter(costCenterId),
      this.versions.reference(costCenterId, year),
      this.proposals.chainOf(costCenterId, year),
      this.versions.latestOf(costCenterId, year),
    ]);
    // Why the latest version was refused, for the head who sent the proposal behind it.
    const refusal =
      latest?.state === 'REJECTED' ? (await this.decisions.latestOf([latest.id])).get(latest.id) : undefined;
    // The proposal behind the current version, else the one the head sent last.
    const proposal =
      (current?.proposalId ? history.find((entry) => entry.id === current.proposalId) : undefined) ??
      history[0] ??
      null;
    const money = proposal ? await this.support.formatter(proposal.currency) : null;
    const total = current ? (await this.support.formatter(current.currency))(current.totalMinor) : null;

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
    query: { page: number; pageSize: number },
  ): Promise<Page<VersionLineWire>> {
    const costCenterId = await this.ownCostCenter(actor);
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
      this.support.costCenters(items.map((version) => version.costCenterId)),
      this.commitments.totals(items.map((version) => ({ costCenterId: version.costCenterId, year: version.year }))),
    ]);
    const rows = await Promise.all(
      items.map(async (version) => {
        const money = await this.support.formatter(version.currency);
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

  private async ownCostCenter(actor: AuthenticatedPrincipal): Promise<string> {
    const own = await this.support.headedCostCenter(actor.employeeId, await this.support.today(new Date()));
    if (own === null) throw new BudgetNotYourCostCenterError();

    return own;
  }
}
