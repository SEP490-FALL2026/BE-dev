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
  AccessRequestSpendDateNotAllowedError,
} from './access-request.errors';
import { hasSpendStep, policyFor, proposalPolicy, type RequestPolicy } from './access-request.policy';
import type { PricingRecord } from './access-request.types';
import { priceRequest } from './pricing.policy';
import { RoutingFactsService, type GatheredRouting } from './routing-facts.service';
import { routeNeedStep, type RoutingDecision } from './routing.policy';

/** The parameter that says how long an approval step may wait; read when a request is sent and fixed in its policy. */
const APPROVAL_SLA_PARAMETER = 'APPROVAL_SLA_WORKING_DAYS';
/** The month the fiscal year begins in: it gives the budget year of the day the money is expected to go out. */
const FISCAL_YEAR_PARAMETER = 'FISCAL_YEAR_START_MONTH';

/** The operating parameters a request is judged by, read once before the transaction opens. */
export interface RequestSettings {
  slaWorkingDays: number;
  fiscalYearStartMonth: number;
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
}

export interface AssessmentInput {
  /** The person the request is for: their department and seat are what it is judged by. */
  employeeId: string;
  /** Who sends it, when it is not the person it is for (`US-03-02`); the need step is routed from them. */
  requesterEmployeeId?: string;
  planId: string;
  termMonths: number;
  expectedSpendOn: BusinessDate | undefined;
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
      fiscalYearStartMonth: Number(await this.parameters.getValue(FISCAL_YEAR_PARAMETER)),
    };
  }

  /**
   * Throws AccessRequestNoDepartmentError, AccessRequestPlanNotFoundError, AccessRequestApplicationRetiredError,
   * FinanceSetupIncompleteError (a request that costs money, or ends in a service seat, and the department has no Cost Center yet:
   * the gate runs before the budget check, `QĐ-87g(3)`; a free internal request is not stopped by it, `QĐ-87g(2)`) and
   * AccessRequestSpendDateNotAllowedError.
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
      departmentId: unit.departmentId,
      free: policy.branch === 'INTERNAL_FREE',
      termMonths: input.termMonths,
      beneficiaries: 1,
      expectedSpendOn: input.expectedSpendOn,
      today,
      fiscalYearStartMonth: input.settings.fiscalYearStartMonth,
    });
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
      policy,
      pricing,
      routing: { ...gathered, decision: routeNeedStep(gathered.facts) },
      heldAccess: await this.heldAccess(input.employeeId, input.planId),
    };
  }

  /**
   * The same read for a proposal of software that is not in the catalog (`US-05-06` AC-1, `US-05-02` AC-8): the
   * department and Unit of the day, the chain of the third branch, a price that is missing until the quote comes, and who
   * the routing table gives the need step to. Throws AccessRequestNoDepartmentError.
   */
  async assessProposal(
    tx: DbTx,
    input: Pick<AssessmentInput, 'employeeId' | 'expectedSpendOn' | 'now' | 'settings' | 'lockDepartment'>,
  ): Promise<ProposalAssessment> {
    const today = await this.organizationReads.businessToday(input.now, tx);
    const found = (await this.organizationReads.getOwningUnits([input.employeeId], today, tx)).get(input.employeeId);
    if (!found) throw new AccessRequestNoDepartmentError();
    const unit = this.organizationReads.requireUnitCostCenter(found);
    if (input.lockDepartment) await this.organizationReads.lockDepartmentShared(tx, unit.departmentId);

    const policy = proposalPolicy(input.settings.slaWorkingDays);
    const expectedSpendOn = input.expectedSpendOn ?? today;
    const gathered = await this.routing.gather(tx, {
      requesterEmployeeId: input.employeeId,
      departmentId: unit.departmentId,
      today,
      chainHasSpendStep: hasSpendStep(policy),
    });

    return {
      today,
      unit,
      policy,
      pricing: {
        status: 'MISSING',
        missingReason: 'AWAITING_QUOTE',
        expectedSpendOn,
        budgetYear: fiscalYearOf(expectedSpendOn, input.settings.fiscalYearStartMonth),
        amount: null,
        unitPrice: null,
        billingCycle: null,
        schedule: null,
      },
      routing: { ...gathered, decision: routeNeedStep(gathered.facts) },
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
   * What the request costs (`FR-3.2`): nothing for internal software, which also has no day the money goes out; for paid
   * software the amount made from the price of its plan, the term and the people it is for, or a missing price that
   * says why. The day the money is expected to go out is the sender's to give and today when they do not (`OQ-C-14`).
   */
  async priceFor(
    tx: DbTx,
    input: {
      planId: string;
      /** The department of the request: only an active subscription it owns gives a price; never another department's. */
      departmentId: string;
      free: boolean;
      termMonths: number;
      beneficiaries: number;
      expectedSpendOn: BusinessDate | undefined;
      today: BusinessDate;
      fiscalYearStartMonth: number;
    },
  ): Promise<PricingRecord> {
    if (input.free) {
      if (input.expectedSpendOn !== undefined) throw new AccessRequestSpendDateNotAllowedError();

      return {
        status: 'NOT_APPLICABLE',
        missingReason: null,
        expectedSpendOn: null,
        budgetYear: null,
        amount: null,
        unitPrice: null,
        billingCycle: null,
        schedule: null,
      };
    }
    const expectedSpendOn = input.expectedSpendOn ?? input.today;
    const price = await this.catalog.getPlanPrice(input.planId, input.departmentId, tx);
    const priced = priceRequest({
      unitPrice: price?.unitPrice ?? null,
      billingCycle: price?.billingCycle ?? null,
      termMonths: input.termMonths,
      beneficiaries: input.beneficiaries,
      expectedSpendOn,
      fiscalYearStartMonth: input.fiscalYearStartMonth,
    });
    if (priced.status === 'MISSING') {
      return {
        status: 'MISSING',
        missingReason: priced.reason,
        expectedSpendOn,
        budgetYear: priced.budgetYear,
        amount: null,
        unitPrice: null,
        billingCycle: null,
        schedule: null,
      };
    }

    return {
      status: 'PRICED',
      missingReason: null,
      expectedSpendOn,
      budgetYear: priced.budgetYear,
      amount: priced.amount,
      unitPrice: priced.unitPrice,
      billingCycle: priced.billingCycle,
      schedule: priced.periods,
    };
  }
}
