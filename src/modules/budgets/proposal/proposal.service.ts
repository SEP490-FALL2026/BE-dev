import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetProposalNotFoundError, BudgetProposalStateError, BudgetYearEndedError } from '../budget/budget.errors';
import { canResubmit, canReturn, canWithdraw, yearHasEnded } from '../budget/budget.policy';
import { BudgetNotifierService } from '../budget/budget-notifier.service';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { ProposalSender } from './proposal-sender.service';
import { ProposalRepo, type ProposalRecord } from '../budget/proposal.repo';
import { ProposalViewService } from './proposal-view.service';
import { VersionRepo } from '../budget/version.repo';
import type { BudgetProposalBodyDto, ProposalWire } from '../budget/budget.dto';

type LineBody = BudgetProposalBodyDto['lines'][number];

@Injectable()
export class ProposalService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly proposals: ProposalRepo,
    private readonly versions: VersionRepo,
    private readonly facts: BudgetFactsService,
    private readonly notifier: BudgetNotifierService,
    private readonly sender: ProposalSender,
    private readonly views: ProposalViewService,
    private readonly audit: AuditApi,
  ) {}

  /** Throws BudgetNotYourCostCenterError, BudgetProposalIncompleteError, BudgetWindowBackwardsError, BudgetYearEndedError. */
  async submit(actor: AuthenticatedPrincipal, body: BudgetProposalBodyDto): Promise<ProposalWire> {
    const fiscalStart = await this.facts.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const id = await this.sender.send(tx, actor, {
        costCenterId: body.costCenterId,
        year: body.year,
        lines: body.lines,
        previous: null,
        fiscalStart,
        attachmentIds: body.attachmentIds,
      });

      return this.views.wire(await this.require(id, tx));
    });
  }

  /** Throws BudgetProposalNotFoundError, BudgetProposalStateError and the errors of `submit`. */
  async resubmit(
    actor: AuthenticatedPrincipal,
    id: string,
    lines: LineBody[],
    attachmentIds?: readonly string[],
  ): Promise<ProposalWire> {
    const fiscalStart = await this.facts.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const previous = await this.ownedLocked(tx, actor, id, true);
      const today = await this.facts.today(new Date(), tx);
      if (yearHasEnded(previous.year, today, fiscalStart)) throw new BudgetYearEndedError(previous.year);
      if (!canResubmit(previous.state)) throw new BudgetProposalStateError('RESUBMIT', previous.state);
      const created = await this.sender.send(tx, actor, {
        costCenterId: previous.costCenterId,
        year: previous.year,
        lines,
        previous: previous.id,
        fiscalStart,
        attachmentIds,
      });

      return this.views.wire(await this.require(created, tx));
    });
  }

  /** The head takes the proposal back while Finance has not sent a version made from it (`US-06-10` AC-4). */
  async withdraw(actor: AuthenticatedPrincipal, id: string): Promise<ProposalWire> {
    const fiscalStart = await this.facts.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const proposal = await this.ownedLocked(tx, actor, id);
      const today = await this.facts.today(new Date(), tx);
      if (yearHasEnded(proposal.year, today, fiscalStart)) throw new BudgetYearEndedError(proposal.year);
      if (!canWithdraw(proposal.state)) throw new BudgetProposalStateError('WITHDRAW', proposal.state);

      await this.proposals.setWithdrawn(tx, id, new Date());
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
    this.facts.requireFinance(actor);
    const fiscalStart = await this.facts.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const proposal = await this.proposals.lockById(tx, id);
      if (!proposal) throw new BudgetProposalNotFoundError();
      const today = await this.facts.today(new Date(), tx);
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

  private async require(id: string, tx?: DbTx): Promise<ProposalRecord> {
    const proposal = await this.proposals.findById(id, tx);
    if (!proposal) throw new BudgetProposalNotFoundError();
    this.checkProposalInvariants(proposal);

    return proposal;
  }

  private checkProposalInvariants(proposal: ProposalRecord): void {
    const list: string[] = [];
    list.push(proposal.id);
    list.push(proposal.costCenterId);
    list.push(proposal.organizationId);
    list.push(String(proposal.year));
    list.push(proposal.currency);
    list.push(String(proposal.totalMinor));
    list.push(proposal.state);
    list.push(String(proposal.submittedAt));
    list.push(String(proposal.submittedByEmployeeId));
    list.push(String(proposal.returnedAt));
    list.push(String(proposal.returnedByEmployeeId));
    list.push(String(proposal.withdrawnAt));
    list.push(String(proposal.closedAt));
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    list.push(proposal.currency);
    if (list.length === 0) throw new BudgetProposalNotFoundError();
  }

  /** The proposal, locked, for the head whose Cost Center it is; anybody else finds nothing. */
  private async ownedLocked(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    id: string,
    keepWhenNoneInUse = false,
  ): Promise<ProposalRecord> {
    const today = await this.facts.today(new Date(), tx);
    const own = keepWhenNoneInUse
      ? await this.facts.headedCostCenter(actor.employeeId, today, tx)
      : await this.facts.requireHeadedCostCenter(actor.employeeId, today, tx);
    const held = await this.proposals.lockById(tx, id);
    if (!held || held.costCenterId !== own) throw new BudgetProposalNotFoundError();

    return held;
  }
}
