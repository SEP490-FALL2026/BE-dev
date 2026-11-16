import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { ProposalAttachmentBinder } from '../attachment/proposal-attachment-binder.service';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { ProposalRepo, type ProposalRecord } from '../budget/proposal.repo';
import { VersionRepo } from '../budget/version.repo';
import { BudgetNotifierService } from '../budget/budget-notifier.service';
import { proposalIsSucceedable, yearIsOpen } from '../budget/budget.policy';
import {
  BudgetCycleLockedError,
  BudgetCycleNotOpenError,
  BudgetProposalNotFoundError,
  BudgetProposalOpenError,
  BudgetYearEndedError,
} from '../budget/budget.errors';
import { proposalWorkRefusal } from '../cycle/cycle.policy';
import { CycleRepo, type CycleRecord } from '../cycle/cycle.repo';

/** `BM-10` (`QĐ-111ab`): the files, one amount for the year and a note; there are no lines. */
export interface ProposalSendInput {
  year: number;
  requestedAmount: { amount: string };
  note?: string;
  previous: string | null;
  attachmentIds: readonly string[];
  /** The Cost Center the work is for: needed only when the head answers for more than one that year. */
  costCenterId?: string;
}

@Injectable()
export class ProposalSender {
  constructor(
    private readonly proposals: ProposalRepo,
    private readonly versions: VersionRepo,
    private readonly facts: BudgetFactsService,
    private readonly notifier: BudgetNotifierService,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly audit: AuditApi,
    private readonly binder: ProposalAttachmentBinder,
    private readonly cycles: CycleRepo,
  ) {}

  /**
   * The work of `BM-10` is done only while the cycle of the year is open (`QĐ-111z`, `QĐ-111ab`): not before Finance opened it, and not
   * from the day after the submission deadline. The cycle is read `FOR SHARE`, so a change of it waits for the work; it is taken first,
   * before the proposal and the year (the order of the module: cycle, proposal, version, year). Returns the cycle. Throws
   * BudgetCycleNotOpenError and BudgetCycleLockedError.
   */
  async requireOpenCycle(tx: DbTx, year: number): Promise<CycleRecord> {
    const cycle = await this.cycles.lockByYear(tx, await this.facts.organizationId(tx), year, 'SHARE');
    const refusal = proposalWorkRefusal(cycle, await this.facts.today(new Date(), tx));
    if (refusal === 'LOCKED') throw new BudgetCycleLockedError(year);
    if (refusal !== null || cycle === null) throw new BudgetCycleNotOpenError(year);

    return cycle;
  }

  async send(tx: DbTx, actor: AuthenticatedPrincipal, input: ProposalSendInput): Promise<string> {
    const now = new Date();
    const today = await this.facts.today(now, tx);

    const own = await this.facts.requireHeadedCostCenter(actor.employeeId, today, tx, {
      year: input.year,
      costCenterId: input.costCenterId,
    });
    const costCenter = await this.facts.costCenterInUse(own, tx);
    if (!yearIsOpen(input.year, today)) throw new BudgetYearEndedError(input.year);
    await this.requireOpenCycle(tx, input.year);

    const reporting = await this.facts.reportingCurrency(tx);
    const total = await this.facts.money(input.requestedAmount, reporting, 'requestedAmount', tx);

    const successorOf = input.previous === null ? await this.proposalToFollow(tx, costCenter.id, input.year) : null;
    await this.yearLock.lock(tx, costCenter.id, [input.year]);
    const open = (await this.proposals.chainOf(costCenter.id, input.year, tx)).some(
      (proposal) =>
        proposal.state === 'SUBMITTED' ||
        (proposal.state === 'REVIEWED' && proposal.succeededAt === null && proposal.id !== successorOf),
    );
    if (open) throw new BudgetProposalOpenError();

    const organizationId = await this.facts.organizationId(tx);
    const id = await this.proposals.insert(tx, {
      organizationId,
      costCenterId: costCenter.id,
      year: input.year,
      previousProposalId: input.previous,
      successorOfProposalId: successorOf,
      currency: reporting,
      totalMinor: total,
      note: input.note ?? null,
      submittedByEmployeeId: actor.employeeId,
      now,
    });
    await this.binder.bind(tx, actor, id, input.attachmentIds);

    await this.recordAudit(tx, {
      actor,
      organizationId,
      id,
      costCenterId: costCenter.id,
      input,
      total,
      reporting,
      successorOf,
    });
    await this.notifier.proposalSubmitted(tx, await this.require(id, tx));

    return id;
  }

  private async recordAudit(
    tx: DbTx,
    data: {
      actor: AuthenticatedPrincipal;
      organizationId: string;
      id: string;
      costCenterId: string;
      input: ProposalSendInput;
      total: bigint;
      reporting: string;
      successorOf: string | null;
    },
  ): Promise<void> {
    await this.audit.record(
      tx,
      budgetAuditEvent(data.actor, data.organizationId, 'BUDGET_PROPOSAL.SUBMITTED', 'BUDGET_PROPOSAL', data.id, {
        costCenterId: data.costCenterId,
        year: data.input.year,
        totalMinor: data.total.toString(),
        note: data.input.note ?? null,
        attachments: data.input.attachmentIds.length,
        currency: data.reporting,
        previousProposalId: data.input.previous,
        successorOfProposalId: data.successorOf,
      }),
    );
  }

  private async proposalToFollow(tx: DbTx, costCenterId: string, year: number): Promise<string | null> {
    const candidate = await this.proposals.reviewedWithoutSuccessor(costCenterId, year, tx);
    if (!candidate) return null;
    const held = await this.proposals.lockById(tx, candidate.id);
    if (!held) return null;
    const latest = await this.versions.latestOfProposal(held.id, tx);

    return proposalIsSucceedable(held, latest?.state ?? null) ? held.id : null;
  }

  private async require(id: string, tx: DbTx): Promise<ProposalRecord> {
    const proposal = await this.proposals.findById(id, tx);
    if (!proposal) throw new BudgetProposalNotFoundError();

    return proposal;
  }
}
