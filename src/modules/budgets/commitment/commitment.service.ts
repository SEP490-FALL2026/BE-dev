import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import {
  CommitmentReleaseGuardHook,
  CommitmentRequestFactsHook,
  type CommitmentRequestView,
} from '../public/budgets.extension-points';
import type {
  CommitmentHoldInput,
  CommitmentReleaseInput,
  CommitmentReleaseReason,
  HeldCommitment,
  ReleasedCommitment,
  SeatCommitment,
  YearStartHoldInput,
  YearStartHoldResult,
} from '../public/budgets.types';
import { BudgetCommitmentNotFoundError, BudgetCommitmentRefusedError } from '../budget/budget.errors';
import { BudgetCommitmentExistsError, BudgetCommitmentNotHoldableError } from '../public/budgets.errors';
import { checkHoldable } from './commitment-hold.policy';
import { fiscalYearOf } from '../../../core/fiscal-year';
import {
  heldOf,
  planRelease,
  planRemainder,
  type PlannedRelease,
  type ReleasePlan,
} from '../budget/commitment-release.policy';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { CommitmentRepo, type LockedCommitmentOfRequest } from '../budget/commitment.repo';
import { ThresholdAlertService } from '../threshold/threshold-alert.service';
import type { CommittedAmount, HeldAmount, RequestCommitment } from '../public/budgets.types';
import type { CommitmentWire, ReleaseWire } from './commitment.dto';
import {
  monthRowsOf,
  spreadBySeatMonthly,
  spreadRelease,
  spreadRemainder,
  type MonthlySliceState,
} from './month/commitment-month.policy';
import { CommitmentMonthService } from './month/commitment-month.service';

/**
 * What a request holds against the budget (`US-06-04`, `US-06-07`, `BR-MF1-07d`): one commitment, for the current fiscal year, made when the
 * spending approver approves it, in the transaction of the decision, attached to the approved version of that year. It is never made for
 * another year (the part of next year is the commitment made on 01/01), for an amount that is not above nothing, or without an approved
 * version (`FR-5.8a`: the one commitment that waits for a budget is the one made on 01/01). Commitments written before this rule, of a later
 * year or waiting for a budget, stay as they are (`Q-27`). Finance reads the commitments and has nothing to confirm.
 */
