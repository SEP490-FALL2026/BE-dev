import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetNotYourCostCenterError } from '../budget/budget.errors';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { BudgetViewNumbersService } from './budget-view-numbers.service';
import { BudgetTableViewService } from './budget-table-view.service';
import { budgetNumbers } from './budget-view.mapper';
import { DecisionRepo } from '../budget/decision.repo';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionLineRepo } from '../budget/version-line.repo';
import { VersionRepo, type VersionRecord } from '../budget/version.repo';
import { VersionViewService } from '../budget/version-view.service';
import type {
  BudgetSummaryWire,
  MineVersionSummaryWire,
  MineWire,
  TableRowWire,
  VersionLineWire,
} from '../budget/budget.dto';

/** The department head reads their own figures; Finance and the spending approver read the company views. */
@Injectable()
export class BudgetViewService {
  constructor(
    private readonly versions: VersionRepo,
    private readonly lineRepo: VersionLineRepo,
    private readonly proposals: ProposalRepo,
    private readonly numbers: BudgetViewNumbersService,
    private readonly decisions: DecisionRepo,
    private readonly views: VersionViewService,
    private readonly facts: BudgetFactsService,
    private readonly tableView: BudgetTableViewService,
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
    const numbers = await this.mineNumbers(ownId, year, current);

    return {
      costCenter,
      year,
      status: current ? 'ACTIVE' : 'NO_ACTIVE_BUDGET',
      ...numbers,
      version: current ? { id: current.id, number: current.number } : null,
      latestRefusal: refusal?.reason ? { reason: refusal.reason, at: refusal.decidedAt.toISOString() } : null,
      proposal:
        proposal && money ? { id: proposal.id, state: proposal.state, total: money(proposal.totalMinor) } : null,
    };
  }

  private async mineNumbers(ownId: string, year: number, current: VersionRecord | null) {
    const format = await this.facts.formatter(current?.currency ?? (await this.facts.reportingCurrency()));
    const totals = (await this.numbers.totals([{ costCenterId: ownId, year }])).get(`${ownId}:${year}`)!;
    const cycle = await this.numbers.cycle(year);
    const departmentId = (await this.facts.departmentsOf([ownId])).get(ownId);
    const ceiling = cycle?.publishedAt ? cycle.ceilings.find((entry) => entry.departmentId === departmentId) : null;
    const ceilingMoney = cycle ? await this.facts.formatter(cycle.currency) : null;
    return {
      ...budgetNumbers(current ?? { baseMinor: null, reserveMinor: null, totalMinor: null }, totals, format),
      departmentCeiling:
        ceiling && ceilingMoney
          ? {
              total: ceilingMoney(ceiling.totalMinor),
              signedCommitments: ceilingMoney(ceiling.signedCommitmentsMinor),
              plannedSeats: ceilingMoney(ceiling.plannedSeatsMinor),
              priority: ceilingMoney(ceiling.priorityMinor),
            }
          : null,
      cycle: cycle
        ? {
            submissionDeadline: cycle.submissionDeadline,
            decisionDeadline: cycle.decisionDeadline,
            published: cycle.publishedAt !== null,
          }
        : null,
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

  table(query: { year?: number; page: number; pageSize: number }): Promise<Page<TableRowWire>> {
    return this.tableView.table(query);
  }

  summary(year: number): Promise<BudgetSummaryWire> {
    return this.tableView.summary(year);
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
