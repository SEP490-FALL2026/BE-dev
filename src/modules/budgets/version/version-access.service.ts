import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  BudgetVersionNotEditableError,
  BudgetVersionNotFoundError,
  BudgetYearEndedError,
} from '../budget/budget.errors';
import { isEditable, yearHasEnded } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { VersionRepo, type VersionRecord } from '../budget/version.repo';

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
  ) {}

  /** Only Finance changes a version; answers the month the fiscal year starts in, which every change is judged against. */
  async begin(actor: AuthenticatedPrincipal): Promise<number> {
    this.facts.requireFinance(actor);

    return this.facts.fiscalYearStartMonth();
  }

  /** The version as it is in the transaction. Throws BudgetVersionNotFoundError. */
  async requireIn(tx: DbTx, id: string): Promise<VersionRecord> {
    const version = await this.versions.findById(id, tx);
    if (!version) throw new BudgetVersionNotFoundError();

    return version;
  }

  /** The version, locked, if Finance may still change it. Throws BudgetVersionNotFoundError, BudgetYearEndedError, BudgetVersionNotEditableError. */
  async lockEditable(tx: DbTx, id: string, fiscalStart: number): Promise<VersionRecord> {
    const version = await this.lockOfOpenYear(tx, id, fiscalStart);
    if (!isEditable(version.state, version.detachedAt !== null)) throw new BudgetVersionNotEditableError(version.state);

    return version;
  }

  /** The version, locked, if its fiscal year is still open; the state is left to the caller. */
  async lockOfOpenYear(tx: DbTx, id: string, fiscalStart: number): Promise<VersionRecord> {
    const version = await this.versions.lockById(tx, id);
    if (!version) throw new BudgetVersionNotFoundError();
    const today = await this.facts.today(new Date(), tx);
    if (yearHasEnded(version.year, today, fiscalStart)) throw new BudgetYearEndedError(version.year);

    return version;
  }
}
