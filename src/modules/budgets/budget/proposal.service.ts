import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import {
  BudgetNotYourCostCenterError,
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
  proposalIsSucceedable,
  totalOf,
  yearHasEnded,
  yearIsOpen,
  type LineDraft,
} from './budget.policy';
import { BudgetNotifierService } from './budget-notifier.service';
import { budgetAuditEvent, BudgetSupportService } from './budget-support.service';
import { BudgetYearLockRepo } from './budget-year-lock.repo';
import { ProposalRepo, type ProposalLineRecord, type ProposalRecord } from './proposal.repo';
import { ProposalViewService } from './proposal-view.service';
import { VersionRepo } from './version.repo';
import type { BudgetProposalBodyDto, ProposalWire } from './budget.dto';

type LineBody = BudgetProposalBodyDto['lines'][number];

/**
 * The proposals a head of department sends for the Cost Center of the department and a fiscal year (`US-06-10`): sent,
 * taken back while Finance has not sent a version made from them, given back by Finance with a reason, and sent again as a
 * new proposal that keeps the one before in the history. A proposal sent is never edited in place (`QĐ-82a`). A refused version
 * leaves its proposal reviewed; when the need changed the head sends a new proposal that follows it (F63). Once the fiscal
 * year has ended nothing of it is written (`QĐ-91c`), whether or not the closure of the year has run.
 */
@Injectable()
export class ProposalService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly proposals: ProposalRepo,
    private readonly versions: VersionRepo,
    private readonly support: BudgetSupportService,
    private readonly notifier: BudgetNotifierService,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly views: ProposalViewService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Throws FinanceSetupIncompleteError, BudgetCostCenterNotFoundError, BudgetNotYourCostCenterError, BudgetYearEndedError,
   * BudgetProposalIncompleteError, BudgetWindowBackwardsError, BudgetPlanNotFoundError, BudgetProposalOpenError,
   * BudgetCurrencyError and the money errors.
   */
  async submit(actor: AuthenticatedPrincipal, body: BudgetProposalBodyDto): Promise<ProposalWire> {
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const id = await this.send(tx, actor, {
        costCenterId: body.costCenterId,
        year: body.year,
        lines: body.lines,
        previous: null,
        fiscalStart,
      });

      return this.views.wire(await this.require(id, tx));
    });
  }

  /** Throws BudgetProposalNotFoundError, BudgetProposalStateError and the errors of `submit`. */
  async resubmit(actor: AuthenticatedPrincipal, id: string, lines: LineBody[]): Promise<ProposalWire> {
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const previous = await this.ownedLocked(tx, actor, id);
      const today = await this.support.today(new Date(), tx);
      if (yearHasEnded(previous.year, today, fiscalStart)) throw new BudgetYearEndedError(previous.year);
      if (!canResubmit(previous.state)) throw new BudgetProposalStateError('RESUBMIT', previous.state);
      const created = await this.send(tx, actor, {
        costCenterId: previous.costCenterId,
        year: previous.year,
        lines,
        previous: previous.id,
        fiscalStart,
      });

      return this.views.wire(await this.require(created, tx));
    });
  }

  /** The head takes the proposal back while Finance has not sent a version made from it (`US-06-10` AC-4). */
  async withdraw(actor: AuthenticatedPrincipal, id: string): Promise<ProposalWire> {
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const proposal = await this.ownedLocked(tx, actor, id);
      const today = await this.support.today(new Date(), tx);
      if (yearHasEnded(proposal.year, today, fiscalStart)) throw new BudgetYearEndedError(proposal.year);
      if (!canWithdraw(proposal.state)) throw new BudgetProposalStateError('WITHDRAW', proposal.state);

      const now = new Date();
      await this.proposals.setWithdrawn(tx, id, now);
      await this.versions.detachDraftsOf(tx, id, now);
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, proposal.organizationId, 'BUDGET_PROPOSAL.WITHDRAWN', 'BUDGET_PROPOSAL', id, {
          costCenterId: proposal.costCenterId,
          year: proposal.year,
        }),
      );

      return this.views.wire(await this.require(id, tx));
    });
  }

  /** Finance gives the proposal back with the reason that must go with it (`US-06-09` AC-15). */
  async giveBack(actor: AuthenticatedPrincipal, id: string, reason: string): Promise<ProposalWire> {
    this.support.requireFinance(actor);
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const proposal = await this.proposals.lockById(tx, id);
      if (!proposal) throw new BudgetProposalNotFoundError();
      const today = await this.support.today(new Date(), tx);
      if (yearHasEnded(proposal.year, today, fiscalStart)) throw new BudgetYearEndedError(proposal.year);
      if (!canReturn(proposal.state)) throw new BudgetProposalStateError('RETURN', proposal.state);

      const now = new Date();
      await this.proposals.setReturned(tx, id, { reason, byEmployeeId: actor.employeeId, now });
      await this.versions.detachDraftsOf(tx, id, now);
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, proposal.organizationId, 'BUDGET_PROPOSAL.RETURNED', 'BUDGET_PROPOSAL', id, {
          costCenterId: proposal.costCenterId,
          year: proposal.year,
          reason,
        }),
      );
      const returned = await this.require(id, tx);
      await this.notifier.proposalReturned(tx, returned, today);

      return this.views.wire(returned);
    });
  }

  private async send(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { costCenterId: string; year: number; lines: LineBody[]; previous: string | null; fiscalStart: number },
  ): Promise<string> {
    const now = new Date();
    const today = await this.support.today(now, tx);
    // The head's own department comes first: without a Cost Center in use there is nothing to propose for (F27).
    const own = await this.support.requireHeadedCostCenter(actor.employeeId, today, tx);
    const costCenter = await this.support.costCenter(input.costCenterId, tx);
    if (costCenter.id !== own) throw new BudgetNotYourCostCenterError();
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
    await this.support.requirePlans(input.lines.map((line) => line.planId));

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

    // A new proposal may follow a reviewed one whose version was refused (F63): that proposal is locked before the year, as the
    // decision of a version and the making of another version from it lock it, and is judged again once it is held.
    const successorOf = input.previous === null ? await this.proposalToFollow(tx, costCenter.id, input.year) : null;
    await this.yearLock.lock(tx, costCenter.id, [input.year]);
    const open = (await this.proposals.chainOf(costCenter.id, input.year, tx)).some(
      (proposal) =>
        proposal.state === 'SUBMITTED' ||
        (proposal.state === 'REVIEWED' && proposal.succeededAt === null && proposal.id !== successorOf),
    );
    if (open) throw new BudgetProposalOpenError();

    const organizationId = await this.support.organizationId(tx);
    const total = totalOf(lines);
    const id = await this.proposals.insert(tx, {
      organizationId,
      costCenterId: costCenter.id,
      year: input.year,
      previousProposalId: input.previous,
      successorOfProposalId: successorOf,
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
        successorOfProposalId: successorOf,
      }),
    );
    await this.notifier.proposalSubmitted(tx, await this.require(id, tx));

    return id;
  }

  /** The reviewed proposal of the Cost Center and year that the one being sent follows, locked, or null when there is none (F63). */
  private async proposalToFollow(tx: DbTx, costCenterId: string, year: number): Promise<string | null> {
    const candidate = await this.proposals.reviewedWithoutSuccessor(costCenterId, year, tx);
    if (!candidate) return null;
    const held = await this.proposals.lockById(tx, candidate.id);
    if (!held) return null;
    const latest = await this.versions.latestOfProposal(held.id, tx);

    return proposalIsSucceedable(held, latest?.state ?? null) ? held.id : null;
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
}
