import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  BudgetDecisionRefusedError,
  BudgetVersionNotEditableError,
  BudgetVersionNotFoundError,
  BudgetYearEndedError,
} from '../budget/budget.errors';
import { checkVersionDecision, deciderOf, yearHasEnded } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo, type VersionRecord } from '../budget/version.repo';
import type { CycleRecord } from '../cycle/cycle.repo';
import { VersionAccessService } from './version-access.service';

/** A revision of the budget of a year is gone (`QĐ-97b`): one that an older release left is not decided. */
function refuseRevision(version: VersionRecord): void {
  if (version.kind === 'REVISION') throw new BudgetVersionNotEditableError(version.state);
}

/** What a decision on a version is written from: the version, the versions of its year, who decides it and the day. */
export interface JudgedDecision {
  version: VersionRecord;
  siblings: readonly VersionRecord[];
  today: BusinessDate;
}

/**
 * What the decision of the spending approver on a version needs to hold before anything is written (`US-06-11`): the versions of the Cost
 * Center and year locked by id, who may decide it (the spending approver, and nobody in their place, `QĐ-93d`(1)), that
 * the fiscal year has not ended, and the requests that wait on this budget locked before the year. An approval makes the check of the annual
 * ceiling again, since the versions of the year may have changed since this one was sent (`4.7-02`, `QĐ-111ap`). Throws
 * BudgetVersionNotFoundError, BudgetDecisionRefusedError, BudgetYearEndedError, BudgetOverAnnualCeilingError and BudgetCycleCurrencyMismatchError.
 */
@Injectable()
export class VersionDecisionJudge {
  constructor(
    private readonly versions: VersionRepo,
    private readonly proposals: ProposalRepo,
    private readonly facts: BudgetFactsService,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly access: VersionAccessService,
  ) {}

  async judge(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    id: string,
    decision: 'APPROVE' | 'RETURN',
  ): Promise<JudgedDecision> {
    const known = await this.versions.findById(id, tx);
    if (!known) throw new BudgetVersionNotFoundError();
    // An approval makes the check of the annual ceiling again (`4.7-02`): the cycle is locked before the versions, the order of the module.
    const ceiling = await this.lockCeilingOf(tx, known, decision);
    const siblings = await this.versions.lockAllOfYear(tx, known.costCenterId, known.year);
    const version = siblings.find((candidate) => candidate.id === id);
    if (!version) throw new BudgetVersionNotFoundError();
    // The approver who sent the proposal behind a version does not decide it, and nobody does in their place (`SoD-8`).
    const approver = await this.facts.usableSpendingApproverEmployeeId(tx);
    const proposal = version.proposalId ? await this.proposals.findById(version.proposalId, tx) : null;
    const { employeeId: decider, approverIsParty } = deciderOf(approver, proposal?.submittedByEmployeeId ?? null);
    const refusal = checkVersionDecision({
      actorIsDecider: decider !== null && decider === actor.employeeId,
      actorHasConflict: approverIsParty && actor.employeeId === approver,
      actorEmployeeId: actor.employeeId,
      createdByEmployeeId: version.createdByEmployeeId,
      sentByEmployeeId: version.sentByEmployeeId,
      state: version.state,
    });
    // Who may not decide is told first; then a year that has ended, whether or not its closure has run; then the state.
    if (refusal && refusal !== 'NOT_SENT') throw new BudgetDecisionRefusedError(refusal);
    const today = await this.facts.today(new Date(), tx);
    if (yearHasEnded(version.year, today)) throw new BudgetYearEndedError(version.year);
    if (refusal) throw new BudgetDecisionRefusedError(refusal);
    refuseRevision(version);
    await this.yearLock.lock(tx, version.costCenterId, [version.year]);
    await this.requireWithinCeiling(tx, ceiling, version);

    return { version, siblings, today };
  }

  /** The cycle of the year that an approval checks the ceiling against, locked; `undefined` for a decision that does not make the check. */
  private lockCeilingOf(
    tx: DbTx,
    known: VersionRecord,
    decision: 'APPROVE' | 'RETURN',
  ): Promise<CycleRecord | null | undefined> {
    return decision === 'APPROVE' ? this.access.lockCycleOfYear(tx, known) : Promise.resolve(undefined);
  }

  private async requireWithinCeiling(
    tx: DbTx,
    ceiling: CycleRecord | null | undefined,
    version: VersionRecord,
  ): Promise<void> {
    if (ceiling !== undefined) await this.access.requireWithinAnnualCeiling(tx, ceiling, version);
  }
}
