import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { annualVendorAmountOf } from '../access-request/pricing.policy';
import { PricingViewService } from '../request-view/pricing-view.service';
import type { ReserveConfirmationRecord } from '../reserve-confirmation/reserve-confirmation.repo';
import { BudgetCheckRepo } from '../spend/budget-check.repo';
import { BudgetCheckService } from '../spend/budget-check.service';
import { SpendWireViewService } from '../spend/spend-wire-view.service';
import type { SpendStepRecord } from '../spend/spend-step.repo';
import type { ApprovalDetailWire } from './spend-approval.dto';
import { budgetSnapshotOf } from './spend-approval.mapper';

export type Person = (id: string) => { employeeId: string; employeeCode: string; fullName: string };

/**
 * The budget as the spending approver reads it on the step of a request (`BR-MF1-06e`, `BR-MF1-07b`): the base, the reserve, what is spent,
 * held and waiting, what is left at the two levels and the outcome of a check, and what the vendor is paid for a whole year when a yearly plan
 * is bought for the first time. Nothing is written.
 */
@Injectable()
export class SpendApprovalSnapshotService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly checkService: BudgetCheckService,
    private readonly checkRepo: BudgetCheckRepo,
    private readonly wireView: SpendWireViewService,
    private readonly pricing: PricingViewService,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /**
   * The budget as a check reads it: the check the decision kept once the request is decided, else the check made now, in memory, while the
   * step is open (the approver sees what is left and what waits today, not as it was when the request was sent). Null when there is none:
   * a request that cannot be checked now (no price, no rate), or whose step was closed without a decision.
   */
  async snapshotOf(of: {
    request: AccessRequestRecord;
    step: SpendStepRecord;
    decisionCheckId: string | null;
    confirmation: ReserveConfirmationRecord | null;
    person: Person;
  }): Promise<ApprovalDetailWire['budgetSnapshot']> {
    const { request, step, confirmation, person } = of;
    const kept = confirmation && {
      reason: confirmation.reason,
      confirmedByEmployeeId: confirmation.confirmedByEmployeeId,
      confirmedAt: confirmation.confirmedAt,
    };
    if (of.decisionCheckId !== null) {
      const check = await this.checkRepo.findById(of.decisionCheckId);
      const [year] = check?.years ?? [];
      if (!check || !year || check.outcome === null) return null;

      return budgetSnapshotOf({
        year,
        outcome: check.outcome,
        blockReasons: check.blockReasons,
        overBaseByMinor: check.overBaseByMinor,
        overByMinor: check.overByMinor,
        decisionCheckId: check.id,
        computedAt: check.ranAt,
        confirmation: kept,
        money: await this.wireView.formatter(check.currency),
        person,
      });
    }
    if (step.state !== 'PENDING' && step.state !== 'WAITING') return null;

    const computed = await this.runner.run((tx) => this.checkService.compute(tx, request, new Date()));
    if (computed.status !== 'COMPUTED') return null;
    const { result } = computed;

    return budgetSnapshotOf({
      year: result.years[0],
      outcome: result.outcome,
      blockReasons: result.blockReasons,
      overBaseByMinor: result.overBaseByMinor,
      overByMinor: result.overByMinor,
      decisionCheckId: null,
      computedAt: new Date(),
      confirmation: kept,
      money: await this.wireView.formatter(computed.currency),
      person,
    });
  }

  /**
   * What the vendor is paid for a whole year when the plan is bought for the first time on a yearly price (`BR-MF1-07b`): the price of a
   * year times the people, when the plan has no subscription yet that a seat can be taken from. Null for any other request.
   */
  async annualVendorAmountOf(request: AccessRequestRecord): Promise<ApprovalDetailWire['annualVendorAmount']> {
    const { pricing } = request;
    if (pricing.status !== 'PRICED' || pricing.kind !== 'RECURRING' || pricing.billingCycle !== 'ANNUAL') return null;
    if (pricing.unitPrice === null) return null;
    if (request.planId !== null) {
      const today = await this.organizationReads.businessToday();
      if ((await this.catalog.getGrantableSubscriptions(request.planId, today)).length > 0) return null;
    }
    const perPerson = annualVendorAmountOf({
      kind: pricing.kind,
      unitPrice: pricing.unitPrice,
      billingCycle: pricing.billingCycle,
    });
    if (perPerson === null) return null;

    return this.pricing.moneyView({
      amountMinor: perPerson.amountMinor * BigInt(request.beneficiaryEmployeeIds.length),
      currency: perPerson.currency,
    });
  }
}
