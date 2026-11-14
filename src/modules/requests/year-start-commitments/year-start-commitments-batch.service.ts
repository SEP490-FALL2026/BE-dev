import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { termEndOf } from '../../../core/term-limit';
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
/** What the approval of a request kept of the year that begins for a person (null for a request for one person): null when it kept nothing. */
type KeptOf = (requestId: string, employeeId: string | null) => bigint | null;
type LeftOut = { requestId: string; reason: YearStartSkipReason };

/**
 * One batch of the pass of 01/01 (`FR-5.8`(6), `BR-MF1-09e`, `QĐ-109a`), in one transaction. The order of the locks is the one of the budgets
 * and of every transaction of a request, after the lock of the pass the caller took: (1) the rows of the requests of the batch, `FOR UPDATE` in
 * order of id, and what is judged is read after, from their state now; (2) the grants, read without a lock; (3) in `holdYearStart`, the lock of
 * each Cost Center and year, the Cost Centers in order of id, then the approved version of the year (no rate is read, so the organization is
 * not locked here). The proposal and version rows of a budget are never taken after the year lock here, as nowhere else. So a
 * decision of a version that attaches the commitments that wait for it, a withdrawal of a request and the grant of one are each either read in
 * their new state or queue behind this batch; none waits for it in a circle.
 *
 * The seat of a request is followed along the chain of its records to the one that runs on 01/01: a service account handed over, a right
 * carried to a renewed subscription. A right that a renewal extended is the renewal's: the commitment of the year is held by the request that
 * extended it, not by the one that first granted it. The commitment is in dong as the price stands: nothing is converted (`QĐ-111an`), as in
 * the check of an approval.
 *
 * The amount is what each seat that still stands after 31/12 kept at its approval (a request for months of use), or twelve months of the
 * price of 01/01 (a right with no end): `yearStartAmountOf` (`QĐ-111ak`).
 *
 * A request is left out, with an audit event and no commitment, when its plan has no price (or a price left in another currency than dong),
 * its amount is too large, or the department that bears it has no Cost Center in use; one that has nothing to commit (every seat is over, or
 * it is free or a key) is left out in silence. A request that holds a commitment for the year already (it was
 * approved this year) is not touched. A batch is never judged twice: the pass goes on after the last request of the batch before.
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

    const { items, leftOut } = await this.judgeAll(tx, pass, candidates);
    const held = await this.budgets.holdYearStart(tx, {
      organizationId: pass.organizationId,
      year: pass.year,
      now: pass.now,
      items,
    });
    // The approved budget of a year is in dong like every amount, so the facade refuses nothing; a refusal means a budget in another currency.
    if (held.refused.length > 0) {
      throw new Error(
        `The approved budget of the year ${pass.year} is not in dong: ${held.refused.length} commitment(s) of 01/01 cannot be held`,
      );
    }
    for (const left of leftOut) await this.recordSkipped(tx, pass, left);

    return { lastId, created: held.created.length, skipped: leftOut.length };
  }

  /** What each candidate holds, in dong and the Cost Center of the department that bears it, or why it is left out. */
  private async judgeAll(
    tx: DbTx,
    pass: YearStartPassContext,
    candidates: readonly YearStartCandidate[],
  ): Promise<{ items: HoldItem[]; leftOut: LeftOut[] }> {
    const yearStart: BusinessDate = `${pass.year}-01-01`;
    const seats = await this.seatsOf(tx, candidates, pass.year);
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
      items.push({
        requestId: candidate.id,
        costCenterId: judgement.costCenterId,
        amountMinor: judgement.amountMinor,
        seatMonthlyMinor: judgement.seatMonthlyMinor,
        currency: judgement.currency,
      });
    }

    return { items, leftOut };
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
   * Each seat carries what its approval kept of the year that begins (`QĐ-111k`): the request's own number for one person, the row of the
   * person for a group, nothing when it kept none (a request of an older release) or kept it for another year.
   */
  private async seatsOf(
    tx: DbTx,
    candidates: readonly YearStartCandidate[],
    year: number,
  ): Promise<Map<string, YearStartSeat[]>> {
    const keptOf = await this.keptNumbersOf(tx, candidates, year);
    const seats = new Map<string, YearStartSeat[]>();
    for (const [requestId, seat] of [
      ...(await this.unclaimedSeatsOf(tx, candidates, year, keptOf)),
      ...(await this.grantedSeatsOf(tx, candidates, year, keptOf)),
    ]) {
      seats.set(requestId, [...(seats.get(requestId) ?? []), seat]);
    }

    return seats;
  }

  /** What the approval of a request kept of the year for a person, as a reader of the rows of the year (`QĐ-111k`, M-13). */
  private async keptNumbersOf(tx: DbTx, candidates: readonly YearStartCandidate[], year: number): Promise<KeptOf> {
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const keptLines = await this.repo.keptNextYearOfLines(
      tx,
      candidates.filter((candidate) => candidate.type === 'GROUP_GRANT').map((candidate) => candidate.id),
      year,
    );

    return (requestId, employeeId) => {
      const request = byId.get(requestId);
      if (request === undefined) return null;
      if (request.type === 'GROUP_GRANT') return keptLines.get(requestId)?.get(employeeId ?? '') ?? null;

      return request.budgetYear === year - 1 ? request.nextYearAmountMinor : null;
    };
  }

  /**
   * The seats approved and not yet granted. Months of use that nobody was granted yet run from the day of the grant: from 01/01 when the
   * approval kept nothing of them.
   */
  private async unclaimedSeatsOf(
    tx: DbTx,
    candidates: readonly YearStartCandidate[],
    year: number,
    keptOf: KeptOf,
  ): Promise<[string, YearStartSeat][]> {
    const termOf = new Map(candidates.map((candidate) => [candidate.id, candidate.termMonths]));
    const seats: [string, YearStartSeat][] = [];
    for (const [requestId, waiting] of await this.repo.unclaimedSeats(tx, candidates)) {
      const termMonths = termOf.get(requestId) ?? null;
      for (const seat of waiting) {
        const savedMinor = keptOf(requestId, seat.employeeId);
        const derivedEnd = savedMinor === null && termMonths !== null ? termEndOf(`${year}-01-01`, termMonths) : null;
        seats.push([
          requestId,
          {
            expectedEndDate: seat.expectedEndDate ?? derivedEnd,
            validUntil: null,
            departmentId: null,
            termLimited: termMonths !== null || seat.expectedEndDate !== null,
            savedMinor,
          },
        ]);
      }
    }

    return seats;
  }

  /** The seats granted that still run on 01/01, along their chains; a seat a renewal by another request extended is not this request's. */
  private async grantedSeatsOf(
    tx: DbTx,
    candidates: readonly YearStartCandidate[],
    year: number,
    keptOf: KeptOf,
  ): Promise<[string, YearStartSeat][]> {
    const termOf = new Map(candidates.map((candidate) => [candidate.id, candidate.termMonths]));
    const granted = await this.grants.listHeldSeatsOfRequests(
      {
        grantRequestIds: candidates
          .filter((candidate) => candidate.type !== 'RENEWAL')
          .map((candidate) => candidate.id),
        namedRoots: await this.repo.renewalSuccessors(tx, candidates),
      },
      `${year}-01-01`,
      tx,
    );
    const renewedBy = await this.repo.renewalsThatBegan(
      tx,
      granted.flatMap((seat) => seat.laterAssignmentIds),
    );

    return granted
      .filter((seat) => !seat.laterAssignmentIds.some((id) => (renewedBy.get(id) ?? seat.requestId) !== seat.requestId))
      .map((seat): [string, YearStartSeat] => [
        seat.requestId,
        {
          expectedEndDate: seat.expectedEndDate,
          validUntil: seat.validUntil,
          departmentId: seat.owningDepartmentId,
          termLimited: (termOf.get(seat.requestId) ?? null) !== null || seat.expectedEndDate !== null,
          savedMinor: keptOf(seat.requestId, seat.employeeId),
        },
      ]);
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
