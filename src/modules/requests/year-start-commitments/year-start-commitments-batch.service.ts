import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import type { YearStartHoldInput } from '../../budgets/public/budgets.types';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { FinanceApi } from '../../finance/public/finance.api';
import { LicensingOpenGrantsApi } from '../../licensing/public/licensing-open-grants.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { YearStartCommitmentsRepo, type YearStartCandidate } from './year-start-commitments.repo';
import {
  YEAR_START_PLAN_KINDS,
  bearingDepartmentOf,
  judgeYearStart,
  type YearStartPrice,
  type YearStartSeat,
  type YearStartSkipReason,
} from './year-start-commitments.policy';

/** How many requests one transaction takes: their rows stay locked until it ends, so it is kept short. */
export const YEAR_START_BATCH_SIZE = 100;

export interface YearStartPassContext {
  organizationId: string;
  /** The year that begins. */
  year: number;
  now: Date;
  /** The day of the pass in the calendar of the organization: 01/01, or later when the pass runs late. */
  today: BusinessDate;
}

/** What one batch did: where the next begins (null when there is no more), the commitments it made and the requests it had to leave out. */
export interface YearStartBatchResult {
  lastId: string | null;
  created: number;
  skipped: number;
}

type HoldItem = YearStartHoldInput['items'][number];
type LeftOut = { requestId: string; reason: YearStartSkipReason };

/**
 * One batch of the pass of 01/01 (`FR-5.8`(6), `BR-MF1-09e`, `QĐ-109a`), in one transaction. The order of the locks is the one of the budgets
 * and of every transaction of a request, after the lock of the pass the caller took: (1) the rows of the requests of the batch, `FOR UPDATE` in
 * order of id, and what is judged is read after, from their state now; (2) the grants, read without a lock; (3) the organization `FOR SHARE`
 * while an amount is converted; (4) in `holdYearStart`, the lock of each Cost Center and year, the Cost Centers in order of id, then the
 * approved version of the year. The proposal and version rows of a budget are never taken after the year lock here, as nowhere else. So a
 * decision of a version that attaches the commitments that wait for it, a withdrawal of a request and the grant of one are each either read in
 * their new state or queue behind this batch; none waits for it in a circle.
 *
 * The seat of a request is followed along the chain of its records to the one that runs on 01/01: a service account handed over, a right
 * carried to a renewed subscription. A right that a renewal extended is the renewal's: the commitment of the year is held by the request that
 * extended it, not by the one that first granted it. The commitment is in the reporting currency, converted as the check of an approval does
 * (`FinanceApi.snapshotMoney`), at the rate of 01/01 or, when none was entered for that day, of the day of the pass.
 *
 * A request is left out, with an audit event and no commitment, when its plan has no price, its amount is too large, no rate converts it,
 * the department that bears it has no Cost Center in use, or the approved budget of the year is in another currency; one that has nothing to
 * commit (every seat is over, or it is free or a key) is left out in silence. A request that holds a commitment for the year already (it was
 * approved this year) is not touched. A batch is never judged twice: the pass goes on after the last request of the batch before.
 */
