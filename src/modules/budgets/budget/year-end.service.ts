import { Injectable } from '@nestjs/common';
import { fiscalYearOf } from '../../../core/fiscal-year';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { closesAtYearEnd, yearEndOfVersion, yearHasEnded } from './budget.policy';
import { BudgetChangeListeners } from './budget-change-listeners';
import { BudgetNotifierService } from './budget-notifier.service';
import { BudgetSupportService } from './budget-support.service';
import { BudgetYearLockRepo } from './budget-year-lock.repo';
import { ProposalRepo } from './proposal.repo';
import { VersionRepo } from './version.repo';

/** What a pass of the closure did: how many Cost Center and year pairs it closed, and what it changed in them. */
export interface YearEndResult {
  years: number;
  /** The versions that were current and stay as the reference budget of their year. */
  expired: number;
  /** The versions that were being built, waited for a decision or were sent back, and never became current. */
  closedUnapproved: number;
  proposalsClosed: number;
}

const NOTHING: YearEndResult = { years: 0, expired: 0, closedUnapproved: 0, proposalsClosed: 0 };

/**
 * The closure of the fiscal year of the budgets (F62, `QĐ-91c`, `QĐ-91e`, spec I): for each Cost Center and each year that has ended
 * by the month the fiscal year begins in and the time zone of the organization, in one transaction of its own:
 * - the current version becomes `EXPIRED` and stays as the reference budget of the year, with no notice;
 * - a version that was being built, waited for a decision or was sent back becomes `EXPIRED` as one that never became current, with
 *   its audit by the system; a decision that was open on it ends without a decision record, and Finance (and the person who held
 *   that decision) are told, and the requests that wait for a version are told through the listeners;
 * - a proposal that was sent or given back and never used is closed, and the head of the department of today is told, or the first
 *   head the Super Admin names when there is none.
 * Running it again changes nothing. It locks the proposals, then the versions of the Cost Center and year by id, then the year, the
 * order of `decide` and `send`, so it never waits in a circle with a decision: whichever takes the rows first wins, and the other
 * finds the version in its new state.
 */
@Injectable()
export class BudgetYearEndService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly versions: VersionRepo,
    private readonly proposals: ProposalRepo,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly support: BudgetSupportService,
    private readonly notifier: BudgetNotifierService,
    private readonly listeners: BudgetChangeListeners,
    private readonly audit: AuditService,
  ) {}

  /** Closes every Cost Center and year that has ended by `now` and still holds something to close. `now` is a parameter for tests. */
  async closeEndedYears(now: Date = new Date()): Promise<YearEndResult> {
    const fiscalStart = await this.support.fiscalYearStartMonth();
    const fiscalYear = fiscalYearOf(await this.support.today(now), fiscalStart);
    const pairs = new Map<string, { costCenterId: string; year: number }>();
    for (const pair of [
      ...(await this.versions.endedYearsToClose(fiscalYear)),
      ...(await this.proposals.endedYearsToClose(fiscalYear)),
    ]) {
      pairs.set(`${pair.year}:${pair.costCenterId}`, pair);
    }

    const total: YearEndResult = { ...NOTHING };
    for (const pair of [...pairs.values()].sort(
      (a, b) => a.year - b.year || a.costCenterId.localeCompare(b.costCenterId),
    )) {
      const done = await this.closeYear(pair.costCenterId, pair.year, now, fiscalStart);
      total.years += done.years;
      total.expired += done.expired;
      total.closedUnapproved += done.closedUnapproved;
      total.proposalsClosed += done.proposalsClosed;
    }

    return total;
  }

  private async closeYear(costCenterId: string, year: number, now: Date, fiscalStart: number): Promise<YearEndResult> {
    return this.runner.run(async (tx) => {
      const today = await this.support.today(now, tx);
      if (!yearHasEnded(year, today, fiscalStart)) return NOTHING;
      const proposals = await this.proposals.lockAllOfYear(tx, costCenterId, year);
      const versions = await this.versions.lockAllOfYear(tx, costCenterId, year);
      // A version that never became current tells the requests that waited for it: they are locked before the year (F31).
      if (versions.some((version) => yearEndOfVersion(version.state)?.neverCurrent)) {
        await this.listeners.lockWaiting(tx, { costCenterId, year });
      }
      await this.yearLock.lock(tx, costCenterId, [year]);

      const result: YearEndResult = { years: 0, expired: 0, closedUnapproved: 0, proposalsClosed: 0 };
      const never: { versionId: string }[] = [];
      for (const version of versions) {
        const outcome = yearEndOfVersion(version.state);
        if (outcome === null) continue;
        await this.versions.expire(tx, version.id, { neverCurrent: outcome.neverCurrent, now });
        await this.audit.record(tx, {
          organizationId: version.organizationId,
          actorKind: 'SYSTEM',
          action: outcome.neverCurrent ? 'BUDGET_VERSION.CLOSED_UNAPPROVED' : 'BUDGET_VERSION.EXPIRED',
          resourceType: 'BUDGET_VERSION',
          resourceId: version.id,
          before: { state: version.state },
          after: { state: 'EXPIRED', neverCurrent: outcome.neverCurrent, costCenterId, year },
          correlationId: `budget-year-end:${costCenterId}:${year}`,
        });
        if (!outcome.neverCurrent) {
          result.expired += 1;
          continue;
        }
        result.closedUnapproved += 1;
        never.push({ versionId: version.id });
        const submitter =
          proposals.find((proposal) => proposal.id === version.proposalId)?.submittedByEmployeeId ?? null;
        await this.notifier.versionClosedUnapproved(
          tx,
          { ...version, state: 'EXPIRED', neverCurrent: true, expiredAt: now },
          { wasWaitingForDecision: version.state === 'SENT', proposalSubmittedBy: submitter },
        );
      }

      for (const proposal of proposals) {
        if (!closesAtYearEnd(proposal.state)) continue;
        await this.proposals.setClosed(tx, proposal.id, now);
        await this.audit.record(tx, {
          organizationId: proposal.organizationId,
          actorKind: 'SYSTEM',
          action: 'BUDGET_PROPOSAL.CLOSED_YEAR_END',
          resourceType: 'BUDGET_PROPOSAL',
          resourceId: proposal.id,
          before: { state: proposal.state },
          after: { state: 'CLOSED_FISCAL_YEAR_ENDED', costCenterId, year },
          correlationId: `budget-year-end:${costCenterId}:${year}`,
        });
        result.proposalsClosed += 1;
        await this.notifier.proposalClosedYearEnd(
          tx,
          { ...proposal, state: 'CLOSED_FISCAL_YEAR_ENDED', closedAt: now },
          today,
        );
      }

      // Whoever waits for a version that never became current hears of it once the year is closed.
      for (const { versionId } of never) await this.listeners.versionExpired(tx, { costCenterId, year, versionId });

      result.years = result.expired + result.closedUnapproved + result.proposalsClosed > 0 ? 1 : 0;

      return result;
    });
  }
}
