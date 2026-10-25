import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogService } from '../../catalog/catalog.service';
import { LicensingService } from '../../licensing/licensing.service';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import { OrganizationService } from '../../organization/organization.service';
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

/** What the person already holds of the plan: the seat that makes asking for it again pointless (`US-05-01` AC-2). */
export interface HeldAccess {
  assignmentId: string;
  effectiveFrom: BusinessDate;
  validUntil: BusinessDate | null;
}

type OwningUnit = Awaited<ReturnType<OrganizationService['getOwningUnits']>> extends Map<string, infer U> ? U : never;
type SeatTarget = NonNullable<Awaited<ReturnType<CatalogService['findPlanSeatTargets']>>[number]>;

/** Everything a request is decided by, read for one person asking for one plan on one day. */
export interface Assessment {
  today: BusinessDate;
  unit: OwningUnit;
  jobTitleId: string | null;
  target: SeatTarget;
  policy: RequestPolicy;
  outsideStandard: boolean;
  pricing: PricingRecord;
  routing: GatheredRouting & { decision: RoutingDecision };
  heldAccess: HeldAccess | null;
}

/** What a proposal of software that is not in the catalog is judged by: there is no plan, so no toolset, price or seat. */
export interface ProposalAssessment {
  today: BusinessDate;
  unit: OwningUnit;
  policy: RequestPolicy;
  /** Missing until the IT Admin records a quote (`US-05-06` AC-11): the request is not yet priced. */
  pricing: PricingRecord;
  routing: GatheredRouting & { decision: RoutingDecision };
}

export interface AssessmentInput {
  /** The person the request is for: their department, toolset and seat are what it is judged by. */
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
}

/**
 * The facts a request is judged by, read in one place so that what a person is shown before sending and what is fixed
 * when they send are the same (`US-05-01` AC-11): the department and Unit of the day, the plan and its price, whether the
 * plan is in the standard toolset, the seat the person already holds, and who the routing table gives the need step to.
 * It writes nothing and decides nothing: the callers refuse or record.
 */
@Injectable()
export class RequestAssessmentService {
  constructor(
    private readonly organization: OrganizationService,
    private readonly catalog: CatalogService,
    private readonly routing: RoutingFactsService,
    private readonly parameters: OperatingParametersService,
    private readonly licensing: LicensingService,
  ) {}

  /** Read before the transaction opens, so a slow parameter read never holds a lock. */
  async settings(): Promise<RequestSettings> {
    return {
      slaWorkingDays: Number(await this.parameters.getValue(APPROVAL_SLA_PARAMETER)),
      fiscalYearStartMonth: Number(await this.parameters.getValue(FISCAL_YEAR_PARAMETER)),
    };
  }

  /**
   * Throws AccessRequestNoDepartmentError, AccessRequestPlanNotFoundError, AccessRequestApplicationRetiredError and
   * AccessRequestSpendDateNotAllowedError.
   */
  async assess(tx: DbTx, input: AssessmentInput): Promise<Assessment> {
    const today = await this.organization.businessToday(input.now, tx);
    const unit = (await this.organization.getOwningUnits([input.employeeId], today, tx)).get(input.employeeId);
    if (!unit) throw new AccessRequestNoDepartmentError();
    if (input.lockDepartment) await this.organization.lockDepartmentShared(tx, unit.departmentId);

    const placement = await this.organization.getEmployeePlacement(input.employeeId, today);
    const [target] = await this.catalog.findPlanSeatTargets([input.planId], tx);
    if (!target) throw new AccessRequestPlanNotFoundError();
    if (target.applicationStatus === 'RETIRED') throw new AccessRequestApplicationRetiredError();

    const outsideStandard =
      !placement ||
      !(await this.catalog.isPlanInStandardToolset(unit.departmentId, placement.jobTitleId, input.planId, tx));
    const policy = policyFor(target.applicationKind, input.settings.slaWorkingDays);
    const pricing = await this.priceFor(tx, {
      planId: input.planId,
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
      jobTitleId: placement?.jobTitleId ?? null,
      target,
      policy,
      outsideStandard,
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
    const today = await this.organization.businessToday(input.now, tx);
    const unit = (await this.organization.getOwningUnits([input.employeeId], today, tx)).get(input.employeeId);
    if (!unit) throw new AccessRequestNoDepartmentError();
    if (input.lockDepartment) await this.organization.lockDepartmentShared(tx, unit.departmentId);

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
    const price = await this.catalog.getPlanPrice(input.planId, tx);
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
