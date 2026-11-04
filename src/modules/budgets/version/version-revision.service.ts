import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  BudgetDepartmentHasNoHeadError,
  BudgetNoCurrentError,
  BudgetVersionInFlightError,
  BudgetVersionNotFoundError,
  BudgetYearEndedError,
} from '../budget/budget.errors';
import { copiedLineOf, yearHasEnded } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { VersionLineRepo } from '../budget/version-line.repo';
import { VersionRepo, type VersionRecord } from '../budget/version.repo';
import { VersionViewService } from '../budget/version-view.service';
import type { RevisionBodyDto, VersionWire } from '../budget/budget.dto';
import { VersionFigures } from './version-figures.service';
import { VersionTrail } from './version-trail.service';

/**
 * A revision of the current budget as Finance builds it (`US-06-09`): the lines of the current version, the figures and the reason for the
 * change. It is begun only while somebody heads the department (`QĐ-92d(1)`), and the current budget stays what it is until the
 * spending approver approves the revision.
 */
@Injectable()
export class VersionRevisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly versions: VersionRepo,
    private readonly lines: VersionLineRepo,
    private readonly views: VersionViewService,
    private readonly facts: BudgetFactsService,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly figures: VersionFigures,
    private readonly trail: VersionTrail,
  ) {}

  /**
   * Throws BudgetNotFinanceError, BudgetCostCenterNotFoundError, FinanceSetupIncompleteError, BudgetYearEndedError,
   * BudgetNoCurrentError, BudgetDepartmentHasNoHeadError and BudgetVersionInFlightError.
   */
  async createRevision(actor: AuthenticatedPrincipal, body: RevisionBodyDto): Promise<VersionWire> {
    this.facts.requireFinance(actor);
    const fiscalStart = await this.facts.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const costCenter = await this.facts.costCenterInUse(body.costCenterId, tx);
      const today = await this.facts.today(new Date(), tx);
      if (yearHasEnded(body.year, today, fiscalStart)) throw new BudgetYearEndedError(body.year);
      await this.yearLock.lock(tx, costCenter.id, [body.year]);
      const current = await this.versions.current(costCenter.id, body.year, tx);
      if (!current) throw new BudgetNoCurrentError();
      // A revision is begun only while somebody heads the department; one begun or sent before that goes on (`QĐ-92d(1)`).
      if ((await this.facts.currentHeadOf(costCenter.departmentId, today, tx)) === null) {
        throw new BudgetDepartmentHasNoHeadError(costCenter.departmentId);
      }
      if (await this.versions.inFlight(costCenter.id, body.year, tx)) throw new BudgetVersionInFlightError();

      const figures = await this.figures.figures(
        tx,
        current.currency,
        {
          base: body.base,
          reserve: body.reserve,
          highValuePercent: body.highValuePercent,
          highValueAmount: body.highValueAmount,
          quarters: body.quarters,
        },
        current,
      );
      const lines = (await this.lines.allLines(current.id, tx)).map((line) => copiedLineOf(line, line));
      const id = await this.versions.insert(tx, {
        organizationId: current.organizationId,
        costCenterId: current.costCenterId,
        year: current.year,
        kind: 'REVISION',
        proposalId: null,
        basedOnVersionId: current.id,
        ...figures,
        currency: current.currency,
        reason: body.reason ?? null,
        createdByEmployeeId: actor.employeeId,
        now: new Date(),
        lines,
      });
      await this.trail.created(tx, actor, {
        id,
        organizationId: current.organizationId,
        kind: 'REVISION',
        costCenterId: current.costCenterId,
        year: current.year,
      });

      return this.views.wire(await this.requireIn(id, tx));
    });
  }

  private async requireIn(id: string, tx: DbTx): Promise<VersionRecord> {
    const version = await this.versions.findById(id, tx);
    if (!version) throw new BudgetVersionNotFoundError();

    return version;
  }
}
