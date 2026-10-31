import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetDecisionRefusedError, BudgetVersionNotFoundError, BudgetYearEndedError } from '../budget/budget.errors';
import { checkVersionDecision, deciderOf, yearHasEnded } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo, type VersionRecord } from '../budget/version.repo';
import { BudgetChangeListeners } from '../public/budgets.extension-points';

/** What a decision on a version is written from: the version, the versions of its year, who decides it and the day. */
export interface JudgedDecision {
  version: VersionRecord;
  siblings: readonly VersionRecord[];
  approverIsParty: boolean;
  today: BusinessDate;
}

/**
 * What the decision of the spending approver on a version needs to hold before anything is written (`US-06-11`): the versions of the Cost
 * Center and year locked by id, who may decide it (the substitute when the approver sent the proposal behind it, `US-06-08` AC-11), that
 * the fiscal year has not ended, and the requests that wait on this budget locked before the year. Throws
 * BudgetVersionNotFoundError, BudgetDecisionRefusedError and BudgetYearEndedError.
 */
@Injectable()
export class VersionDecisionJudge {
  constructor(
    private readonly versions: VersionRepo,
    private readonly proposals: ProposalRepo,
    private readonly facts: BudgetFactsService,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly listeners: BudgetChangeListeners,
  ) {}

  async judge(tx: DbTx, actor: AuthenticatedPrincipal, id: string, fiscalStart: number): Promise<JudgedDecision> {
    const known = await this.versions.findById(id, tx);
    if (!known) throw new BudgetVersionNotFoundError();
    const siblings = await this.versions.lockAllOfYear(tx, known.costCenterId, known.year);
    const version = siblings.find((candidate) => candidate.id === id);
    if (!version) throw new BudgetVersionNotFoundError();
    // The approver who sent the proposal behind a version does not decide it: the substitute does (`US-06-08` AC-11).
    const holders = await this.facts.holders(tx);
    const proposal = version.proposalId ? await this.proposals.findById(version.proposalId, tx) : null;
    const { employeeId: decider, approverIsParty } = deciderOf(holders, proposal?.submittedByEmployeeId ?? null);
    const refusal = checkVersionDecision({
      actorIsDecider: decider !== null && decider === actor.employeeId,
      actorHasConflict: approverIsParty && actor.employeeId === holders.spendingApproverEmployeeId,
      actorEmployeeId: actor.employeeId,
      createdByEmployeeId: version.createdByEmployeeId,
      sentByEmployeeId: version.sentByEmployeeId,
      state: version.state,
    });
    // Who may not decide is told first; then a year that has ended, whether or not its closure has run; then the state.
    if (refusal && refusal !== 'NOT_SENT') throw new BudgetDecisionRefusedError(refusal);
    const today = await this.facts.today(new Date(), tx);
    if (yearHasEnded(version.year, today, fiscalStart)) throw new BudgetYearEndedError(version.year);
    if (refusal) throw new BudgetDecisionRefusedError(refusal);
    // The requests that wait on this budget are locked before the year, as every writer of the system does.
    await this.listeners.emit(tx, {
      kind: 'LOCK_WAITING',
      scope: { costCenterId: version.costCenterId, year: version.year },
    });
    await this.yearLock.lock(tx, version.costCenterId, [version.year]);

    return { version, siblings, approverIsParty, today };
  }
}
