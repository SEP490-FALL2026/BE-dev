import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import type { YearStartHoldInput } from '../../budgets/public/budgets.types';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingOpenGrantsApi } from '../../licensing/public/licensing-open-grants.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { YearStartCommitmentsRepo, type YearStartCandidate } from './year-start-commitments.repo';
import {
  YEAR_START_PLAN_KINDS,
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
}

/** What one batch did: where the next begins (null when there is no more), the commitments it made and the requests it had to leave out. */
export interface YearStartBatchResult {
  lastId: string | null;
  created: number;
  skipped: number;
}

/**
 * One batch of the pass of 01/01 (`FR-5.8`(6), `BR-MF1-09e`, `QĐ-109a`), in one transaction. The order of the locks is the one of the budgets
 * and of every transaction of a request: (1) the rows of the requests of the batch, `FOR UPDATE` in order of id, and what is judged is read
 * after, from their state now; (2) the grants, read without a lock; (3) in `holdYearStart`, the lock of each Cost Center and year, the Cost Centers
 * in order of id, then the approved version of the year. The proposal and version rows of a budget are never taken after the year lock here, as
 * nowhere else. So a decision of a version that attaches the commitments that wait for it, a withdrawal of a request and the grant of one are
 * each either read in their new state or queue behind this batch; none waits for it in a circle.
 *
 * A request is left out, with an audit event and no commitment, when its plan has no price or its department has no Cost Center in use; one
 * that has nothing to commit (every seat is over, or it is free or a key) is left out in silence. A request that holds a commitment for the
 * year already (it was approved this year) is not touched.
 */
@Injectable()
export class YearStartCommitmentsBatchService {
  constructor(
    private readonly repo: YearStartCommitmentsRepo,
    private readonly budgets: BudgetsApi,
    private readonly catalog: CatalogApi,
    private readonly grants: LicensingOpenGrantsApi,
    private readonly organization: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  async commitBatch(tx: DbTx, pass: YearStartPassContext, afterId: string | null): Promise<YearStartBatchResult> {
    const locked = await this.repo.lockBatch(tx, pass.organizationId, afterId, YEAR_START_BATCH_SIZE);
    const lastId = locked.length === 0 ? null : locked[locked.length - 1].id;
    const candidates = await this.withoutCommitment(tx, await this.ofPaidKinds(tx, locked), pass.year);
    if (candidates.length === 0) return { lastId, created: 0, skipped: 0 };

    const seats = await this.seatsOf(tx, candidates, `${pass.year}-01-01`);
    const costCenters = await this.organization.getUnitCostCenterIds(
      [...new Set(candidates.map((candidate) => candidate.departmentId))],
      tx,
    );
    const prices = await this.pricesOf(tx, candidates);
    const items: YearStartHoldInput['items'][number][] = [];
    let skipped = 0;
    for (const candidate of candidates) {
      const judgement = judgeYearStart({
        year: pass.year,
        seats: seats.get(candidate.id) ?? [],
        price: prices.get(candidate.planId) ?? null,
        costCenterId: costCenters.get(candidate.departmentId) ?? null,
      });
      if (judgement.status === 'LEFT_OUT') {
        skipped += 1;
        await this.recordSkipped(tx, pass, candidate.id, judgement.reason);
      } else if (judgement.status === 'COMMIT') {
        items.push({
          requestId: candidate.id,
          costCenterId: judgement.costCenterId,
          currency: judgement.currency,
          amountMinor: judgement.amountMinor,
          seatMonthlyMinor: judgement.seatMonthlyMinor,
        });
      }
    }
    const held = await this.budgets.holdYearStart(tx, {
      organizationId: pass.organizationId,
      year: pass.year,
      now: pass.now,
      items,
    });

    return { lastId, created: held.created.length, skipped };
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

  /** The seats of each request that cost something on 01/01: those granted and still held, and those approved and not yet granted. */
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
      for (const seat of waiting) add(requestId, { expectedEndDate: seat.expectedEndDate, validUntil: null });
    }
    const granted = await this.grants.listHeldSeatsOfRequests(
      candidates.map((candidate) => candidate.id),
      yearStart,
      tx,
    );
    for (const seat of granted) {
      add(seat.requestId, { expectedEndDate: seat.expectedEndDate, validUntil: seat.validUntil });
    }

    return seats;
  }

  /** The price of each plan on the day of the pass: the main subscription of the plan, never a department's (`S1-02`). */
  private async pricesOf(
    tx: DbTx,
    candidates: readonly YearStartCandidate[],
  ): Promise<Map<string, YearStartPrice | null>> {
    const prices = new Map<string, YearStartPrice | null>();
    for (const planId of new Set(candidates.map((candidate) => candidate.planId))) {
      const price = await this.catalog.getPlanPrice(planId, tx);
      prices.set(planId, price && { kind: price.kind, unitPrice: price.unitPrice, billingCycle: price.billingCycle });
    }

    return prices;
  }

  private async recordSkipped(tx: DbTx, pass: YearStartPassContext, requestId: string, reason: YearStartSkipReason) {
    await this.audit.record(tx, {
      organizationId: pass.organizationId,
      actorKind: 'SYSTEM',
      action: 'BUDGET_COMMITMENT.YEAR_START_SKIPPED',
      resourceType: 'ACCESS_REQUEST',
      resourceId: requestId,
      before: null,
      after: { requestId, year: pass.year, reason },
      correlationId: `year-start-commitments:${pass.organizationId}:${pass.year}`,
    });
  }
}
