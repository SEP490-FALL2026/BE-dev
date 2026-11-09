import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetFactsRepo } from '../budget/budget-facts.repo';
import { CommitmentService } from '../commitment/commitment.service';
import type {
  CommittedAmount,
  CommitmentHoldInput,
  CommitmentReleaseInput,
  HeldCommitment,
  ReleasedCommitment,
  YearBudgetFacts,
  YearStartHoldInput,
  YearStartHoldResult,
} from './budgets.types';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';

/**
 * What other contexts use of the budgets (ADR-0016): the figures the check of a request reads and the commitments a request
 * holds. Nothing here changes a budget, and nothing here knows who listens: the contexts that must hear when a budget changes
 * use `public/budgets.extension-points.ts`.
 */
@Injectable()
export class BudgetsApi {
  constructor(
    private readonly facts: BudgetFactsRepo,
    private readonly commitments: CommitmentService,
  ) {}

  /** The current budget of each of the years; a year without one is absent from the map, which is not a budget of nothing. */
  yearFacts(costCenterId: string, years: readonly number[], tx?: DbTx): Promise<Map<number, YearBudgetFacts>> {
    return this.facts.yearFacts(costCenterId, years, tx);
  }

  /**
   * The request holds one commitment, for the current fiscal year, against the approved budget of its Cost Center, in the transaction of the
   * decision that approved it (`US-06-04`, `FR-5.8`): `items` is exactly one entry, above nothing, of the current year. Throws
   * BudgetCommitmentNotHoldableError (BUDGET.COMMITMENT_NOT_HOLDABLE: not one year, not the current year, not above nothing, or no approved
   * version of the year) and BudgetCommitmentExistsError when it already holds one for the year.
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

  /**
   * The pass of 01/01 holds one commitment for the new year for each request (`FR-5.8`(6), `QĐ-109a`), in the transaction of the caller, which holds
   * the rows of the requests locked before it calls (the order of the locks of this context: the request, then the year). A request that holds one for
   * the year already is left as it was; one whose Cost Center has no approved budget of the year holds it waiting for a budget, attached when a
   * version is approved. Nothing is judged against the budget. Throws BudgetCommitmentNotHoldableError for an amount that is not above nothing.
   */
  holdYearStart(tx: DbTx, input: YearStartHoldInput): Promise<YearStartHoldResult> {
    return this.commitments.holdYearStart(tx, input);
  }

  /** The requests, among these, that hold a commitment for the year already, whatever its state and origin, in one read. */
  listRequestsHoldingYear(tx: DbTx, requestIds: readonly string[], year: number): Promise<Set<string>> {
    return this.commitments.requestsHoldingYear(tx, requestIds, year);
  }

  /** What each of the requests was committed for, one entry for each commitment, in one read: for a list that counts and adds them. */
  committedByRequests(requestIds: readonly string[]): Promise<CommittedAmount[]> {
    return this.commitments.committedBy(requestIds);
  }

  /** Whether the request holds a commitment, which is what lets Finance read it (`US-06-09` AC-2). */
  requestHoldsCommitment(requestId: string): Promise<boolean> {
    return this.commitments.heldFor(requestId);
  }
}
