import type { HeldAccess } from './access-request.types';
import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  AccessRequestApplicationRetiredError,
  AccessRequestNoDepartmentError,
  AccessRequestPlanNotFoundError,
} from './access-request.errors';
import { hasSpendStep, policyFor, proposalPolicy, type RequestPolicy } from './access-request.policy';
import type { PricingRecord } from './access-request.types';
import { maxEndDateOf, requestAmountOf } from './pricing.policy';
import { RoutingFactsService, type GatheredRouting } from './routing-facts.service';
import { routeNeedStep, requestRoutingOf, type RoutingDecision } from './routing.policy';

/** The parameter that says how long an approval step may wait; read when a request is sent and fixed in its policy. */
const APPROVAL_SLA_PARAMETER = 'APPROVAL_SLA_WORKING_DAYS';

/** The operating parameters a request is judged by, read once before the transaction opens. */
export interface RequestSettings {
  slaWorkingDays: number;
}

/**
 * The department of the day and its Unit: the Cost Center is there when the department has one in use and null when it has none
 * yet (`QĐ-87d(1)`). A request that costs money, or that ends in a service seat, is judged only with one
 * (`OrganizationReadApi.requireUnitCostCenter`); a free internal request is judged without it (`QĐ-87g(2)`).
 */
type OwningUnit =
  Awaited<ReturnType<OrganizationReadApi['getOwningUnits']>> extends Map<string, infer Unit> ? Unit : never;
/** The same with the Cost Center in use: what a cost is charged to. */
type CostedUnit = ReturnType<OrganizationReadApi['requireUnitCostCenter']>;
type SeatTarget = NonNullable<Awaited<ReturnType<CatalogApi['findPlanSeatTargets']>>[number]>;

/** Everything a request is decided by, read for one person asking for one plan on one day. */
export interface Assessment {
  today: BusinessDate;
  unit: OwningUnit;
  target: SeatTarget;
  policy: RequestPolicy;
  pricing: PricingRecord;
  routing: GatheredRouting & { decision: RoutingDecision };
  heldAccess: HeldAccess | null;
  /** The last day a right asked for may end, and whether the end date asked for breaks it or is missing (`FR-2.8`, `US-05-23` AC-9). */
  maxEndDate: BusinessDate;
  endDateOutOfRange: boolean;
  termRequired: boolean;
}

/** What a proposal of software that is not in the catalog is judged by: there is no plan, so no price or seat. */
export interface ProposalAssessment {
  today: BusinessDate;
  /** A proposal is of paid software, so its department has a Cost Center in use. */
  unit: CostedUnit;
  policy: RequestPolicy;
  /** Missing until the IT Admin records a quote (`US-05-06` AC-11): the request is not yet priced. */
  pricing: PricingRecord;
  routing: GatheredRouting & { decision: RoutingDecision };
  /** The last day the right asked for may end, and whether the end date asked for breaks it or is missing (`FR-2.8`, `US-05-23` AC-9). */
  maxEndDate: BusinessDate;
  endDateOutOfRange: boolean;
  termRequired: boolean;
}

export interface AssessmentInput {
  /** The person the request is for: their department and seat are what it is judged by. */
  employeeId: string;
  /** Who sends it, when it is not the person it is for (`US-03-02`); the need step is routed from them. */
  requesterEmployeeId?: string;
  planId: string;
  /** The day the right ends, as the sender chose it; null or absent for a right with no end (`QĐ-104a`). */
  expectedEndDate?: BusinessDate | null;
  /** The day the new period begins for a request to go on using, when it is not today (`QĐ-109b`). */
  pricingFrom?: BusinessDate;
  now: Date;
  settings: RequestSettings;
  /** Sending locks the department of the sender against change until commit; showing a preview locks nothing. */
  lockDepartment: boolean;
  /**
   * The request ends in a seat charged to the Unit of the department (the service seat, `QĐ-86a`): it is judged with a Cost Center
   * in use whatever it costs, because an Assignment of that kind cannot exist without one.
   */
  chargedToUnit?: boolean;
}

/**
 * The facts a request is judged by, read in one place so that what a person is shown before sending and what is fixed
 * when they send are the same (`US-05-01` AC-11): the department and Unit of the day, the plan and its price, the seat the
 * person already holds, and who the routing table gives the need step to.
 * It writes nothing and decides nothing: the callers refuse or record.
 */