@Injectable()
export class CommitmentService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly commitments: CommitmentRepo,
    private readonly facts: BudgetFactsService,
    private readonly audit: AuditApi,
    private readonly releaseGuard: CommitmentReleaseGuardHook,
    private readonly requestFacts: CommitmentRequestFactsHook,
    private readonly commitmentMonths: CommitmentMonthService,
    private readonly thresholds: ThresholdAlertService,
  ) {}

  /**
   * Money goes back to the budget because the request ended or a share of it was withdrawn, in the transaction of that event
   * (`US-06-06` AC-2, AC-3, `US-05-08` AC-5, `US-05-17` AC-10). The system does it, so there is no actor. What became an expense
   * stays one, and a request that holds nothing releases nothing. With a `reference`, a commitment that already gave money back for the same
   * reason and reference gives nothing again, and the reference is kept on the release. Throws BudgetCommitmentRefusedError.
   */
  async release(tx: DbTx, input: CommitmentReleaseInput): Promise<ReleasedCommitment[]> {
    const rows = await this.commitments.lockOfRequest(tx, input.requestId);
    const plan = planRelease(rows, input.amounts);
    if (!plan.ok) throw new BudgetCommitmentRefusedError(plan.refusal, plan.year ?? null);
    const reference = input.reference ?? null;
    const already =
      reference === null
        ? new Set<string>()
        : await this.commitments.releasedFor(
            tx,
            plan.items.map((item) => item.id),
            { reason: input.reason, reference },
          );

    const done: ReleasedCommitment[] = [];
    for (const item of plan.items) {
      const row = rows.find((candidate) => candidate.id === item.id);
      if (!row || already.has(item.id)) continue;
      const namedAmount = input.amounts?.find((a) => a.year === item.year);
      const released = await this.releaseItemWithSlices(tx, row, item, namedAmount, {
        reason: input.reason,
        reasonText: reference,
        now: input.now,
        requestId: input.requestId,
      });
      if (released !== null) done.push(released);
    }

    return done;
  }

  private async releaseItemWithSlices(
    tx: DbTx,
    row: LockedCommitmentOfRequest,
    item: PlannedRelease,
    namedAmount: NonNullable<CommitmentReleaseInput['amounts']>[number] | undefined,
    event: { reason: CommitmentReleaseReason | 'REMAINDER'; reasonText: string | null; now: Date; requestId: string },
  ): Promise<ReleasedCommitment | null> {
    const slices = await this.commitmentMonths.lockOfCommitment(tx, row.id);
    if (slices.length === 0) return this.give(tx, null, row, item, event);

    const spread = this.pickSpread(slices, item.takeMinor, row.seatMonthlyMinor, namedAmount);
    if (spread.totalTakenMinor <= 0n) return null;
    for (const alloc of spread.allocations) {
      await this.commitmentMonths.addReleased(tx, row.id, alloc.month, alloc.takeMinor);
    }
    const adjusted: PlannedRelease = {
      ...item,
      takeMinor: spread.totalTakenMinor,
      leftMinor: heldOf(row) - spread.totalTakenMinor,
    };
    return this.give(tx, null, row, adjusted, event);
  }

  private pickSpread(
    slices: readonly MonthlySliceState[],
    takeMinor: bigint,
    seatMonthlyMinor: bigint | null,
    namedAmount: NonNullable<CommitmentReleaseInput['amounts']>[number] | undefined,
  ) {
    if (namedAmount?.months && namedAmount.months.length > 0) {
      return spreadRelease(slices, namedAmount.months);
    }
    if (namedAmount === undefined) {
      return spreadRemainder(slices, takeMinor);
    }
    return spreadBySeatMonthly(slices, takeMinor, seatMonthlyMinor);
  }

  /**
   * The commitments still held of these requests for the years from `fromYear`, locked until the transaction ends: what the release by day
   * of one seat is worked out on (`RV-07`, `M-10`) before it is given back with `release`.
   */
  async lockSeatCommitments(tx: DbTx, requestIds: readonly string[], fromYear: number): Promise<SeatCommitment[]> {
    const rows = await this.commitments.lockSeatCommitmentsWithIds(tx, requestIds, fromYear);
    const result: SeatCommitment[] = [];
    for (const { id, ...commitment } of rows) {
      const slices = await this.commitmentMonths.lockOfCommitment(tx, id);
      result.push(slices.length > 0 ? { ...commitment, months: slices.map((s) => s.month) } : commitment);
    }
    return result;
  }

  /**
   * Finance lets what is left of a commitment go, with a reason, once the request has ended (`US-06-06` AC-6). Throws
   * BudgetCommitmentNotFoundError and BudgetCommitmentRefusedError.
   */
  async releaseRemainder(actor: AuthenticatedPrincipal, id: string, reason: string): Promise<CommitmentWire> {
    await this.runner.run(async (tx) => {
      const row = await this.commitments.lockById(tx, id);
      if (!row) throw new BudgetCommitmentNotFoundError();
      const plan: ReleasePlan = planRemainder(row, reason);
      if (!plan.ok) throw new BudgetCommitmentRefusedError(plan.refusal, plan.year ?? null);
      // The context that knows whether the request has ended is asked before the remainder goes (`US-06-06` AC-6).
      if (!(await this.releaseGuard.get().canReleaseRemainder(row.requestId))) {
        throw new BudgetCommitmentRefusedError('REQUEST_OPEN');
      }
      let item = plan.items[0];
      const slices = await this.commitmentMonths.lockOfCommitment(tx, row.id);
      if (slices.length > 0) {
        const spread = spreadRemainder(slices, item.takeMinor);
        for (const alloc of spread.allocations) {
          await this.commitmentMonths.addReleased(tx, row.id, alloc.month, alloc.takeMinor);
        }
        item = { ...item, takeMinor: spread.totalTakenMinor, leftMinor: heldOf(row) - spread.totalTakenMinor };
      }
      await this.give(tx, actor, row, item, {
        reason: 'REMAINDER',
        reasonText: reason.trim(),
        now: new Date(),
        requestId: row.requestId,
      });
    });

    return (await this.page({ page: 1, pageSize: 1, id })).items[0];
  }

  /** What went back to the budget from one commitment, the oldest first. */
  async pageReleases(id: string, query: { page: number; pageSize: number }): Promise<Page<ReleaseWire>> {
    if (!(await this.commitments.exists(id))) throw new BudgetCommitmentNotFoundError();
    const { rows, total } = await this.commitments.pageReleases(id, (query.page - 1) * query.pageSize, query.pageSize);
    const people = await this.facts.people(rows.map((row) => row.releasedByEmployeeId));
    const commitment = await this.page({ page: 1, pageSize: 1, id });
    const money = await this.facts.formatter(commitment.items[0].amount.currency);
    const items = rows.map((row): ReleaseWire => ({
      id: row.id,
      amount: money(row.amountMinor),
      reason: row.reason,
      reasonText: row.reasonText,
      releasedBy: row.releasedByEmployeeId ? (people.get(row.releasedByEmployeeId) ?? null) : null,
      releasedAt: row.releasedAt.toISOString(),
    }));

    return pageOf(items, total, query.page, query.pageSize);
  }

  private async give(
    tx: DbTx,
    actor: AuthenticatedPrincipal | null,
    row: {
      id: string;
      year: number;
      amountMinor: bigint;
      releasedMinor: bigint;
      appliedMinor: bigint;
      state: 'HELD' | 'RELEASED' | 'EXPENSED';
      organizationId: string;
    },
    item: PlannedRelease,
    event: { reason: CommitmentReleaseReason | 'REMAINDER'; reasonText: string | null; now: Date; requestId: string },
  ): Promise<ReleasedCommitment> {
    const result = await this.commitments.release(tx, row, {
      takeMinor: item.takeMinor,
      reason: event.reason,
      reasonText: event.reasonText,
      releasedByEmployeeId: actor?.employeeId ?? null,
      now: event.now,
    });
    const after = {
      requestId: event.requestId,
      year: row.year,
      amountMinor: item.takeMinor.toString(),
      heldMinor: result.heldMinor.toString(),
      reason: event.reason,
      reasonText: event.reasonText,
    };
    await this.audit.record(
      tx,
      actor
        ? budgetAuditEvent(actor, row.organizationId, 'BUDGET_COMMITMENT.RELEASED', 'BUDGET_COMMITMENT', row.id, after)
        : {
            organizationId: row.organizationId,
            actorKind: 'SYSTEM',
            action: 'BUDGET_COMMITMENT.RELEASED',
            resourceType: 'BUDGET_COMMITMENT',
            resourceId: row.id,
            before: null,
            after,
            correlationId: event.requestId,
          },
    );

    return {
      id: row.id,
      year: row.year,
      releasedMinor: item.takeMinor,
      heldMinor: result.heldMinor,
      released: result.released,
    };
  }

  /**
   * Throws BudgetCommitmentNotHoldableError (not one year, not the current year, not above nothing, or no approved version of the year) and
   * BudgetCommitmentExistsError when the request already holds one for the year of the input. Nothing is written when it throws.
   */
  async hold(tx: DbTx, actor: AuthenticatedPrincipal, input: CommitmentHoldInput): Promise<HeldCommitment[]> {
    const today = await this.facts.today(input.now, tx);
    const refusal = checkHoldable({ items: input.items, currentYear: fiscalYearOf(today) });
    if (refusal) throw new BudgetCommitmentNotHoldableError(refusal, input.items[0]?.year ?? null);
    const taken = await this.commitments.yearsHeldBy(
      tx,
      input.requestId,
      input.items.map((item) => item.year),
    );
    if (taken.length > 0) throw new BudgetCommitmentExistsError(taken[0]);

    // What the Cost Center uses is read before and after the commitment, with the year locked, to tell the threshold the commitment crosses (`RV-2`).
    const watch = await this.thresholds.watch(
      tx,
      input.items.map((item) => ({ costCenterId: input.costCenterId, year: item.year })),
    );
    const held = await this.commitments.hold(tx, input);
    await this.thresholds.settle(tx, watch, input.now);
    for (const commitment of held) {
      const slices = monthRowsOf({
        commitmentId: commitment.id,
        year: commitment.year,
        amountMinor: commitment.amountMinor,
        seatMonthlyMinor: input.seatMonthlyMinor,
        months: input.months ?? [],
      });
      if (slices.length > 0) await this.commitmentMonths.insertMany(tx, slices);
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, input.organizationId, 'BUDGET_COMMITMENT.CREATED', 'BUDGET_COMMITMENT', commitment.id, {
          requestId: input.requestId,
          costCenterId: input.costCenterId,
          year: commitment.year,
          amountMinor: commitment.amountMinor.toString(),
          attachedVersionId: commitment.attachedVersionId,
          unattachedReason: commitment.attachedVersionId === null ? 'NO_BUDGET' : null,
          snapshotCheckId: input.snapshotCheckId,
        }),
      );
    }

    return held;
  }

  /**
   * The commitments of 01/01 (`FR-5.8`(6), `QĐ-109a`): one for each request that does not hold one for the year, in the transaction of the pass, which
   * holds the rows of the requests. Cost Centers are taken in order of id, so two passes never wait for each other's years in a circle. The audit
   * of each is written by the system; a request that already holds one for the year is left as it was and told back, and one whose amount is
   * not in the currency of the approved budget of the year is refused and told back (never written).
   */
  async holdYearStart(tx: DbTx, input: YearStartHoldInput): Promise<YearStartHoldResult> {
    for (const item of input.items) {
      if (item.amountMinor <= 0n) throw new BudgetCommitmentNotHoldableError('NOT_POSITIVE', input.year);
    }
    const already = await this.commitments.requestsHoldingYear(
      tx,
      input.items.map((item) => item.requestId),
      input.year,
    );
    const result: YearStartHoldResult = { created: [], alreadyHeld: [], refused: [] };
    const ordered = [...input.items].sort(
      (a, b) => a.costCenterId.localeCompare(b.costCenterId) || a.requestId.localeCompare(b.requestId),
    );
    // The threshold the commitments of the pass cross is told once for each Cost Center, on what it used before the pass and after it (`RV-2`).
    const watch = await this.thresholds.watch(
      tx,
      ordered
        .filter((item) => !already.has(item.requestId))
        .map((item) => ({ costCenterId: item.costCenterId, year: input.year })),
    );
    for (const item of ordered) {
      if (already.has(item.requestId)) {
        result.alreadyHeld.push(item.requestId);
        continue;
      }
      const held = await this.commitments.holdYearStart(tx, {
        organizationId: input.organizationId,
        requestId: item.requestId,
        costCenterId: item.costCenterId,
        year: input.year,
        amountMinor: item.amountMinor,
        currency: item.currency,
        seatMonthlyMinor: item.seatMonthlyMinor,
        now: input.now,
      });
      if (held === null) {
        result.refused.push({ requestId: item.requestId, reason: 'CURRENCY_MISMATCH' });
        continue;
      }
      const slices = monthRowsOf({
        commitmentId: held.id,
        year: input.year,
        amountMinor: item.amountMinor,
        seatMonthlyMinor: item.seatMonthlyMinor,
        months: item.months ?? [],
      });
      if (slices.length > 0) await this.commitmentMonths.insertMany(tx, slices);
      result.created.push({
        requestId: item.requestId,
        commitmentId: held.id,
        costCenterId: item.costCenterId,
        attachedVersionId: held.attachedVersionId,
      });
      await this.recordYearStart(tx, input, item, held);
    }
    await this.thresholds.settle(tx, watch, input.now);

    return result;
  }

  /** The audit of one commitment of 01/01, written by the system. */
  private recordYearStart(
    tx: DbTx,
    input: YearStartHoldInput,
    item: YearStartHoldInput['items'][number],
    held: { id: string; attachedVersionId: string | null },
  ): Promise<void> {
    return this.audit.record(tx, {
      organizationId: input.organizationId,
      actorKind: 'SYSTEM',
      action: 'BUDGET_COMMITMENT.CREATED',
      resourceType: 'BUDGET_COMMITMENT',
      resourceId: held.id,
      before: null,
      after: {
        requestId: item.requestId,
        costCenterId: item.costCenterId,
        year: input.year,
        amountMinor: item.amountMinor.toString(),
        seatMonthlyMinor: item.seatMonthlyMinor.toString(),
        origin: 'YEAR_START',
        attachedVersionId: held.attachedVersionId,
        unattachedReason: held.attachedVersionId === null ? 'NO_BUDGET' : null,
      },
      correlationId: item.requestId,
    });
  }

  /** The requests, among these, that hold a commitment for the year already, in one read. */
  requestsHoldingYear(tx: DbTx, requestIds: readonly string[], year: number): Promise<Set<string>> {
    return this.commitments.requestsHoldingYear(tx, requestIds, year);
  }

  /**
   * The commitments Finance reads, or the head of a department reads for the Cost Centers of the departments they head (`RV-3`, `QĐ-111aj`): `longTerm` narrows them to what is still held of the
   * `year` that is asked for, the year of the review (the rights that are running, whenever the commitment was made: the review is not told by the day it is read), which the quarterly review shows
   * beside the use. A head asks for a Cost Center that is not theirs and gets an empty page.
   */
  async list(
    actor: AuthenticatedPrincipal,
    query: Omit<Parameters<CommitmentService['page']>[0], 'costCenterIds' | 'heldOnly'> & { longTerm?: boolean },
  ): Promise<Page<CommitmentWire>> {
    const { longTerm, ...rest } = query;
    const today = await this.facts.today(new Date());
    const scope = actor.roles.includes('FINANCE')
      ? {}
      : { costCenterIds: await this.facts.headedCostCenters(actor.employeeId, today) };

    return this.page({
      ...rest,
      ...scope,
      ...(longTerm === true ? { heldOnly: true } : {}),
    });
  }

  /** What each of the requests was committed for (one entry for each commitment), in one read. */
  committedBy(requestIds: readonly string[], tx?: DbTx): Promise<CommittedAmount[]> {
    return this.commitments.amountsOfRequests(requestIds, tx);
  }

  /** What each of the requests still holds and has not spent or given back, in one read that locks nothing (a preview of a release). */
  heldBy(requestIds: readonly string[], tx?: DbTx): Promise<HeldAmount[]> {
    return this.commitments.heldOfRequests(requestIds, tx);
  }

  /** The commitments of the request with what is left of each (`PI-1`), in the caller's transaction when it has one. */
  commitmentsOf(requestId: string, tx?: DbTx): Promise<RequestCommitment[]> {
    return this.commitments.ofRequest(requestId, tx);
  }

  async heldFor(requestId: string): Promise<boolean> {
    return this.commitments.existsFor(requestId);
  }

  /** The commitments, for Finance. */
  async page(query: {
    id?: string;
    attached?: boolean;
    year?: number;
    costCenterId?: string;
    costCenterIds?: readonly string[];
    heldOnly?: boolean;
    requestId?: string;
    state?: 'HELD' | 'RELEASED' | 'EXPENSED';
    page: number;
    pageSize: number;
  }): Promise<Page<CommitmentWire>> {
    const { rows, total } = await this.commitments.page({
      ...query,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const centers = await this.facts.costCenters(rows.map((row) => row.costCenterId));
    // What the invoices of the whole page cost and whether one is flagged, in one read.
    const invoiced = await this.commitments.invoiceFiguresOf(rows.map((row) => row.id));
    // The requests of the whole page in one read, never one for each commitment.
    const requests =
      rows.length === 0
        ? new Map<string, CommitmentRequestView>()
        : await this.requestFacts.get().factsOf([...new Set(rows.map((row) => row.requestId))]);
    const money = new Map<string, (minor: bigint) => { amount: string; currency: string }>();
    for (const code of new Set(rows.map((row) => row.currency))) money.set(code, await this.facts.formatter(code));

    const items = rows.map((row): CommitmentWire => {
      const center = centers.get(row.costCenterId);
      if (!center) throw new Error(`The commitment ${row.id} points at a missing Cost Center.`);

      return {
        id: row.id,
        requestId: row.requestId,
        costCenter: center,
        year: row.year,
        amount: (money.get(row.currency) as (minor: bigint) => { amount: string; currency: string })(row.amountMinor),
        released: (money.get(row.currency) as (minor: bigint) => { amount: string; currency: string })(
          row.releasedMinor,
        ),
        held: (money.get(row.currency) as (minor: bigint) => { amount: string; currency: string })(
          row.state === 'HELD' ? heldOf(row) : 0n,
        ),
        state: row.state,
        request: requestWire(requests.get(row.requestId)),
        invoiced: (money.get(row.currency) as (minor: bigint) => { amount: string; currency: string })(
          invoiced.get(row.id)?.costMinor ?? 0n,
        ),
        invoiceCount: invoiced.get(row.id)?.count ?? 0,
        hasDiscrepancy: invoiced.get(row.id)?.flagged ?? false,
        attached: row.attachedVersionId !== null,
        attachedAt: row.attachedAt?.toISOString() ?? null,
        unattachedReason: row.unattachedReason === 'NO_BUDGET' ? 'NO_BUDGET' : null,
        createdAt: row.createdAt.toISOString(),
      };
    });

    return pageOf(items, total, query.page, query.pageSize);
  }
}

/** What a commitment shows of its request, or nothing when the request cannot be read. */
function requestWire(view: CommitmentRequestView | undefined): CommitmentWire['request'] {
  if (!view) return null;

  return {
    id: view.id,
    software: view.software,
    plan: view.plan,
    requester: view.requester,
    beneficiaryCount: view.beneficiaryCount,
    spendApprovedAt: view.spendApprovedAt?.toISOString() ?? null,
  };
}
