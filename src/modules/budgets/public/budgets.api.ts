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

  /** What each of the requests was committed for, one entry for each commitment, in one read: for a list that counts and adds them. */
  committedByRequests(requestIds: readonly string[]): Promise<CommittedAmount[]> {
    return this.commitments.committedBy(requestIds);
  }

  /** Whether the request holds a commitment, which is what lets Finance read it (`US-06-09` AC-2). */
  requestHoldsCommitment(requestId: string): Promise<boolean> {
    return this.commitments.heldFor(requestId);
  }
}
