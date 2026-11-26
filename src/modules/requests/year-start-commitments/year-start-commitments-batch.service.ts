import { Injectable, Logger } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import { DONG } from '../../../core/money/money';
import { k1PaidThroughOn, termEndOf } from '../../../core/term-limit';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import type { YearStartHoldInput } from '../../budgets/public/budgets.types';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingOpenGrantsApi } from '../../licensing/public/licensing-open-grants.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { monthlyPriceOf } from '../access-request/pricing.policy';
import { YearStartCommitmentsRepo, type YearStartCandidate } from './year-start-commitments.repo';
import {
  YEAR_START_PLAN_KINDS,
  approvalMonthlyFromSaved,
  bearingDepartmentOf,
  buildK1ChainMapping,
  judgeYearStart,
  k1AnnualPlanIdsOf,
  yearStartMonthsOf,
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
/** What the approval of a request kept of the year that begins for a person (null for a request for one person): null when it kept nothing in dong. */
type KeptOf = (requestId: string, employeeId: string | null) => bigint | null;
/** A number the approval kept of the year that begins in a currency other than dong: it is never read as dong, the seat is counted by its months. */
interface IgnoredSaved {
  requestId: string;
  employeeId: string | null;
  currency: string;
  savedMinor: bigint;
}
type LeftOut = { requestId: string; reason: YearStartSkipReason };

/** What the paid requests of a batch hold on 01/01, judged: the commitments to make, the requests left out and why, and the numbers the approval kept in another currency. */
export interface YearStartJudgedBatch {
  items: HoldItem[];
  leftOut: LeftOut[];
  ignored: IgnoredSaved[];
}

/**
 * The price of a seat each request counted with at its approval, in dong (`unit_price_minor` and `billing_cycle` of the request): a seat that
 * closes before its term is counted at it, not at the price of 01/01 (`QĐ-111ak`). Null for a request that carries none, or carries it in
 * another currency: such a number is never read as dong (`QĐ-111an`).
 */
function approvalPriceOf(
  candidates: readonly YearStartCandidate[],
): (requestId: string) => YearStartSeat['approvalPrice'] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  return (requestId) => {
    const request = byId.get(requestId);
    if (!request || request.amountCurrency !== DONG || request.unitPriceMinor === null) return null;
    const unitPrice = { amountMinor: request.unitPriceMinor, currency: DONG };
    const monthlyPriceMinor =
      request.monthlyPriceMinor ??
      monthlyPriceOf({ unitPrice, billingCycle: request.billingCycle })?.amountMinor ??
      null;

    return { unitPrice, monthlyPriceMinor, billingCycle: request.billingCycle };
  };
}

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
 * price of 01/01 (a right with no end): `yearStartAmountOf` (`QĐ-111ak`). Only a number kept in dong is read: a request approved before the
 * prices were all in dong may have kept it in another currency, and that number is never taken for dong nor converted; the seat is counted by
 * its months at the price of 01/01 and the audit event `BUDGET_COMMITMENT.YEAR_START_SAVED_AMOUNT_IGNORED` says which number was left.
 *
 * A request is left out, with an audit event and no commitment, when its plan has no price (or a price left in another currency than dong),
 * its amount is too large, or the department that bears it has no Cost Center in use; one that has nothing to commit (every seat is over, or
 * it is free or a key) is left out in silence. A request that holds a commitment for the year already (it was
 * approved this year) is not touched. A batch is never judged twice: the pass goes on after the last request of the batch before.
 */
@Injectable()
export class YearStartCommitmentsBatchService {
  private readonly logger = new Logger(YearStartCommitmentsBatchService.name);

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
    const confirmedInvoices = await this.lockAndResolveK1Invoices(tx, locked, pass.year);
    const judged = await this.judgeBatch(tx, pass, locked, confirmedInvoices);
    if (judged === null) return { lastId, created: 0, skipped: 0 };

    const { items, leftOut, ignored } = judged;
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
    const k1ApplyItems = held.created.flatMap((created) => {
      const invoiceIds = confirmedInvoices.get(created.requestId) ?? [];

      return invoiceIds.length === 0
        ? []
        : [
            {
              requestId: created.requestId,
              commitmentId: created.commitmentId,
              costCenterId: created.costCenterId,
              invoiceIds,
            },
          ];
    });
    if (k1ApplyItems.length > 0) {
      await this.budgets.applyK1YearStartAllocations(tx, { year: pass.year, items: k1ApplyItems });
    }
    for (const left of leftOut) await this.recordSkipped(tx, pass, left);
    for (const number of ignored) await this.recordIgnored(tx, pass, number);