/** What a request for internal software costs: nothing, and no day the money goes out. */
const NOT_APPLICABLE_PRICING: PricingRecord = {
  status: 'NOT_APPLICABLE',
  missingReason: null,
  kind: null,
  expectedEndDate: null,
  amountMonths: null,
  budgetYear: null,
  amount: null,
  unitPrice: null,
  billingCycle: null,
  nextYearAmount: null,
};

@Injectable()
export class RequestFactsService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly routing: RoutingFactsService,
    private readonly parameters: OperatingParametersApi,
    private readonly licensing: LicensingApi,
  ) {}

  /** Read before the transaction opens, so a slow parameter read never holds a lock. */
  async settings(): Promise<RequestSettings> {
    return {
      slaWorkingDays: Number(await this.parameters.getValue(APPROVAL_SLA_PARAMETER)),
    };
  }

  /**
   * Throws AccessRequestNoDepartmentError, AccessRequestPlanNotFoundError, AccessRequestApplicationRetiredError,
   * FinanceSetupIncompleteError (a request that costs money, or ends in a service seat, and the department has no Cost Center yet:
   * the gate runs before the budget check, `QĐ-87g(3)`; a free internal request is not stopped by it, `QĐ-87g(2)`).
   */
  async assess(tx: DbTx, input: AssessmentInput): Promise<Assessment> {
    const today = await this.organizationReads.businessToday(input.now, tx);
    const found = (await this.organizationReads.getOwningUnits([input.employeeId], today, tx)).get(input.employeeId);
    if (!found) throw new AccessRequestNoDepartmentError();

    const [target] = await this.catalog.findPlanSeatTargets([input.planId], tx);
    if (!target) throw new AccessRequestPlanNotFoundError();
    if (target.applicationStatus === 'RETIRED') throw new AccessRequestApplicationRetiredError();

    const policy = policyFor(target.applicationKind, input.settings.slaWorkingDays);
    // What the request is charged to is known only now that the branch is: no Cost Center, no charge, and no gate for what is free.
    const unit =
      policy.branch === 'INTERNAL_FREE' && !input.chargedToUnit
        ? found
        : this.organizationReads.requireUnitCostCenter(found);
    if (input.lockDepartment) await this.organizationReads.lockDepartmentShared(tx, unit.departmentId);

    const pricing = await this.priceFor(tx, {
      planId: input.planId,
      free: policy.branch === 'INTERNAL_FREE',
      beneficiaries: 1,
      checkDate: today,
      endDate: input.expectedEndDate ?? null,
      from: input.pricingFrom,
    });
    const employee = await this.organizationReads.getEmployee(input.employeeId, tx);
    const gathered = await this.routing.gather(tx, {
      requesterEmployeeId: input.requesterEmployeeId ?? input.employeeId,
      departmentId: unit.departmentId,
      today,
      chainHasSpendStep: hasSpendStep(policy),
    });

    return {
      today,
      unit,
      target,
      policy: policyFor(target.applicationKind, input.settings.slaWorkingDays, requestRoutingOf(routeNeedStep(gathered.facts))),
      pricing,
      routing: { ...gathered, decision: routeNeedStep(gathered.facts) },
      heldAccess: await this.heldAccess(input.employeeId, input.planId),
      ...this.termCheck({
        today,
        expectedEndDate: input.expectedEndDate,
        employmentType: employee?.employmentType ?? 'STAFF',
      }),
    };
  }

  /**
   * The same read for a proposal of software that is not in the catalog (`US-05-06` AC-1, `US-05-02` AC-8): the
   * department and Unit of the day, the chain of the third branch, a price that is missing until the quote comes, and who
   * the routing table gives the need step to. Throws AccessRequestNoDepartmentError.
   */
  async assessProposal(
    tx: DbTx,
    input: Pick<AssessmentInput, 'employeeId' | 'expectedEndDate' | 'now' | 'settings' | 'lockDepartment'>,
  ): Promise<ProposalAssessment> {
    const today = await this.organizationReads.businessToday(input.now, tx);
    const found = (await this.organizationReads.getOwningUnits([input.employeeId], today, tx)).get(input.employeeId);
    if (!found) throw new AccessRequestNoDepartmentError();
    const unit = this.organizationReads.requireUnitCostCenter(found);
    if (input.lockDepartment) await this.organizationReads.lockDepartmentShared(tx, unit.departmentId);

    const policy = proposalPolicy(input.settings.slaWorkingDays);
    const employee = await this.organizationReads.getEmployee(input.employeeId, tx);
    const gathered = await this.routing.gather(tx, {
      requesterEmployeeId: input.employeeId,
      departmentId: unit.departmentId,
      today,
      chainHasSpendStep: hasSpendStep(policy),
    });

    return {
      today,
      unit,
      policy: proposalPolicy(input.settings.slaWorkingDays, requestRoutingOf(routeNeedStep(gathered.facts))),
      pricing: {
        status: 'MISSING',
        missingReason: 'AWAITING_QUOTE',
        kind: null,
        expectedEndDate: input.expectedEndDate ?? null,
        amountMonths: null,
        budgetYear: fiscalYearOf(today),
        amount: null,
        unitPrice: null,
        billingCycle: null,
        nextYearAmount: null,
      },
      routing: { ...gathered, decision: routeNeedStep(gathered.facts) },
      ...this.termCheck({
        today,
        expectedEndDate: input.expectedEndDate,
        employmentType: employee?.employmentType ?? 'STAFF',
      }),
    };
  }

  /**
   * The last day a right may end and whether the end date asked for fits: not before today and not past a year from today
   * (`US-05-23` AC-9, `QĐ-104a`); a person who is not staff has a term, so no end date is a refusal for them (`FR-2.8`).
   */
  termCheck(facts: {
    today: BusinessDate;
    expectedEndDate: BusinessDate | null | undefined;
    employmentType: string;
  }): Pick<Assessment, 'maxEndDate' | 'endDateOutOfRange' | 'termRequired'> {
    const maxEndDate = maxEndDateOf(facts.today);
    const end = facts.expectedEndDate ?? null;

    return {
      maxEndDate,
      endDateOutOfRange: end !== null && (end < facts.today || end > maxEndDate),
      termRequired: end === null && facts.employmentType !== 'STAFF',
    };
  }

  /**
   * The seat the person holds of the plan today, if any. It is read outside the transaction: it is a courtesy that spares
   * a pointless request, and the grant itself still refuses an overlapping seat (`LICENSE_ASSIGNMENT.OVERLAP`).
   */
  private async heldAccess(employeeId: string, planId: string): Promise<HeldAccess | null> {
    const { items } = await this.licensing.getSeatsHeldInPlans(employeeId, [planId], { skip: 0, take: 1 });
    const [seat] = items;

    return seat ? { assignmentId: seat.id, effectiveFrom: seat.effectiveFrom, validUntil: seat.validUntil } : null;
  }

  /**
   * What the request costs (`FR-3.2`, `BR-MF1-06`): nothing for internal software; for paid software the price of the months left
   * of the calendar year of `checkDate` (the month it starts counted whole, or to the month of the end date), for the people it is for, or a
   * missing price that says why. The price is the one of the main subscription of the plan, never a department's. `checkDate` is
   * the day the amount is worked out on (`QĐ-109e`): the day of sending for a provisional amount, later the day of each check.
   */
  async priceFor(
    tx: DbTx,
    input: {
      planId: string;
      free: boolean;
      beneficiaries: number;
      checkDate: BusinessDate;
      /** The day the right ends; null for a right with no end. */
      endDate: BusinessDate | null;
      /** The start of the new period of a request to go on using, when it is not the check date (`QĐ-109b`). */
      from?: BusinessDate;
    },
  ): Promise<PricingRecord> {
    if (input.free) return { ...NOT_APPLICABLE_PRICING, expectedEndDate: input.endDate };
    const price = await this.catalog.getPlanPrice(input.planId, tx);
    const kind = price?.kind ?? 'RECURRING';
    const priced = requestAmountOf({
      kind,
      unitPrice: price?.unitPrice ?? null,
      billingCycle: price?.billingCycle ?? null,
      beneficiaries: input.beneficiaries,
      checkDate: input.checkDate,
      from: input.from,
      endDate: input.endDate,
    });
    if (priced.status === 'MISSING') {
      return {
        status: 'MISSING',
        missingReason: priced.reason,
        kind: price?.kind ?? null,
        budgetYear: priced.budgetYear,
        expectedEndDate: input.endDate,
        amountMonths: null,
        amount: null,
        unitPrice: null,
        billingCycle: null,
        nextYearAmount: null,
      };
    }

    return {
      status: 'PRICED',
      missingReason: null,
      kind,
      budgetYear: priced.budgetYear,
      expectedEndDate: input.endDate,
      amountMonths: priced.months,
      amount: priced.amount,
      unitPrice: priced.unitPrice,
      billingCycle: priced.billingCycle,
      nextYearAmount: priced.nextYearAmount,
    };
  }
}
