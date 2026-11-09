import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetCurrentExistsError, BudgetVersionInFlightError, BudgetYearEndedError } from '../budget/budget.errors';
import { copiedLineOf, defaultReserveOf, yearHasEnded } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { VersionRepo } from '../budget/version.repo';
import { VersionViewService } from '../budget/version-view.service';
import type { VersionWire } from '../budget/budget.dto';
import { BaselineService } from '../cycle/baseline.service';
import { VersionTrail } from './version-trail.service';

/**
 * The first version of a department that nobody heads at the deadline, built by Finance from the baseline (`QĐ-100h`, `R-I05`): the
 * lines are the `Renew` lines the baseline gives, the base is their sum and the reserve its default share; the version says where it
 * came from (`BASELINE_NO_HEAD`) in every answer, and goes on like any other once a head is named.
 */
@Injectable()
export class VersionBaselineCreationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly versions: VersionRepo,
    private readonly views: VersionViewService,
    private readonly facts: BudgetFactsService,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly baselines: BaselineService,
    private readonly trail: VersionTrail,
  ) {}

  /**
   * Throws BudgetNotFinanceError, BudgetYearEndedError, BudgetBaselineVersionNotAllowedError, FinanceSetupIncompleteError,
   * BudgetCurrentExistsError and BudgetVersionInFlightError.
   */
  async create(actor: AuthenticatedPrincipal, input: { costCenterId: string; year: number }): Promise<VersionWire> {
    this.facts.requireFinance(actor);
    const defaultPercent = await this.facts.reserveDefaultPercent();

    return this.runner.run(async (tx) => {
      // One day for the whole use case: the check and the lines must not see two days if the transaction crosses midnight.
      const today = await this.facts.today(new Date(), tx);
      if (yearHasEnded(input.year, today)) throw new BudgetYearEndedError(input.year);
      // The cycle first (the order of the module), then the year.
      const allowed = await this.baselines.requireVersionAllowed(tx, input.costCenterId, input.year, today);
      await this.yearLock.lock(tx, input.costCenterId, [input.year]);
      if (await this.versions.current(input.costCenterId, input.year, tx)) throw new BudgetCurrentExistsError();
      if (await this.versions.inFlight(input.costCenterId, input.year, tx)) throw new BudgetVersionInFlightError();

      const lines = await this.baselines.renewalLinesOf(allowed.departmentId, input.year, today, tx);
      const baseMinor = lines.reduce((sum, line) => sum + line.amountMinor, 0n);
      const organizationId = await this.facts.organizationId(tx);
      const id = await this.versions.insert(tx, {
        organizationId,
        costCenterId: input.costCenterId,
        year: input.year,
        kind: 'INITIAL',
        proposalId: null,
        basedOnVersionId: null,
        origin: 'BASELINE_NO_HEAD',
        baseMinor,
        reserveMinor: defaultReserveOf(baseMinor, defaultPercent),
        currency: allowed.currency,
        reservePercent: defaultPercent,
        reserveReason: null,
        quarters: null,
        reason: null,
        createdByEmployeeId: actor.employeeId,
        now: new Date(),
        lines: lines.map((line) => copiedLineOf(line, { proposalId: null, proposalPosition: null })),
      });
      await this.trail.created(tx, actor, {
        id,
        organizationId,
        kind: 'INITIAL',
        costCenterId: input.costCenterId,
        year: input.year,
      });
      const created = await this.versions.findById(id, tx);

      return this.views.wire(created as NonNullable<typeof created>);
    });
  }
}