    return { lastId, created: held.created.length, skipped: leftOut.length };
  }

  /**
   * What the requests of a batch hold on 01/01 by the one rule of the pass, and writes nothing: the paid ones that hold no commitment for the
   * year yet, each judged on the seats and the price of 01/01. Null when none is left to judge. The pass judges the rows it locked; the
   * budgets ask the same of rows nobody locked, to tell what a Cost Center carries into the year (`QĐ-111ac`), so the two never disagree.
   */
  async judgeBatch(
    tx: DbTx,
    pass: YearStartPassContext,
    rows: readonly YearStartCandidate[],
    confirmedInvoices?: ReadonlyMap<string, string[]>,
  ): Promise<YearStartJudgedBatch | null> {
    const { paidRows, kindsByPlan } = await this.ofPaidKinds(tx, rows);
    const candidates = await this.withoutCommitment(tx, paidRows, pass.year);

    return candidates.length === 0 ? null : this.judgeAll(tx, pass, candidates, kindsByPlan, confirmedInvoices);
  }

  private async lockAndResolveK1Invoices(
    tx: DbTx,
    rows: readonly YearStartCandidate[],
    year: number,
  ): Promise<Map<string, string[]>> {
    const chainMap = await this.lockK1ChainAllocations(tx, rows, year);
    const queryIds = [...new Set([...rows.map((row) => row.id), ...chainMap.values()].flat())];
    const direct = await this.repo.confirmedInvoiceIdsByRequests(tx, queryIds);
    const resolved = new Map<string, string[]>();
    for (const row of rows) {
      const reqIds = chainMap.get(row.id) ?? [row.id];
      const invoiceIds = [...new Set(reqIds.flatMap((id) => direct.get(id) ?? []))];
      if (invoiceIds.length > 0) resolved.set(row.id, invoiceIds);
    }

    return resolved;
  }

  private async lockK1ChainAllocations(
    tx: DbTx,
    rows: readonly YearStartCandidate[],
    year: number,
  ): Promise<Map<string, string[]>> {
    if (rows.length === 0) return new Map();
    const targets = await this.catalog.findPlanSeatTargets([...new Set(rows.map((r) => r.planId))], tx);
    const k1PlanIds = k1AnnualPlanIdsOf(targets);
    const k1Candidates = rows.filter((r) => k1PlanIds.has(r.planId));
    if (k1Candidates.length === 0) return new Map();

    const namedRoots = [
      ...(await this.repo.renewalSuccessors(tx, k1Candidates)),
      ...(await this.repo.replacedAssignments(tx, k1Candidates)),
    ];
    const seatRoots = {
      grantRequestIds: k1Candidates.filter((c) => c.type !== 'RENEWAL').map((c) => c.id),
      namedRoots,
    };
    const details = await this.grants.listK1AnnualChainDetails(seatRoots, tx);
    const renewals = await this.repo.renewalRequestIdsByAssignments(tx, [
      ...new Set([...details.values()].flatMap((d) => d.chainAssignmentIds)),
    ]);
    const { subjectKeys, chainMap } = buildK1ChainMapping(k1Candidates, details, renewals);
    await this.budgets.lockK1AllocationYears(tx, subjectKeys, [year]);

    return chainMap;
  }

  /** What each candidate holds, in dong and the Cost Center of the department that bears it, or why it is left out. */
  private async judgeAll(
    tx: DbTx,
    pass: YearStartPassContext,
    candidates: readonly YearStartCandidate[],
    kindsByPlan: ReadonlyMap<string, string>,
    confirmedInvoices?: ReadonlyMap<string, string[]>,
  ): Promise<YearStartJudgedBatch> {
    const yearStart: BusinessDate = `${pass.year}-01-01`;
    const { seats, ignored } = await this.seatsOf(tx, candidates, pass.year, confirmedInvoices);
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
      const candidateSeats = seats.get(candidate.id) ?? [];
      const judgement = judgeYearStart({
        year: pass.year,
        seats: candidateSeats,
        price: prices.get(candidate.planId) ?? null,
        costCenterId: costCenters.get(bearing.get(candidate.id) ?? candidate.departmentId) ?? null,
      });
      if (judgement.status === 'NOTHING') continue;
      if (judgement.status === 'LEFT_OUT') {
        leftOut.push({ requestId: candidate.id, reason: judgement.reason });
        continue;
      }
      const months =
        kindsByPlan.get(candidate.planId) === 'K2'
          ? yearStartMonthsOf({ year: pass.year, seats: candidateSeats })
          : undefined;
      items.push({
        requestId: candidate.id,
        costCenterId: judgement.costCenterId,
        amountMinor: judgement.amountMinor,
        seatMonthlyMinor: judgement.seatMonthlyMinor,
        currency: judgement.currency,
        ...(months && months.length > 0 ? { months } : {}),
      });
    }

    return { items, leftOut, ignored };
  }

  /** Only the grants of a plan that costs money every month a seat is held: `K1` and `K2` (a key, or free software, holds nothing on 01/01). */
  private async ofPaidKinds(
    tx: DbTx,
    rows: readonly YearStartCandidate[],
  ): Promise<{ paidRows: YearStartCandidate[]; kindsByPlan: Map<string, string> }> {
    const kindsByPlan = new Map<string, string>();
    if (rows.length === 0) return { paidRows: [], kindsByPlan };
    const plans = await this.catalog.getPlanRevocationInfo([...new Set(rows.map((row) => row.planId))], tx);
    for (const plan of plans) {
      if (YEAR_START_PLAN_KINDS.includes(plan.provisioningType)) {
        kindsByPlan.set(plan.planId, plan.provisioningType);
      }
    }

    return { paidRows: rows.filter((row) => kindsByPlan.has(row.planId)), kindsByPlan };
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
    confirmedInvoices?: ReadonlyMap<string, string[]>,
  ): Promise<{ seats: Map<string, YearStartSeat[]>; ignored: IgnoredSaved[] }> {
    const { keptOf, ignored } = await this.keptNumbersOf(tx, candidates, year);
    const priceOf = approvalPriceOf(candidates);
    const seats = new Map<string, YearStartSeat[]>();
    for (const [requestId, seat] of [
      ...(await this.unclaimedSeatsOf(tx, candidates, year, keptOf)),
      ...(await this.grantedSeatsOf(tx, candidates, year, keptOf, confirmedInvoices)),
    ]) {
      const savedMonthly =
        !seat.termLimited && seat.savedMinor !== null ? approvalMonthlyFromSaved(seat.savedMinor) : null;
      const approvalPrice =
        savedMonthly !== null
          ? {
              unitPrice: { amountMinor: savedMonthly, currency: DONG },
              monthlyPriceMinor: savedMonthly,
              billingCycle: 'MONTHLY' as const,
            }
          : priceOf(requestId);
      seats.set(requestId, [...(seats.get(requestId) ?? []), { ...seat, approvalPrice }]);
    }

    return { seats, ignored };
  }

  /**
   * What the approval of a request kept of the year for a person, reading non-term-limited requests across every year after approval
   * and term-limited requests for the year immediately following approval; non-dong amounts are left ignored and audited.
   */
  private async keptNumbersOf(
    tx: DbTx,
    candidates: readonly YearStartCandidate[],
    year: number,
  ): Promise<{ keptOf: KeptOf; ignored: IgnoredSaved[] }> {
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const isPerpetual = (candidate: YearStartCandidate) =>
      candidate.termMonths === null && candidate.expectedEndDate === null;
    const groupIds = candidates
      .filter((candidate) => candidate.type === 'GROUP_GRANT')
      .map((candidate) => candidate.id);
    const stalePerpetualGroupIds = candidates
      .filter(
        (candidate) =>
          candidate.type === 'GROUP_GRANT' &&
          isPerpetual(candidate) &&
          candidate.budgetYear !== null &&
          candidate.budgetYear < year - 1,
      )
      .map((candidate) => candidate.id);
    const keptLines = await this.repo.keptNextYearOfLines(tx, groupIds, year);
    if (stalePerpetualGroupIds.length > 0) {
      for (const [reqId, lines] of await this.repo.keptPerpetualLines(tx, stalePerpetualGroupIds, year)) {
        keptLines.set(reqId, lines);
      }
    }
    const foreignLines = [
      ...(await this.repo.foreignKeptNextYearOfLines(tx, groupIds, year)),
      ...(stalePerpetualGroupIds.length > 0
        ? await this.repo.foreignKeptPerpetualLines(tx, stalePerpetualGroupIds, year)
        : []),
    ];
    const ignored: IgnoredSaved[] = foreignLines.map((line) => ({
      requestId: line.requestId,
      employeeId: line.employeeId,
      currency: line.currency,
      savedMinor: line.amountMinor,
    }));
    for (const candidate of candidates) {
      const kept = candidate.type !== 'GROUP_GRANT' && (isPerpetual(candidate) || candidate.budgetYear === year - 1);
      if (kept && candidate.nextYearAmountMinor !== null && candidate.amountCurrency !== DONG) {
        ignored.push({
          requestId: candidate.id,
          employeeId: null,
          currency: candidate.amountCurrency ?? 'UNKNOWN',
          savedMinor: candidate.nextYearAmountMinor,
        });
      }
    }

    const keptOf: KeptOf = (requestId, employeeId) => {
      const request = byId.get(requestId);
      if (request === undefined) return null;
      if (request.type === 'GROUP_GRANT') return keptLines.get(requestId)?.get(employeeId ?? '') ?? null;
      const applicableYear = isPerpetual(request) || request.budgetYear === year - 1;

      return applicableYear && request.amountCurrency === DONG ? request.nextYearAmountMinor : null;
    };

    return { keptOf, ignored };
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
            approvalPrice: null,
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
    confirmedInvoices?: ReadonlyMap<string, string[]>,
  ): Promise<[string, YearStartSeat][]> {
    const termOf = new Map(candidates.map((candidate) => [candidate.id, candidate.termMonths]));
    const roots = {
      grantRequestIds: candidates.filter((candidate) => candidate.type !== 'RENEWAL').map((candidate) => candidate.id),
      namedRoots: await this.repo.renewalSuccessors(tx, candidates),
    };
    const yearStart: BusinessDate = `${year}-01-01`;
    const granted = await this.grants.listHeldSeatsOfRequests(roots, yearStart, tx);
    const closedPaid =
      confirmedInvoices && confirmedInvoices.size > 0 && this.grants.listK1AnnualPaidSeatsOn
        ? await this.grants.listK1AnnualPaidSeatsOn(roots, yearStart, tx)
        : [];
    const seenRoots = new Set(granted.map((seat) => `${seat.requestId}:${seat.rootAssignmentId}`));
    const extraPaid = closedPaid.filter((seat) => {
      if (seenRoots.has(`${seat.requestId}:${seat.rootAssignmentId}`)) return false;
      if ((confirmedInvoices?.get(seat.requestId)?.length ?? 0) === 0) return false;
      const asOf =
        seat.validUntil && seat.validUntil > seat.billingAnchorOn ? addDays(seat.validUntil, -1) : seat.billingAnchorOn;

      return k1PaidThroughOn(seat.billingAnchorOn, asOf, 12) >= yearStart;
    });
    const combined = [...granted, ...extraPaid];
    const renewedBy = await this.repo.renewalsThatBegan(
      tx,
      combined.flatMap((seat) => seat.laterAssignmentIds),
    );
    const paidSeatByKey = new Map(extraPaid.map((seat) => [`${seat.requestId}:${seat.rootAssignmentId}`, seat]));

    return combined
      .filter((seat) => !seat.laterAssignmentIds.some((id) => (renewedBy.get(id) ?? seat.requestId) !== seat.requestId))
      .map((seat): [string, YearStartSeat] => {
        const paidSeat = paidSeatByKey.get(`${seat.requestId}:${seat.rootAssignmentId}`);
        const isPaidRevoked = paidSeat !== undefined;
        const paidThrough = paidSeat
          ? k1PaidThroughOn(
              paidSeat.billingAnchorOn,
              paidSeat.validUntil && paidSeat.validUntil > paidSeat.billingAnchorOn
                ? addDays(paidSeat.validUntil, -1)
                : paidSeat.billingAnchorOn,
              12,
            )
          : null;

        return [
          seat.requestId,
          {
            expectedEndDate: seat.expectedEndDate ?? paidThrough,
            validUntil: isPaidRevoked ? null : seat.validUntil,
            departmentId: seat.owningDepartmentId,
            termLimited: (termOf.get(seat.requestId) ?? null) !== null || seat.expectedEndDate !== null,
            savedMinor: keptOf(seat.requestId, seat.employeeId),
            approvalPrice: null,
          },
        ];
      });
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
      prices.set(
        planId,
        price && {
          kind: price.kind,
          unitPrice: price.unitPrice,
          monthlyPriceMinor: price.monthlyPriceMinor,
          billingCycle: price.billingCycle,
        },
      );
    }

    return prices;
  }

  /** A number the approval kept in another currency than dong was left unread: the audit trail and the log say which, so it is not lost silently. */
  private async recordIgnored(tx: DbTx, pass: YearStartPassContext, number: IgnoredSaved) {
    this.logger.warn(
      `The part of ${pass.year} that request ${number.requestId} kept is in ${number.currency}, not dong: the seat is counted by its months at the price of 01/01`,
    );
    await this.audit.record(tx, {
      organizationId: pass.organizationId,
      actorKind: 'SYSTEM',
      action: 'BUDGET_COMMITMENT.YEAR_START_SAVED_AMOUNT_IGNORED',
      resourceType: 'ACCESS_REQUEST',
      resourceId: number.requestId,
      before: null,
      after: {
        requestId: number.requestId,
        employeeId: number.employeeId,
        year: pass.year,
        currency: number.currency,
        savedMinor: number.savedMinor.toString(),
      },
      correlationId: `year-start-commitments:${pass.organizationId}:${pass.year}`,
    });
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
