import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import {
  BudgetCostCenterNotFoundError,
  BudgetProposalIncompleteError,
  BudgetProposalNotFoundError,
  BudgetProposalOpenError,
  BudgetProposalStateError,
  BudgetWindowBackwardsError,
  BudgetYearEndedError,
} from './budget.errors';
import {
  backwardLines,
  canResubmit,
  canReturn,
  canWithdraw,
  incompleteLines,
  totalOf,
  yearIsOpen,
  type LineDraft,
} from './budget.policy';
import { budgetAuditEvent, BudgetSupportService } from './budget-support.service';
import { ProposalRepo, type ProposalLineRecord, type ProposalRecord } from './proposal.repo';
import type { ProposalBodyDto, ProposalLineWire, ProposalSummaryWire, ProposalWire } from './budget.dto';

type LineBody = ProposalBodyDto['lines'][number];

/**
 * The proposals a head of department sends for the Cost Center of the department and a fiscal year (`US-06-10`): sent,
 * taken back while Finance has not sent a version made from them, given back by Finance with a reason, and sent again as a
 * new proposal that keeps the one before in the history. A proposal sent is never edited in place (`QĐ-82a`).
 */
@Injectable()
export class ProposalService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly proposals: ProposalRepo,
    private readonly support: BudgetSupportService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Throws BudgetCostCenterNotFoundError, BudgetNotYourCostCenterError, BudgetYearEndedError, BudgetProposalIncompleteError,
   * BudgetWindowBackwardsError, BudgetProposalOpenError, BudgetCurrencyError and the money errors.
   */
  async submit(actor: AuthenticatedPrincipal, body: ProposalBodyDto): Promise<ProposalWire> {
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const id = await this.send(tx, actor, {
        costCenterId: body.costCenterId,
        year: body.year,
        lines: body.lines,
        previous: null,
        fiscalStart,
      });

      return this.wire(await this.require(id, tx));
    });
  }

  /** Throws BudgetProposalNotFoundError, BudgetProposalStateError and the errors of `submit`. */
  async resubmit(actor: AuthenticatedPrincipal, id: string, lines: LineBody[]): Promise<ProposalWire> {
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const previous = await this.ownedLocked(tx, actor, id);
      if (!canResubmit(previous.state)) throw new BudgetProposalStateError('RESUBMIT', previous.state);
      const created = await this.send(tx, actor, {
        costCenterId: previous.costCenterId,
        year: previous.year,
        lines,
        previous: previous.id,
        fiscalStart,
      });

      return this.wire(await this.require(created, tx));
    });
  }

  /** The head takes the proposal back while Finance has not sent a version made from it (`US-06-10` AC-4). */
  async withdraw(actor: AuthenticatedPrincipal, id: string): Promise<ProposalWire> {
    return this.runner.run(async (tx) => {
      const proposal = await this.ownedLocked(tx, actor, id);
      if (!canWithdraw(proposal.state)) throw new BudgetProposalStateError('WITHDRAW', proposal.state);

      await this.proposals.setWithdrawn(tx, id, new Date());
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, proposal.organizationId, 'BUDGET_PROPOSAL.WITHDRAWN', 'BUDGET_PROPOSAL', id, {
          costCenterId: proposal.costCenterId,
          year: proposal.year,
        }),
      );

      return this.wire(await this.require(id, tx));
    });
  }

  /** Finance gives the proposal back with the reason that must go with it (`US-06-09` AC-15). */
  async giveBack(actor: AuthenticatedPrincipal, id: string, reason: string): Promise<ProposalWire> {
    return this.runner.run(async (tx) => {
      const proposal = await this.proposals.lockById(tx, id);
      if (!proposal) throw new BudgetProposalNotFoundError();
      if (!canReturn(proposal.state)) throw new BudgetProposalStateError('RETURN', proposal.state);

      await this.proposals.setReturned(tx, id, { reason, byEmployeeId: actor.employeeId, now: new Date() });
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, proposal.organizationId, 'BUDGET_PROPOSAL.RETURNED', 'BUDGET_PROPOSAL', id, {
          costCenterId: proposal.costCenterId,
          year: proposal.year,
          reason,
        }),
      );

      return this.wire(await this.require(id, tx));
    });
  }

  /** The proposals the caller reads: Finance all of them, a head those of the department they head. */
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

  private async send(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { costCenterId: string; year: number; lines: LineBody[]; previous: string | null; fiscalStart: number },
  ): Promise<string> {
    const now = new Date();
    const today = await this.support.today(now, tx);
    const costCenter = await this.support.costCenter(input.costCenterId, tx);
    await this.support.requireHead(actor.employeeId, costCenter.id, today, tx);
    if (!yearIsOpen(input.year, today, input.fiscalStart)) throw new BudgetYearEndedError(input.year);

    const drafts: LineDraft[] = input.lines.map((line) => ({
      description: line.description,
      amountMinor: 0n,
      windowFrom: line.windowFrom,
      windowTo: line.windowTo,
      servicePeriodMonths: line.servicePeriodMonths,
      repeatCycle: line.repeatCycle,
    }));
    const incomplete = incompleteLines(drafts);
    if (incomplete.length > 0) throw new BudgetProposalIncompleteError(incomplete);
    const backwards = backwardLines(drafts);
    if (backwards.length > 0) throw new BudgetWindowBackwardsError(backwards);

    const reporting = await this.support.reportingCurrency(tx);
    const lines: Omit<ProposalLineRecord, 'position'>[] = [];
    for (const line of input.lines) {
      lines.push({
        description: line.description,
        planId: line.planId ?? null,
        seats: line.seats ?? null,
        amountMinor: await this.support.money(line.amount, reporting, tx),
        windowFrom: line.windowFrom as ProposalLineRecord['windowFrom'],
        windowTo: line.windowTo as ProposalLineRecord['windowTo'],
        servicePeriodMonths: line.servicePeriodMonths as number,
        repeatCycle: line.repeatCycle as ProposalLineRecord['repeatCycle'],
        quoteValidUntil: line.quoteValidUntil ?? null,
        note: line.note ?? null,
      });
    }

    const open = (await this.proposals.chainOf(costCenter.id, input.year, tx)).some(
      (proposal) => proposal.state === 'SUBMITTED' || proposal.state === 'REVIEWED',
    );
    if (open) throw new BudgetProposalOpenError();

    const organizationId = await this.support.organizationId(tx);
    const total = totalOf(lines);
    const id = await this.proposals.insert(tx, {
      organizationId,
      costCenterId: costCenter.id,
      year: input.year,
      previousProposalId: input.previous,
      currency: reporting,
      totalMinor: total,
      submittedByEmployeeId: actor.employeeId,
      now,
      lines,
    });
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, organizationId, 'BUDGET_PROPOSAL.SUBMITTED', 'BUDGET_PROPOSAL', id, {
        costCenterId: costCenter.id,
        year: input.year,
        lines: lines.length,
        totalMinor: total.toString(),
        currency: reporting,
        previousProposalId: input.previous,
      }),
    );

    return id;
  }

  private async require(id: string, tx?: DbTx): Promise<ProposalRecord> {
    const proposal = await this.proposals.findById(id, tx);
    if (!proposal) throw new BudgetProposalNotFoundError();

    return proposal;
  }

  /** The proposal, locked, for the head whose Cost Center it is; anybody else finds nothing. */
  private async ownedLocked(tx: DbTx, actor: AuthenticatedPrincipal, id: string): Promise<ProposalRecord> {
    const proposal = await this.proposals.lockById(tx, id);
    const today = await this.support.today(new Date(), tx);
    if (!proposal || (await this.support.headedCostCenter(actor.employeeId, today, tx)) !== proposal.costCenterId) {
      throw new BudgetProposalNotFoundError();
    }

    return proposal;
  }

  /** Finance reads every proposal; a head reads those of their own Cost Center; anybody else finds nothing. */
  private async readable(actor: AuthenticatedPrincipal, id: string): Promise<ProposalRecord> {
    const proposal = await this.require(id);
    const scope = await this.scope(actor);
    if (scope !== 'ALL' && !scope.includes(proposal.costCenterId)) throw new BudgetProposalNotFoundError();

    return proposal;
  }

  private async scope(actor: AuthenticatedPrincipal): Promise<'ALL' | string[]> {
    if (actor.roles.includes('FINANCE') || (await this.support.isDecider(actor.employeeId))) return 'ALL';
    const own = await this.support.headedCostCenter(actor.employeeId, await this.support.today(new Date()));

    return own === null ? [] : [own];
  }

  private async wire(proposal: ProposalRecord): Promise<ProposalWire> {
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

export const toLineWire = (
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
