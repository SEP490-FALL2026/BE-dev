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

/**
 * The proposals a head of department sends for the Cost Center of the department and a fiscal year (`US-06-10`): sent,
 * taken back while Finance has not sent a version made from them, given back by Finance with a reason, and sent again as a
 * new proposal that keeps the one before in the history. A proposal sent is never edited in place (`QĐ-82a`). A refused version
 * leaves its proposal reviewed; when the need changed the head sends a new proposal that follows it. Once the fiscal
 * year has ended nothing of it is written (`QĐ-91c`), whether or not the closure of the year has run.
 */
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

  /**
   * Throws FinanceSetupIncompleteError, BudgetCostCenterNotFoundError, BudgetNotYourCostCenterError, BudgetYearEndedError,
   * BudgetProposalIncompleteError, BudgetWindowBackwardsError, BudgetPlanNotFoundError, BudgetProposalOpenError,
   * BudgetCurrencyError, the money errors and, with `attachmentIds`, BudgetAttachmentNotAttachableError.
   */
  async submit(actor: AuthenticatedPrincipal, body: BudgetProposalBodyDto): Promise<ProposalWire> {
    return this.runner.run(async (tx) => {
      const id = await this.sender.send(tx, actor, {
        year: body.year,
        lines: body.lines,
        previous: null,
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
    return this.runner.run(async (tx) => {
      const previous = await this.ownedLocked(tx, actor, id, true);
      const today = await this.facts.today(new Date(), tx);
      if (yearHasEnded(previous.year, today)) throw new BudgetYearEndedError(previous.year);
      if (!canResubmit(previous.state)) throw new BudgetProposalStateError('RESUBMIT', previous.state);
      const created = await this.sender.send(tx, actor, {
        year: previous.year,
        lines,
        previous: previous.id,
        attachmentIds,
      });

      return this.views.wire(await this.require(created, tx));
    });
  }

  /** The head takes the proposal back while Finance has not sent a version made from it (`US-06-10` AC-4). */
  async withdraw(actor: AuthenticatedPrincipal, id: string): Promise<ProposalWire> {
    return this.runner.run(async (tx) => {
      const proposal = await this.ownedLocked(tx, actor, id);
      const today = await this.facts.today(new Date(), tx);
      if (yearHasEnded(proposal.year, today)) throw new BudgetYearEndedError(proposal.year);
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
    this.facts.requireFinance(actor);
    return this.runner.run(async (tx) => {
      const proposal = await this.proposals.lockById(tx, id);
      if (!proposal) throw new BudgetProposalNotFoundError();
      const today = await this.facts.today(new Date(), tx);
      if (yearHasEnded(proposal.year, today)) throw new BudgetYearEndedError(proposal.year);
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

    return proposal;
  }

  /** The proposal, locked, for the head whose Cost Center it is; anybody else finds nothing. */
  private async ownedLocked(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    id: string,
    keepWhenNoneInUse = false,
  ): Promise<ProposalRecord> {
    const proposal = await this.proposals.lockById(tx, id);
    const today = await this.facts.today(new Date(), tx);
    if (!proposal) throw new BudgetProposalNotFoundError();
    if ((await this.facts.headedCostCenter(actor.employeeId, today, tx)) === proposal.costCenterId) return proposal;
    // The head of a department whose Cost Center was retired still owns the proposal that was given back: sending it again meets
    // the 409 FINANCE.SETUP_INCOMPLETE of `send`, not a 404.
    if (
      keepWhenNoneInUse &&
      (await this.facts.headsDepartmentWithNoneInUse(actor.employeeId, proposal.costCenterId, today, tx))
    ) {
      return proposal;
    }

    throw new BudgetProposalNotFoundError();
  }
}
