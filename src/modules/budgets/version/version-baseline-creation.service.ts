import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetCurrentExistsError, BudgetVersionInFlightError, BudgetYearEndedError } from '../budget/budget.errors';
import { yearHasEnded } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { VersionRepo } from '../budget/version.repo';
import { VersionViewService } from '../budget/version-view.service';
import type { VersionBodyDto, VersionWire } from '../budget/budget.dto';
import { BaselineService } from '../cycle/baseline.service';
import { VersionFigures } from './version-figures.service';
import { VersionTrail } from './version-trail.service';

/**
 * The version of a department that has no proposal at the deadline (a head that sent none, or a department made after it), built by
 * Finance from the baseline (`QĐ-111bb`, `R-11`): one figure for the year and no line; the base is what Finance gives, or what the Cost
 * Center carries into the year when it gives none (zero until the requests context tells it), and the reserve its share; the version says
 * where it came from (`BASELINE_NO_PROPOSAL`, `noProposalSubmitted`) in every answer, and goes on like any other.
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
    private readonly figures: VersionFigures,
  ) {}

  /**
   * Throws BudgetNotFinanceError, BudgetYearEndedError, BudgetBaselineVersionNotAllowedError, FinanceSetupIncompleteError,
   * BudgetCurrentExistsError and BudgetVersionInFlightError.
   */
  async create(
    actor: AuthenticatedPrincipal,
    input: Extract<VersionBodyDto, { source: 'BASELINE' }>,
  ): Promise<VersionWire> {
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

      const carriedOverMinor = await this.figures.carriedOverOf(input.costCenterId, input.year, tx);
      const figures = await this.figures.figures(tx, allowed.currency, { ...input, defaultPercent, carriedOverMinor });
      const organizationId = await this.facts.organizationId(tx);
      const id = await this.versions.insert(tx, {
        organizationId,
        costCenterId: input.costCenterId,
        year: input.year,
        kind: 'INITIAL',
        proposalId: null,
        basedOnVersionId: null,
        origin: 'BASELINE_NO_PROPOSAL',
        ...figures,
        currency: allowed.currency,
        reason: null,
        createdByEmployeeId: actor.employeeId,
        now: new Date(),
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
