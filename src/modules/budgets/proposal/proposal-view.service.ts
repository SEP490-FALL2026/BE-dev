import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetCostCenterNotFoundError, BudgetProposalNotFoundError } from '../budget/budget.errors';
import { BudgetSupportService } from '../budget/budget-support.service';
import { ProposalRepo, type ProposalLineRecord, type ProposalRecord } from '../budget/proposal.repo';
import type { ProposalLineWire, ProposalSummaryWire, ProposalWire } from '../budget/budget.dto';

/**
 * What is read of the proposals (`US-06-10`): Finance and the spending approver read every proposal, a head of department those of
 * the Cost Center of their department, and anybody else none. A proposal that was closed with its year, given back, withdrawn or
 * followed by another reads as it was; the links to the proposal it follows and the one that follows it are read-only.
 */
@Injectable()
export class ProposalViewService {
  constructor(
    private readonly proposals: ProposalRepo,
    private readonly support: BudgetSupportService,
  ) {}

  async list(
    actor: AuthenticatedPrincipal,
    query: { state?: ProposalRecord['state']; year?: number; page: number; pageSize: number },
  ): Promise<Page<ProposalSummaryWire>> {
    const scope = await this.scope(actor);
    if (scope !== 'ALL' && scope.length === 0) return pageOf([], 0, query.page, query.pageSize);

    const { items, total } = await this.proposals.page({
      ...(scope === 'ALL' ? {} : { costCenterIds: scope }),
      ...(query.state ? { state: query.state } : {}),
      ...(query.year ? { year: query.year } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const wires = await this.wires(items);

    return pageOf(wires.map(summaryOf), total, query.page, query.pageSize);
  }

  async get(actor: AuthenticatedPrincipal, id: string): Promise<ProposalWire> {
    return this.wire(await this.readable(actor, id));
  }

  async lines(
    actor: AuthenticatedPrincipal,
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<ProposalLineWire>> {
    const proposal = await this.readable(actor, id);
    const { items, total } = await this.proposals.pageLines(id, (query.page - 1) * query.pageSize, query.pageSize);
    const money = await this.support.formatter(proposal.currency);

    return pageOf(
      items.map((line) => toLineWire(line, money)),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Finance reads every proposal; a head reads those of their own Cost Center; anybody else finds nothing. */
  private async readable(actor: AuthenticatedPrincipal, id: string): Promise<ProposalRecord> {
    const proposal = await this.proposals.findById(id);
    if (!proposal) throw new BudgetProposalNotFoundError();
    const scope = await this.scope(actor);
    if (scope !== 'ALL' && !scope.includes(proposal.costCenterId)) throw new BudgetProposalNotFoundError();

    return proposal;
  }

  private async scope(actor: AuthenticatedPrincipal): Promise<'ALL' | string[]> {
    if (actor.roles.includes('FINANCE') || (await this.support.isDecider(actor.employeeId))) return 'ALL';
    const own = await this.support.headedCostCenter(actor.employeeId, await this.support.today(new Date()));

    return own === null ? [] : [own];
  }

  async wire(proposal: ProposalRecord): Promise<ProposalWire> {
    const [wire] = await this.wires([proposal]);

    return wire;
  }

  private async wires(proposals: readonly ProposalRecord[]): Promise<ProposalWire[]> {
    const [people, centers] = await Promise.all([
      this.support.people(proposals.flatMap((p) => [p.submittedByEmployeeId, p.returnedByEmployeeId])),
      this.support.costCenters(proposals.map((p) => p.costCenterId)),
    ]);

    return Promise.all(
      proposals.map(async (proposal) => {
        const money = await this.support.formatter(proposal.currency);
        const costCenter = centers.get(proposal.costCenterId);
        if (!costCenter) throw new BudgetCostCenterNotFoundError();

        return {
          id: proposal.id,
          costCenter,
          year: proposal.year,
          state: proposal.state,
          previousProposalId: proposal.previousProposalId,
          successorOfProposalId: proposal.successorOfProposalId,
          successorProposalId: proposal.successorProposalId,
          total: money(proposal.totalMinor),
          submittedBy: people.get(proposal.submittedByEmployeeId) ?? null,
          submittedAt: proposal.submittedAt.toISOString(),
          returned:
            proposal.returnedReason && proposal.returnedAt
              ? {
                  reason: proposal.returnedReason,
                  by: proposal.returnedByEmployeeId ? (people.get(proposal.returnedByEmployeeId) ?? null) : null,
                  at: proposal.returnedAt.toISOString(),
                }
              : null,
          withdrawnAt: proposal.withdrawnAt?.toISOString() ?? null,
          succeededAt: proposal.succeededAt?.toISOString() ?? null,
          closedAt: proposal.closedAt?.toISOString() ?? null,
        };
      }),
    );
  }
}

const summaryOf = (proposal: ProposalWire): ProposalSummaryWire => ({
  id: proposal.id,
  costCenter: proposal.costCenter,
  year: proposal.year,
  state: proposal.state,
  previousProposalId: proposal.previousProposalId,
  total: proposal.total,
  submittedAt: proposal.submittedAt,
});

const toLineWire = (
  line: ProposalLineRecord,
  money: (minor: bigint) => { amount: string; currency: string },
): ProposalLineWire => ({
  position: line.position,
  description: line.description,
  planId: line.planId,
  seats: line.seats,
  amount: money(line.amountMinor),
  windowFrom: line.windowFrom,
  windowTo: line.windowTo,
  servicePeriodMonths: line.servicePeriodMonths,
  repeatCycle: line.repeatCycle,
  quoteValidUntil: line.quoteValidUntil,
  note: line.note,
});
