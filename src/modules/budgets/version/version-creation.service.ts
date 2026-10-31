import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  BudgetCurrentExistsError,
  BudgetProposalNotFoundError,
  BudgetProposalStateError,
  BudgetVersionInFlightError,
  BudgetVersionNotFoundError,
  BudgetYearEndedError,
} from '../budget/budget.errors';
import { copiedLineOf, versionSourceOf, yearHasEnded } from '../budget/budget.policy';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo, type VersionRecord } from '../budget/version.repo';
import { VersionViewService } from '../budget/version-view.service';
import type { VersionBodyDto, VersionWire } from '../budget/budget.dto';
import { VersionFigures } from './version-figures.service';
import { VersionTrail } from './version-trail.service';

/**
 * The first version of a budget, made from the proposal that waits (or made again from a proposal whose version was refused),
 * as Finance builds it (`US-06-09`). Finance never edits a proposal and never makes a version current.
 */
@Injectable()
export class VersionCreationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly versions: VersionRepo,
    private readonly proposals: ProposalRepo,
    private readonly views: VersionViewService,
    private readonly facts: BudgetFactsService,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly figures: VersionFigures,
    private readonly trail: VersionTrail,
  ) {}

  /**
   * Throws BudgetNotFinanceError, BudgetProposalNotFoundError, FinanceSetupIncompleteError, BudgetYearEndedError,
   * BudgetProposalStateError, BudgetCurrentExistsError, BudgetVersionInFlightError, BudgetQuartersMismatchError and the money errors.
   */
  async createFromProposal(actor: AuthenticatedPrincipal, body: VersionBodyDto): Promise<VersionWire> {
    this.facts.requireFinance(actor);
    const fiscalStart = await this.facts.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      // The proposal row is locked first, as the head's successor and the sending of a version lock it, so they queue.
      const proposal = await this.proposals.lockById(tx, body.proposalId);
      if (!proposal) throw new BudgetProposalNotFoundError();
      await this.facts.costCenterInUse(proposal.costCenterId, tx);
      const today = await this.facts.today(new Date(), tx);
      if (yearHasEnded(proposal.year, today, fiscalStart)) throw new BudgetYearEndedError(proposal.year);
      const latest = await this.versions.latestOfProposal(proposal.id, tx);
      const source = versionSourceOf(proposal, latest?.state ?? null);
      if (source === null) throw new BudgetProposalStateError('REVIEW', proposal.state);
      await this.yearLock.lock(tx, proposal.costCenterId, [proposal.year]);
      if (await this.versions.current(proposal.costCenterId, proposal.year, tx)) throw new BudgetCurrentExistsError();
      if (await this.versions.inFlight(proposal.costCenterId, proposal.year, tx))
        throw new BudgetVersionInFlightError();

      const figures = await this.figures.figures(tx, proposal.currency, body);
      const lines = (await this.proposals.allLines(proposal.id, tx)).map((line) =>
        copiedLineOf(line, { proposalId: proposal.id, proposalPosition: line.position }),
      );

      const id = await this.versions.insert(tx, {
        organizationId: proposal.organizationId,
        costCenterId: proposal.costCenterId,
        year: proposal.year,
        kind: 'INITIAL',
        proposalId: proposal.id,
        basedOnVersionId: null,
        rejectedPredecessorId: source === 'AFTER_REFUSAL' ? (latest?.id ?? null) : null,
        ...figures,
        currency: proposal.currency,
        reason: null,
        createdByEmployeeId: actor.employeeId,
        now: new Date(),
        lines,
      });
      await this.trail.created(tx, actor, {
        id,
        organizationId: proposal.organizationId,
        kind: 'INITIAL',
        costCenterId: proposal.costCenterId,
        year: proposal.year,
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
