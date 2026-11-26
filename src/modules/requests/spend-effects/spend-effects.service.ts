import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import { renewalStartOf, termEndOf, termRunOf } from '../../../core/term-limit';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import type { MonthSliceInput } from '../../budgets/public/budgets.types';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { chargedCostCenterId } from '../access-request/access-request.policy';
import { monthlyPriceOf, seatMonthlyOf } from '../access-request/pricing.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { BudgetCheckRepo, type CheckRecord } from '../spend/budget-check.repo';
import { SpendDecisionRepo } from '../spend/spend-decision.repo';
import type { ReturnReason } from '../spend/spend-decision.policy';
import { SpendStepRepo, type SpendStepRecord } from '../spend/spend-step.repo';

/**
 * What a spend decision does to the budget and to the step, for the decision on one person's request and for the decision on the lines of
 * a group: the request holds the cost of its one year, as the snapshot it was approved on says (`US-06-04`, `BR-MF1-07d`); a request that is
 * not for the approver now closes the step with no decision and goes back to its head (`US-06-01` AC-18, `BR-MF1-07c`). One place, so the two
 * decisions cannot drift apart.
 */
@Injectable()
export class SpendEffectsService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly checkRepo: BudgetCheckRepo,
    private readonly budgets: BudgetsApi,
    private readonly catalog: CatalogApi,
    private readonly audit: AuditApi,
    private readonly decisions: SpendDecisionRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /**
   * The request holds the cost of the one year it was checked for: one commitment, attached to the approved budget of that year in the Cost
   * Center the check read (`FR-5.8`(1), `INV-16`). A cost of nothing (a request to go on using whose new period begins next year, `QĐ-109b`)
   * holds nothing, and the audit says so; the part of next year is the commitment made on 01/01. What one seat costs a month is kept with it
   * for the release by day (`RV-07`, `M-10`): the cost over the months of the amount and over `seats`, the people the check was for (the
   * people approved of a group; by default the people the request is for). Returns the check.
   */
  async hold(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    checkId: string | null,
    now: Date,
    seats: number = Math.max(1, request.beneficiaryEmployeeIds.length),
  ): Promise<CheckRecord> {
    const check = checkId ? await this.checkRepo.findById(checkId, tx) : null;
    if (!check) throw new Error(`The approval of the request ${request.id} has no snapshot to hold a commitment on.`);
    const [year] = check.years.filter((candidate) => candidate.code !== null);
    if (check.years.length !== 1 || !year) {
      throw new Error(`The snapshot ${check.id} of the request ${request.id} does not have exactly one year.`);
    }
    if (year.costMinor === 0n) {
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.NO_CURRENT_YEAR_COMMITMENT',
          'ACCESS_REQUEST',
          request.id,
          { requestId: request.id, checkId: check.id, year: year.year },
        ),
      );

      return check;
    }

    const { seatMonthlyMinor, months } = await this.seatMonthlyAndSlices(tx, request, year, seats, now);

    await this.budgets.holdForRequest(tx, actor, {
      organizationId: request.organizationId,
      requestId: request.id,
      costCenterId: check.costCenterId ?? chargedCostCenterId(request),
      snapshotCheckId: check.id,
      currency: check.currency,
      now,
      items: [{ year: year.year, amountMinor: year.costMinor }],
      seatMonthlyMinor,
      ...(months && months.length > 0 ? { months } : {}),
    });

    return check;
  }

  private async seatMonthlyAndSlices(
    tx: DbTx,
    request: AccessRequestRecord,
    year: { year: number; costMinor: bigint },
    seats: number,
    now: Date,
  ): Promise<{ seatMonthlyMinor: bigint | null; months: MonthSliceInput[] | undefined }> {
    const planPrice = request.planId !== null ? await this.catalog.getPlanPrice(request.planId, tx) : undefined;
    const monthlyPriceMinor = this.savedMonthlyPriceOf(request.pricing, planPrice?.monthlyPriceMinor);
    const seatMonthlyMinor = seatMonthlyOf({
      monthlyPriceMinor,
      unitPrice: request.pricing.unitPrice,
      billingCycle: request.pricing.billingCycle,
      costMinor: year.costMinor,
      kind: request.pricing.kind,
      months: request.pricing.budgetYear === year.year ? request.pricing.amountMonths : null,
      seats,
    });
    const months =
      seatMonthlyMinor !== null
        ? await this.monthlySlicesForHold(tx, request, year.year, seats, planPrice?.provisioningType, now)
        : undefined;
    return { seatMonthlyMinor, months };
  }

  private savedMonthlyPriceOf(
    pricing: AccessRequestRecord['pricing'],
    catalogMonthly: bigint | null | undefined,
  ): bigint | null | undefined {
    if (pricing.monthlyPriceMinor !== undefined) return pricing.monthlyPriceMinor;
    if (pricing.unitPrice !== null && pricing.billingCycle !== null && pricing.billingCycle !== 'OTHER') {
      return monthlyPriceOf({ unitPrice: pricing.unitPrice, billingCycle: pricing.billingCycle })?.amountMinor ?? null;
    }

    return catalogMonthly;
  }

  private async monthlySlicesForHold(
    tx: DbTx,
    request: AccessRequestRecord,
    year: number,
    seats: number,
    planKind: string | undefined,
    now: Date,
  ): Promise<MonthSliceInput[] | undefined> {
    let kind = planKind;
    if (kind === undefined && request.planId !== null) {
      kind = (await this.catalog.getPlanRevocationInfo([request.planId], tx))[0]?.provisioningType;
    }
    if (kind !== 'K2') return undefined;
    const today = await this.organizationReads.businessToday(now, tx);
    const start = request.renewal
      ? renewalStartOf({ previousEnd: request.renewal.previousExpectedEndDate, today })
      : today;
    const ends = await this.seatEndsForHold(tx, request, start, seats);
    return countMonthlySeats(start, ends, year);
  }

  private async seatEndsForHold(
    tx: DbTx,
    request: AccessRequestRecord,
    start: BusinessDate,
    seats: number,
  ): Promise<(BusinessDate | null)[]> {
    if (request.type === 'GROUP_GRANT') {
      const current = (await this.requests.findById(request.id, tx)) ?? request;
      const lines = current.lines.filter((line) => line.state === 'APPROVED');
      if (lines.length > 0) {
        return this.resolveLineEnds(tx, request, lines, start);
      }
    }
    if (request.expectedEndDate !== null) {
      return Array.from({ length: seats }, () => request.expectedEndDate);
    }
    if (request.termMonths !== null && request.renewal === null) {
      const ids = request.beneficiaryEmployeeIds;
      if (ids.length === 0) return Array.from({ length: seats }, () => termEndOf(start, request.termMonths ?? 1));
      const people = new Map(
        (await this.organizationReads.getEmployees(ids, tx)).map((p) => [p.id, p.contractEndDate]),
      );
      return ids.map(
        (id) => termRunOf({ start, months: request.termMonths, contractEndDate: people.get(id) ?? null }).end,
      );
    }
    return Array.from({ length: seats }, () => null);
  }

  private async resolveLineEnds(
    tx: DbTx,
    request: AccessRequestRecord,
    lines: AccessRequestRecord['lines'],
    start: BusinessDate,
  ): Promise<(BusinessDate | null)[]> {
    const needLookup = lines.some(
      (l) => l.expectedEndDate === null && request.termMonths !== null && request.renewal === null,
    );
    const people = needLookup
      ? new Map(
          (
            await this.organizationReads.getEmployees(
              lines.map((l) => l.employeeId),
              tx,
            )
          ).map((p) => [p.id, p.contractEndDate]),
        )
      : new Map<string, BusinessDate | null>();
    return lines.map((line) => {
      if (line.expectedEndDate !== null) return line.expectedEndDate;
      if (request.termMonths !== null && request.renewal === null) {
        return termRunOf({ start, months: request.termMonths, contractEndDate: people.get(line.employeeId) ?? null })
          .end;
      }
      return null;
    });
  }

  /**
   * The spending approver sends the request back with the reason of the checklist or their own (`QĐ-111ap`, R-24): the step closes with a record of
   * approval that says it was returned, and the request goes to the queue of its head, or to its sender when it has no head step. Nothing is held or
   * refused. `ACCESS_REQUEST.SPEND_RETURNED` is what tells the sender and the head.
   */
  async returnByApprover(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    step: SpendStepRecord,
    by: { now: Date; reason: string },
  ): Promise<{ requestState: 'AWAITING_SPEND_SUBMISSION' | 'AWAITING_REQUESTER_REVISION' }> {
    const oneStep = request.routing?.mode === 'ONE_STEP';
    const requestState = oneStep ? ('AWAITING_REQUESTER_REVISION' as const) : ('AWAITING_SPEND_SUBMISSION' as const);
    await this.decisions.recordReturn(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      stepId: step.id,
      departmentId: request.departmentId,
      reason: by.reason,
      decidedByEmployeeId: actor.employeeId,
      decidedAt: by.now,
      requestState,
    });
    if (oneStep) await this.requests.setOneStepBlockedReason(tx, request.id, null);
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.SPEND_RETURNED',
        'ACCESS_REQUEST_STEP',
        step.id,
        {
          requestId: request.id,
          stepId: step.id,
          decision: 'RETURNED',
          reason: by.reason,
          requestState,
          to: oneStep ? 'REQUESTER' : 'HEAD',
        },
      ),
    );

    return { requestState };
  }

  /**
   * Closes the step with no decision, because the request is not for the approver now, puts the request back in the queue of its head and says
   * why in the Audit Trail: `ACCESS_REQUEST.SPEND_RETURNED_AT_DECISION` is what tells the requester and the head (`BR-MF1-07c`).
   */
  async sendBack(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    step: SpendStepRecord,
    by: { now: Date; reasons: readonly ReturnReason[]; check: CheckRecord | null },
  ): Promise<void> {
    await this.steps.end(tx, step, 'CLOSED', null, by.now);
    if (request.routing?.mode === 'ONE_STEP') {
      const missing = by.reasons.find((reason) => reason === 'PRICE_MISSING');
      await this.requests.setOneStepBlockedReason(tx, request.id, missing ?? null);
    }
    await this.requests.setState(
      tx,
      request.id,
      request.routing?.mode === 'ONE_STEP' ? 'AWAITING_REQUESTER_REVISION' : 'AWAITING_SPEND_SUBMISSION',
    );
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.SPEND_STEP_CLOSED',
        'ACCESS_REQUEST_STEP',
        step.id,
        { requestId: request.id, reason: by.reasons.join(',') },
      ),
    );
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.SPEND_RETURNED_AT_DECISION',
        'ACCESS_REQUEST',
        request.id,
        {
          requestId: request.id,
          stepId: step.id,
          checkId: by.check?.id ?? null,
          blockReasons: by.reasons.join(','),
          overBy: by.check?.overByMinor?.toString() ?? null,
        },
      ),
    );
  }
}

function countMonthlySeats(
  start: BusinessDate,
  ends: readonly (BusinessDate | null)[],
  year: number,
): MonthSliceInput[] {
  const yearStart: BusinessDate = `${year}-01-01`;
  const yearEnd: BusinessDate = `${year}-12-31`;
  const counts = new Map<number, number>();
  for (const lastHeldOn of ends) {
    const first = start > yearStart ? start : yearStart;
    const last = lastHeldOn !== null && lastHeldOn < yearEnd ? lastHeldOn : yearEnd;
    if (first > last || fiscalYearOf(first) !== year || fiscalYearOf(last) !== year) continue;
    const mFrom = Number(first.slice(5, 7));
    const mTo = Number(last.slice(5, 7));
    for (let m = mFrom; m <= mTo; m++) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  if (counts.size === 0 && fiscalYearOf(start) === year) {
    counts.set(Number(start.slice(5, 7)), Math.max(1, ends.length));
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([m, seatCount]) => ({ month: `${year}-${String(m).padStart(2, '0')}-01`, seatCount }));
}
