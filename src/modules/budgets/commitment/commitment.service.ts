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
  YearStartHoldInput,
  YearStartHoldResult,
} from '../public/budgets.types';
import {
  BudgetCommitmentExistsError,
  BudgetCommitmentNotFoundError,
  BudgetCommitmentNotHoldableError,
  BudgetCommitmentRefusedError,
} from '../budget/budget.errors';
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
import { CommitmentRepo } from '../budget/commitment.repo';
import { InvoiceRepo } from '../budget/invoice.repo';
import type { CommittedAmount } from '../public/budgets.types';
import type { CommitmentWire, ReleaseWire } from './commitment.dto';

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
    private readonly invoices: InvoiceRepo,
  ) {}

  /**
   * Money goes back to the budget because the request ended or a share of it was withdrawn, in the transaction of that event
   * (`US-06-06` AC-2, AC-3, `US-05-08` AC-5, `US-05-17` AC-10). The system does it, so there is no actor. What became an expense
   * stays one, and a request that holds nothing releases nothing. Throws BudgetCommitmentRefusedError.
   */
  async release(tx: DbTx, input: CommitmentReleaseInput): Promise<ReleasedCommitment[]> {
    const rows = await this.commitments.lockOfRequest(tx, input.requestId);
    const plan = planRelease(rows, input.amounts);
    if (!plan.ok) throw new BudgetCommitmentRefusedError(plan.refusal, plan.year ?? null);

    const done: ReleasedCommitment[] = [];
    for (const item of plan.items) {
      const row = rows.find((candidate) => candidate.id === item.id);
      if (!row) continue;
      done.push(
        await this.give(tx, null, row, item, {
          reason: input.reason,
          reasonText: null,
          now: input.now,
          requestId: input.requestId,
        }),
      );
    }

    return done;
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
      await this.give(tx, actor, row, plan.items[0], {
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

    const held = await this.commitments.hold(tx, input);
    for (const commitment of held) {
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
   * of each is written by the system; a request that already holds one for the year is left as it was and told back.
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
    const result: YearStartHoldResult = { created: [], alreadyHeld: [] };
    const ordered = [...input.items].sort(
      (a, b) => a.costCenterId.localeCompare(b.costCenterId) || a.requestId.localeCompare(b.requestId),
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
      result.created.push({
        requestId: item.requestId,
        commitmentId: held.id,
        costCenterId: item.costCenterId,
        attachedVersionId: held.attachedVersionId,
      });
      await this.audit.record(tx, {
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

    return result;
  }

  /** The requests, among these, that hold a commitment for the year already, in one read. */
  requestsHoldingYear(tx: DbTx, requestIds: readonly string[], year: number): Promise<Set<string>> {
    return this.commitments.requestsHoldingYear(tx, requestIds, year);
  }

  /** What each of the requests was committed for (one entry for each commitment), in one read. */
  committedBy(requestIds: readonly string[]): Promise<CommittedAmount[]> {
    return this.commitments.amountsOfRequests(requestIds);
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
    const invoiced = await this.invoices.figuresOf(rows.map((row) => row.id));
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
