import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { ProposalAttachmentBinder } from '../attachment/proposal-attachment-binder.service';
import type { BudgetProposalBodyDto } from '../budget/budget.dto';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { ProposalRepo, type ProposalLineRecord, type ProposalRecord } from '../budget/proposal.repo';
import { VersionRepo } from '../budget/version.repo';
import { BudgetNotifierService } from '../budget/budget-notifier.service';
import { proposalIsSucceedable, totalOf, yearIsOpen } from '../budget/budget.policy';
import {
  BudgetCycleNotPublishedError,
  BudgetProposalNotFoundError,
  BudgetProposalOpenError,
  BudgetYearEndedError,
} from '../budget/budget.errors';
import { cycleAcceptsWork } from '../cycle/cycle.policy';
import { CycleRepo } from '../cycle/cycle.repo';

type LineBody = BudgetProposalBodyDto['lines'][number];

export interface ProposalSendInput {
  year: number;
  lines: LineBody[];
  previous: string | null;
  attachmentIds?: readonly string[];
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
   * A head proposes only once the cycle of the year was published, and may go on while it is changed (`Q-02`). The cycle is read
   * `FOR SHARE`, so a change of it waits for the sending. It is taken first, before the proposal and the year (the order of the
   * module: cycle, proposal, version, year): sending again calls this before it locks the proposal it follows.
   * Throws BudgetCycleNotPublishedError.
   */
  async requirePublishedCycle(tx: DbTx, year: number): Promise<void> {
    const cycle = await this.cycles.lockByYear(tx, await this.facts.organizationId(tx), year, 'SHARE');
    if (!cycle || !cycleAcceptsWork(cycle)) throw new BudgetCycleNotPublishedError(year);
  }

  async send(tx: DbTx, actor: AuthenticatedPrincipal, input: ProposalSendInput): Promise<string> {
    const now = new Date();
    const today = await this.facts.today(now, tx);

    const own = await this.facts.requireHeadedCostCenter(actor.employeeId, today, tx, {
      year: input.year,
      costCenterId: input.costCenterId,
    });
    const costCenter = await this.facts.costCenter(own, tx);
    if (!yearIsOpen(input.year, today)) throw new BudgetYearEndedError(input.year);
    await this.requirePublishedCycle(tx, input.year);

    await this.facts.requirePlans(input.lines.map((line) => line.planId));

    const reporting = await this.facts.reportingCurrency(tx);
    const lines = await this.buildProposalLines(tx, input.lines, reporting);

    const successorOf = input.previous === null ? await this.proposalToFollow(tx, costCenter.id, input.year) : null;
    await this.yearLock.lock(tx, costCenter.id, [input.year]);
    const open = (await this.proposals.chainOf(costCenter.id, input.year, tx)).some(
      (proposal) =>
        proposal.state === 'SUBMITTED' ||
        (proposal.state === 'REVIEWED' && proposal.succeededAt === null && proposal.id !== successorOf),
    );
    if (open) throw new BudgetProposalOpenError();

    const organizationId = await this.facts.organizationId(tx);
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

    if (input.attachmentIds && input.attachmentIds.length > 0) {
      await this.binder.bind(tx, actor, id, input.attachmentIds);
    }

    await this.recordAudit(tx, {
      actor,
      organizationId,
      id,
      costCenterId: costCenter.id,
      input,
      lines,
      total,
      reporting,
      successorOf,
    });
    await this.notifier.proposalSubmitted(tx, await this.require(id, tx));

    return id;
  }

  private async buildProposalLines(
    tx: DbTx,
    lines: LineBody[],
    reporting: string,
  ): Promise<Omit<ProposalLineRecord, 'position'>[]> {
    const records: Omit<ProposalLineRecord, 'position'>[] = [];
    const names = await this.facts.planNames(lines.map((line) => line.planId));
    for (const line of lines) {
      records.push({
        description: line.description ?? names.get(line.planId as string) ?? '',
        planId: line.planId ?? null,
        seats: line.seats ?? null,
        amountMinor: await this.facts.money(line.amount, reporting, tx),
        note: line.note ?? null,
      });
    }
    return records;
  }

  private async recordAudit(
    tx: DbTx,
    data: {
      actor: AuthenticatedPrincipal;
      organizationId: string;
      id: string;
      costCenterId: string;
      input: ProposalSendInput;
      lines: Omit<ProposalLineRecord, 'position'>[];
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
        lines: data.lines.length,
        totalMinor: data.total.toString(),
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