@Injectable()
export class YearStartCommitmentsBatchService {
  constructor(
    private readonly repo: YearStartCommitmentsRepo,
    private readonly budgets: BudgetsApi,
    private readonly catalog: CatalogApi,
    private readonly finance: FinanceApi,
    private readonly grants: LicensingOpenGrantsApi,
    private readonly organization: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  async commitBatch(tx: DbTx, pass: YearStartPassContext, afterId: string | null): Promise<YearStartBatchResult> {
    const locked = await this.repo.lockBatch(tx, pass.organizationId, afterId, YEAR_START_BATCH_SIZE);
    const lastId = locked.length === 0 ? null : locked[locked.length - 1].id;
    const candidates = await this.withoutCommitment(tx, await this.ofPaidKinds(tx, locked), pass.year);
    if (candidates.length === 0) return { lastId, created: 0, skipped: 0 };

    const { items, leftOut } = await this.judgeAll(tx, pass, candidates);
    const held = await this.budgets.holdYearStart(tx, {
      organizationId: pass.organizationId,
      year: pass.year,
      now: pass.now,
      items,
    });
    for (const refused of held.refused) leftOut.push({ requestId: refused.requestId, reason: refused.reason });
    for (const left of leftOut) await this.recordSkipped(tx, pass, left);

    return { lastId, created: held.created.length, skipped: leftOut.length };
  }

  /** What each candidate holds, in the reporting currency and the Cost Center of the department that bears it, or why it is left out. */
  private async judgeAll(
    tx: DbTx,
    pass: YearStartPassContext,
    candidates: readonly YearStartCandidate[],
  ): Promise<{ items: HoldItem[]; leftOut: LeftOut[] }> {
    const yearStart: BusinessDate = `${pass.year}-01-01`;
    const seats = await this.seatsOf(tx, candidates, yearStart);
    const bearing = new Map(
      candidates.map((candidate) => [
        candidate.id,
        bearingDepartmentOf({
          year: pass.year,
          seats: seats.get(candidate.id) ?? [],
          requestDepartmentId: candidate.departmentId,
        }),
      ]),
    );
    const costCenters = await this.organization.getUnitCostCenterIds([...new Set(bearing.values())], tx);
    const prices = await this.pricesOf(tx, candidates, yearStart);
    // The rate of 01/01 first; the day of the pass when none was entered for 01/01 (a holiday), as an approval that day would use.
    const rateDays = [...new Set<BusinessDate>([yearStart, pass.today])];
    const items: HoldItem[] = [];
    const leftOut: LeftOut[] = [];
    for (const candidate of candidates) {
      const judgement = judgeYearStart({
        year: pass.year,
        seats: seats.get(candidate.id) ?? [],
        price: prices.get(candidate.planId) ?? null,
        costCenterId: costCenters.get(bearing.get(candidate.id) ?? candidate.departmentId) ?? null,
      });
      if (judgement.status === 'NOTHING') continue;
      if (judgement.status === 'LEFT_OUT') {
        leftOut.push({ requestId: candidate.id, reason: judgement.reason });
        continue;
      }
      const reporting = await this.inReporting(tx, judgement, rateDays);
      if (typeof reporting === 'string') leftOut.push({ requestId: candidate.id, reason: reporting });
      else items.push({ requestId: candidate.id, costCenterId: judgement.costCenterId, ...reporting });
    }

    return { items, leftOut };
  }

  /**
   * The amount of the year and the price of a month of a seat in the reporting currency, at the rate of the first of `rateDays` that has
   * one (the reporting currency itself needs none). The reason it cannot be converted otherwise.
   */
  private async inReporting(
    tx: DbTx,
    amounts: { amountMinor: bigint; seatMonthlyMinor: bigint; currency: string },
    rateDays: readonly BusinessDate[],
  ): Promise<{ amountMinor: bigint; seatMonthlyMinor: bigint; currency: string } | YearStartSkipReason> {
    try {
      for (const day of rateDays) {
        const amount = await this.finance.snapshotMoney(
          tx,
          { amountMinor: amounts.amountMinor, currency: amounts.currency },
          day,
        );
        const monthly = await this.finance.snapshotMoney(
          tx,
          { amountMinor: amounts.seatMonthlyMinor, currency: amounts.currency },
          day,
        );
        if (amount.status === 'MISSING_RATE' || monthly.status === 'MISSING_RATE') continue;
        const amountMinor = amount.snapshot.reportingAmountMinor;
        const seatMonthlyMinor = monthly.snapshot.reportingAmountMinor;
        // A price so small that it rounds to nothing in the reporting currency is no price to hold.
        if (amountMinor <= 0n || seatMonthlyMinor <= 0n) return 'NO_PRICE';

        return { amountMinor, seatMonthlyMinor, currency: amount.snapshot.reportingCurrency };
      }
    } catch (error) {
      if (error instanceof MoneyOutOfRangeError) return 'AMOUNT_TOO_LARGE';
      throw error;
    }

    return 'NO_RATE';
  }

  /** Only the grants of a plan that costs money every month a seat is held: `K1` and `K2` (a key, or free software, holds nothing on 01/01). */
  private async ofPaidKinds(tx: DbTx, rows: readonly YearStartCandidate[]): Promise<YearStartCandidate[]> {
    if (rows.length === 0) return [];
    const plans = await this.catalog.getPlanRevocationInfo([...new Set(rows.map((row) => row.planId))], tx);
    const paid = new Set(
      plans.filter((plan) => YEAR_START_PLAN_KINDS.includes(plan.provisioningType)).map((plan) => plan.planId),
    );

    return rows.filter((row) => paid.has(row.planId));
  }

  /** What already holds a commitment for the year is left as it is, and is not read any further. */
  private async withoutCommitment(
    tx: DbTx,
    rows: readonly YearStartCandidate[],
    year: number,
  ): Promise<YearStartCandidate[]> {
    const holding = await this.budgets.listRequestsHoldingYear(
      tx,
      rows.map((row) => row.id),
      year,
    );

    return rows.filter((row) => !holding.has(row.id));
  }

  /**
   * The seats of each request that cost something on 01/01: those approved and not yet granted, and those granted that still run, each
   * followed along its chain to the record that runs now. A seat that a renewal by another request extended is that request's, not this one's.
   */
  private async seatsOf(
    tx: DbTx,
    candidates: readonly YearStartCandidate[],
    yearStart: BusinessDate,
  ): Promise<Map<string, YearStartSeat[]>> {
    const seats = new Map<string, YearStartSeat[]>();
    const add = (requestId: string, seat: YearStartSeat): void => {
      seats.set(requestId, [...(seats.get(requestId) ?? []), seat]);
    };
    for (const [requestId, waiting] of await this.repo.unclaimedSeats(tx, candidates)) {
      for (const seat of waiting) add(requestId, { ...seat, validUntil: null, departmentId: null });
    }
    const granted = await this.grants.listHeldSeatsOfRequests(
      {
        grantRequestIds: candidates
          .filter((candidate) => candidate.type !== 'RENEWAL')
          .map((candidate) => candidate.id),
        namedRoots: await this.repo.renewalSuccessors(tx, candidates),
      },
      yearStart,
      tx,
    );
    const renewedBy = await this.repo.renewalsThatBegan(
      tx,
      granted.flatMap((seat) => seat.laterAssignmentIds),
    );
    for (const seat of granted) {
      const extended = seat.laterAssignmentIds.some((id) => (renewedBy.get(id) ?? seat.requestId) !== seat.requestId);
      if (extended) continue;
      add(seat.requestId, {
        expectedEndDate: seat.expectedEndDate,
        validUntil: seat.validUntil,
        departmentId: seat.owningDepartmentId,
      });
    }

    return seats;
  }

  /** The price of each plan on 01/01 (`BR-MF1-09e`), whatever day the pass runs: the main subscription of the plan, never a department's (`S1-02`). */
  private async pricesOf(
    tx: DbTx,
    candidates: readonly YearStartCandidate[],
    yearStart: BusinessDate,
  ): Promise<Map<string, YearStartPrice | null>> {
    const prices = new Map<string, YearStartPrice | null>();
    for (const planId of new Set(candidates.map((candidate) => candidate.planId))) {
      const price = await this.catalog.getPlanPrice(planId, tx, yearStart);
      prices.set(planId, price && { kind: price.kind, unitPrice: price.unitPrice, billingCycle: price.billingCycle });
    }

    return prices;
  }

  private async recordSkipped(tx: DbTx, pass: YearStartPassContext, left: LeftOut) {
    await this.audit.record(tx, {
      organizationId: pass.organizationId,
      actorKind: 'SYSTEM',
      action: 'BUDGET_COMMITMENT.YEAR_START_SKIPPED',
      resourceType: 'ACCESS_REQUEST',
      resourceId: left.requestId,
      before: null,
      after: { requestId: left.requestId, year: pass.year, reason: left.reason },
      correlationId: `year-start-commitments:${pass.organizationId}:${pass.year}`,
    });
  }
}
