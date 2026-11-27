import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetFactsRepo } from '../budget/budget-facts.repo';
import { CommitmentService } from '../commitment/commitment.service';
import { OutOfProcessSpendRecorderService } from '../invoice/out-of-process-spend-recorder.service';
import { PurchaseInvoiceRecorderService } from '../invoice/purchase-invoice-recorder.service';
import { InvoiceAllocationTransferService } from '../invoice/invoice-allocation-transfer.service';
import { K1YearStartApplicationService } from '../invoice/k1-year-start-application.service';
import { RunningUncommittedFactsService } from '../running-uncommitted/running-uncommitted-facts.service';
import { LicenseLotCostService } from '../shared-pool-line/license-lot-cost.service';
import type {
  CommittedAmount,
  CommitmentHoldInput,
  CommitmentReleaseInput,
  ExcessLicenseGrantInput,
  ExcessLicenseGrantRecorded,
  HeldAmount,
  HeldCommitment,
  K1TransferAllocationInput,
  K1YearStartApplyInput,
  LotWithdrawalAfterInvoiceInput,
  OutOfProcessSpendInput,
  OutOfProcessSpendRecorded,
  PurchaseInvoiceRecorded,
  PurchaseInvoiceRecordInput,
  RecordedPurchaseInvoiceInfo,
  ReleasedCommitment,
  RequestCommitment,
  SeatCommitment,
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
    private readonly purchaseInvoices: PurchaseInvoiceRecorderService,
    private readonly outOfProcessSpends: OutOfProcessSpendRecorderService,
    private readonly runningUncommitted: RunningUncommittedFactsService,
    private readonly k1YearStart: K1YearStartApplicationService,
    private readonly k1Transfer: InvoiceAllocationTransferService,
    private readonly lotCosts: LicenseLotCostService,
  ) {}

  /** The current budget of each of the years; a year without one is absent from the map, which is not a budget of nothing. */
  async yearFacts(costCenterId: string, years: readonly number[], tx?: DbTx): Promise<Map<number, YearBudgetFacts>> {
    const facts = await this.facts.yearFacts(costCenterId, years, tx);
    if (facts.size === 0) return facts;
    const running = await this.runningUncommitted.ofCostCenterYears(costCenterId, [...facts.keys()], tx);
    for (const [year, entry] of facts) {
      facts.set(year, { ...entry, runningUncommittedMinor: running.get(year) ?? 0n });
    }

    return facts;
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
   * The commitments still held of these requests for the years from `fromYear` (the years before are closed and left as they are), with their
   * rows locked until the transaction ends: what the release by day of one seat is worked out on (`RV-07`, `M-06`, `M-10`) before the caller
   * gives it back with `releaseForRequest` in the same transaction. Locks no request row and no year.
   */
  lockSeatCommitments(tx: DbTx, requestIds: readonly string[], fromYear: number): Promise<SeatCommitment[]> {
    return this.commitments.lockSeatCommitments(tx, requestIds, fromYear);
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

  /** What each of the requests was committed for, one entry for each commitment, in one read (in the caller's transaction when it has one): for a list that counts and adds them. */
  committedByRequests(requestIds: readonly string[], tx?: DbTx): Promise<CommittedAmount[]> {
    return this.commitments.committedBy(requestIds, tx);
  }

  /**
   * What each of the requests still holds, unspent and not given back, for the commitments that are held: what closing them would free.
   * One read that locks nothing, in the caller's transaction when it has one; a request that holds nothing is absent.
   */
  heldByRequests(requestIds: readonly string[], tx?: DbTx): Promise<HeldAmount[]> {
    return this.commitments.heldBy(requestIds, tx);
  }

  /** The commitments the request holds, the oldest year first, with what is left of each to be invoiced against (`PI-1`); one read that locks nothing. */
  commitmentsOfRequest(requestId: string, tx?: DbTx): Promise<RequestCommitment[]> {
    return this.commitments.commitmentsOf(requestId, tx);
  }

  /** Whether the request holds a commitment, which is what lets Finance read it (`US-06-09` AC-2). */
  requestHoldsCommitment(requestId: string): Promise<boolean> {
    return this.commitments.heldFor(requestId);
  }

  /**
   * The invoice Finance signed for a purchase (`PI-1`, `D3`) is written as the one invoice of that purchase, in the transaction of the signature, booked to
   * the month and the year the purchase pays for: into the commitment of the request for that year when the department that bears it is the
   * commitment's own, as an expense of that department with no commitment otherwise, and as a line of the subscription for a renewal. It is never
   * refused for being more than the budget (`C-08`). Throws PurchaseInvoiceRecordRefusedError.
   */
  recordPurchaseInvoice(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
  ): Promise<PurchaseInvoiceRecorded> {
    return this.purchaseInvoices.record(tx, actor, input);
  }

  /**
   * The money of a case outside the process (`SBF-07a`, R-45) is written as the one invoice of that case, in the transaction that closed it: what was
   * already spent, in dong, with a proof of payment, an expense with no commitment booked to the month it is recorded in and to the Cost Center that
   * bears it, or to none yet. It is never refused for being more than the budget (`C-08`). Throws OutOfProcessSpendRefusedError.
   */
  recordOutOfProcessSpend(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: OutOfProcessSpendInput,
  ): Promise<OutOfProcessSpendRecorded> {
    return this.outOfProcessSpends.record(tx, actor, input);
  }

  /**
   * Marks the pool variance of `purchaseInvoiceId` as resolved once its discrepancy case closes, keeping `invoices` append-only.
   * Returns true when a `pool_variance_in_review` invoice was resolved, false otherwise.
   */
  markPoolVarianceResolved(tx: DbTx, purchaseInvoiceId: string, resolvedAt?: Date): Promise<boolean> {
    return this.purchaseInvoices.markPoolVarianceResolved(tx, purchaseInvoiceId, resolvedAt);
  }

  /** Reads the recorded subscription id and pool variance figures (with current in-review status) of `purchaseInvoiceId`. */
  purchaseInvoiceInfo(purchaseInvoiceId: string, tx?: DbTx): Promise<RecordedPurchaseInvoiceInfo | null> {
    return this.purchaseInvoices.purchaseInvoiceInfo(purchaseInvoiceId, tx);
  }

  /** Acquires Tier 0 K1 allocation advisory locks (`k1-allocation:<key>:<year>`) ascending before commitment reads. */
  lockK1AllocationYears(tx: DbTx, subjectKeys: readonly string[], years: readonly number[]): Promise<void> {
    return this.k1YearStart.lockK1AllocationYears(tx, subjectKeys, years);
  }

  /** Applies existing K1 annual `invoice_allocations` to newly created 01/01 year-start commitments in the same tx. */
  applyK1YearStartAllocations(tx: DbTx, input: K1YearStartApplyInput): Promise<void> {
    return this.k1YearStart.applyYearStart(tx, input);
  }

  /** Transfers remaining K1 annual allocation months on replacement (`F8`) with `TRANSFER_OUT`/`TRANSFER_IN` and `D-16` guard. */
  transferK1AnnualAllocations(tx: DbTx, input: K1TransferAllocationInput): Promise<{ transferredMinor: bigint }> {
    return this.k1Transfer.transfer(tx, input);
  }

  /** Number of excess license charges already recorded on each lot id (used for F11 reservation checks). */
  chargedExcessCountsOfLots(lotIds: readonly string[], tx?: DbTx): Promise<Map<string, number>> {
    return this.lotCosts.chargedExcessCountsOfLots(lotIds, tx);
  }

  /** Records excess-license charge or own-request hold (`F10`) when a K4 key from a lot is granted. */
  recordExcessLotLicenseGrant(tx: DbTx, input: ExcessLicenseGrantInput): Promise<ExcessLicenseGrantRecorded> {
    return this.lotCosts.recordExcessLicenseGrant(tx, input);
  }

  /** Compensates a confirmed `REQUEST` lot invoice on group member withdrawal (`F13c`, `D-16`). */
  recordLotWithdrawalAfterInvoice(tx: DbTx, input: LotWithdrawalAfterInvoiceInput): Promise<void> {
    return this.purchaseInvoices.recordLotWithdrawalAfterInvoice(tx, input);
  }
}
