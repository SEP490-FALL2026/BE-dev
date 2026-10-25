import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../infrastructure/database/transaction-runner';
import { BudgetChangeListeners } from './budget/budget-change-listeners';
import { BudgetFactsRepo } from './budget/budget-facts.repo';
import { CommitmentService } from './budget/commitment.service';
import type {
  BudgetChangeListener,
  CommitmentHoldInput,
  CommitmentReleaseGuard,
  CommitmentReleaseInput,
  HeldCommitment,
  PlanLineFacts,
  PlanLineSummary,
  ReleasedCommitment,
  YearBudgetFacts,
} from './budgets.types';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';

/**
 * What other contexts use of the budgets (ADR-0016): the figures the check of a request reads, and the register of the
 * contexts that must hear when a budget changes. Nothing here changes a budget, and nothing here knows who listens.
 */
@Injectable()
export class BudgetsService {
  constructor(
    private readonly facts: BudgetFactsRepo,
    private readonly listeners: BudgetChangeListeners,
    private readonly commitments: CommitmentService,
  ) {}

  /** The current budget of each of the years; a year without one is absent from the map, which is not a budget of nothing. */
  yearFacts(costCenterId: string, years: readonly number[], tx?: DbTx): Promise<Map<number, YearBudgetFacts>> {
    return this.facts.yearFacts(costCenterId, years, tx);
  }

  /** The line a request names, read from the current version of its Cost Center and year; null when it is not there. */
  planLine(versionId: string, position: number, tx?: DbTx): Promise<PlanLineFacts | null> {
    return this.facts.planLine(versionId, position, tx);
  }

  /** The line at the position in the current version of the Cost Center and year, or null (`US-05-04` AC-12). */
  currentLine(costCenterId: string, year: number, position: number, tx?: DbTx): Promise<PlanLineFacts | null> {
    return this.facts.currentLine(costCenterId, year, position, tx);
  }

  /** One page of the lines of the current plan of the Cost Center and year, or null when the year has no budget. */
  currentLines(
    costCenterId: string,
    year: number,
    skip: number,
    take: number,
  ): Promise<{ currency: string; items: PlanLineSummary[]; total: number } | null> {
    return this.facts.currentLines(costCenterId, year, skip, take);
  }

  /**
   * The request holds the amount of each year against the budget of its Cost Center, in the transaction of the decision that
   * approved it (`US-06-04`). Throws BudgetCommitmentExistsError when it already holds one for a year.
   */
  holdForRequest(tx: DbTx, actor: AuthenticatedPrincipal, input: CommitmentHoldInput): Promise<HeldCommitment[]> {
    return this.commitments.hold(tx, actor, input);
  }

  /**
   * What the request holds goes back to the budget, in the transaction of what ended it or of the share withdrawn (`US-06-06`,
   * `US-05-08` AC-5, `US-05-17` AC-10). What became an expense stays. Throws BudgetCommitmentRefusedError for amounts that do
   * not fit what is held.
   */
  releaseForRequest(tx: DbTx, input: CommitmentReleaseInput): Promise<ReleasedCommitment[]> {
    return this.commitments.release(tx, input);
  }

  /** A context that knows when a request has ended asks to be heard before Finance lets a remainder go. */
  registerReleaseGuard(guard: CommitmentReleaseGuard): void {
    this.commitments.registerReleaseGuard(guard);
  }

  /** Whether the request holds a commitment, which is what lets Finance read it (`US-06-09` AC-2). */
  requestHoldsCommitment(requestId: string): Promise<boolean> {
    return this.commitments.heldFor(requestId);
  }

  /** A context asks to be told, in the transaction of the change, when a budget is decided or a plan line moves. */
  registerChangeListener(listener: BudgetChangeListener): void {
    this.listeners.register(listener);
  }
}
