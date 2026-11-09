import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  BudgetCycleCurrencyMismatchError,
  BudgetCycleNotPublishedError,
  BudgetOverAnnualCeilingError,
  BudgetVersionNotEditableError,
  BudgetVersionNotFoundError,
  BudgetYearEndedError,
} from '../budget/budget.errors';
import { annualCheck, isEditable, yearHasEnded } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { VersionRepo, type VersionRecord } from '../budget/version.repo';
import { cycleAcceptsWork } from '../cycle/cycle.policy';
import { CycleRepo, type CycleRecord } from '../cycle/cycle.repo';

/**
 * How a change of a version gets hold of it: the row is locked, and what Finance may no longer change is refused in a fixed
 * order, so the answer does not depend on whether the closure of the year has run. A version of a fiscal year that has ended is
 * never changed (`BUDGET.YEAR_ENDED`, `QĐ-91c`); then only a draft, or one sent back to Finance, is changed, and not the draft that
 * a withdrawn or given-back proposal left behind.
 */
@Injectable()
export class VersionAccessService {
  constructor(
    private readonly versions: VersionRepo,
    private readonly facts: BudgetFactsService,
    private readonly cycles: CycleRepo,
  ) {}

  /** Only Finance changes a version. */
  begin(actor: AuthenticatedPrincipal): void {
    this.facts.requireFinance(actor);
  }

  /**
   * The spending approver who works, with the row of the grant locked `FOR SHARE` until the transaction ends: what a sending reads before
   * it locks a proposal or a version, so that a revocation that is being made and the sending take turns (`M6`).
   */
  usableApproverLocked(tx: DbTx): Promise<string | null> {
    return this.facts.usableSpendingApproverEmployeeId(tx, { forShare: true });
  }

  /** The version as it is in the transaction. Throws BudgetVersionNotFoundError. */
  async requireIn(tx: DbTx, id: string): Promise<VersionRecord> {
    const version = await this.versions.findById(id, tx);
    if (!version) throw new BudgetVersionNotFoundError();

    return version;
  }

  /** The version, locked, if Finance may still change it. Throws BudgetVersionNotFoundError, BudgetYearEndedError, BudgetVersionNotEditableError. */
  async lockEditable(tx: DbTx, id: string): Promise<VersionRecord> {
    const version = await this.lockOfOpenYear(tx, id);
    if (!isEditable(version.state, version.detachedAt !== null)) throw new BudgetVersionNotEditableError(version.state);

    return version;
  }

  /** The version, locked, if its fiscal year is still open; the state is left to the caller. */
  async lockOfOpenYear(tx: DbTx, id: string): Promise<VersionRecord> {
    const version = await this.versions.lockById(tx, id);
    if (!version) throw new BudgetVersionNotFoundError();
    const today = await this.facts.today(new Date(), tx);
    if (yearHasEnded(version.year, today)) throw new BudgetYearEndedError(version.year);

    return version;
  }

  /**
   * The cycle of the version's year, locked `FOR UPDATE` before any proposal or version row (the order of the module: cycle, proposal,
   * version, year), so that two sendings of two departments take turns and cannot both pass the annual check. Null for a year that
   * has ended (the sending is refused as ended later). Throws BudgetCycleNotPublishedError.
   */
  async lockCycleOf(tx: DbTx, version: Pick<VersionRecord, 'organizationId' | 'year'>): Promise<CycleRecord | null> {
    if (yearHasEnded(version.year, await this.facts.today(new Date(), tx))) return null;
    const cycle = await this.cycles.lockByYear(tx, version.organizationId, version.year, 'UPDATE');
    if (!cycle || !cycleAcceptsWork(cycle)) throw new BudgetCycleNotPublishedError(version.year);

    return cycle;
  }

  /**
   * The versions of the year, this one in the place of its own Cost Center's, add up to no more than the annual ceiling less the
   * shared-pool reserve (`R-I06`). Nothing to check without a cycle (a year that has ended). Throws BudgetOverAnnualCeilingError and
   * BudgetCycleCurrencyMismatchError.
   */
  async requireWithinAnnualCeiling(tx: DbTx, cycle: CycleRecord | null, version: VersionRecord): Promise<void> {
    if (cycle === null) return;
    const availableMinor = cycle.annualCeilingMinor - (cycle.sharedPoolReserveMinor ?? 0n);
    const counted = await this.versions.countedInYear(version.organizationId, version.year, tx);
    const verdict = annualCheck({
      cycleCurrency: cycle.currency,
      availableMinor,
      counted: counted.filter((other) => other.id !== version.id),
      sending: version,
    });
    if (verdict.kind === 'CURRENCY') throw new BudgetCycleCurrencyMismatchError(cycle.currency, verdict.currency);
    if (verdict.kind === 'OVER') throw new BudgetOverAnnualCeilingError(verdict.gapMinor, availableMinor);
  }
}
