import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { PricingRecord } from '../access-request/access-request.types';
import {
  RequestAssessmentService,
  type Assessment,
  type RequestSettings,
} from '../access-request/request-assessment.service';
import {
  checkGroupPlan,
  checkLineCount,
  checkLines,
  type LineCountRefusals,
  type LineFacts,
  type PlanRefusal,
  type RefusedLine,
} from '../group-request/group-request.policy';

export interface GroupLineInput {
  employeeId: string;
  /** The day the access of this person ends, when they are not staff (`US-05-17` AC-8). */
  expectedEndDate?: BusinessDate;
}

export interface GroupSubmissionInput {
  senderEmployeeId: string;
  planId: string;
  termMonths: number;
  expectedSpendOn: BusinessDate | undefined;
  lines: readonly GroupLineInput[];
  now: Date;
  settings: RequestSettings;
  /** Sending locks the department of the sender and the people named against change until commit; checking locks nothing. */
  lockPeople: boolean;
}

/** Everything a request for a group is judged by on the day it is sent, read once: the check and the sending are the same read. */
export interface GroupJudgement {
  today: BusinessDate;
  /** The plan, the department of the sender and who the routing table gives the need step to, as for a request of one person. */
  assessed: Assessment;
  senderIsHead: boolean;
  /** Who heads the department of the sender on the day, whether or not they can still act. */
  headEmployeeId: string | null;
  planRefusal: PlanRefusal | null;
  count: LineCountRefusals;
  refused: RefusedLine[];
  /** The people named, each once, in the order they were named. */
  lines: GroupLineInput[];
  /** What the request costs for the people named. */
  pricing: PricingRecord;
}

/**
 * Reads what a request for a group is judged by (`US-05-17` AC-2, AC-8, AC-12 to AC-15): the plan and the department of the
 * sender as for a request of one person, then each person named: where they are, whether they work here, their email and end day,
 * whether they hold the plan or have a request for it open. It writes nothing
 * and decides nothing: `POST /group-requests/check` shows it, and the sending refuses or records.
 */
@Injectable()
export class GroupSubmissionFactsService {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly licensing: LicensingApi,
    private readonly assessment: RequestAssessmentService,
    private readonly requests: AccessRequestRepo,
  ) {}

  /** Throws AccessRequestNoDepartmentError, AccessRequestPlanNotFoundError and AccessRequestApplicationRetiredError. */
  async judge(tx: DbTx, input: GroupSubmissionInput): Promise<GroupJudgement> {
    const assessed = await this.assessment.assess(tx, {
      employeeId: input.senderEmployeeId,
      planId: input.planId,
      termMonths: input.termMonths,
      expectedSpendOn: input.expectedSpendOn,
      now: input.now,
      settings: input.settings,
      lockDepartment: input.lockPeople,
    });
    const { today, unit, target, routing } = assessed;
    const headEmployeeId = routing.departmentHeadEmployeeId;
    const senderIsHead = headEmployeeId === input.senderEmployeeId;

    const planRefusal = checkGroupPlan(target);
    const requested = input.lines.map((line) => line.employeeId);
    const count = checkLineCount({ senderIsHead, requested });
    const lines = input.lines.filter((line, index) => requested.indexOf(line.employeeId) === index);
    const ids = lines.map((line) => line.employeeId);

    const [people, units, open] = await Promise.all([
      this.organization.getEmployees(ids, tx),
      this.organization.getOwningUnits(ids, today, tx),
      this.requests.openRequestHolders(tx, input.planId, ids),
    ]);
    const known = new Map(people.map((person) => [person.id, person]));
    const facts: LineFacts[] = [];
    for (const line of lines) {
      const person = known.get(line.employeeId);
      const own = units.get(line.employeeId);
      if (input.lockPeople && person) await this.organization.lockEmployeeForShare(tx, line.employeeId);
      facts.push({
        employeeId: line.employeeId,
        departmentId: person ? (own?.departmentId ?? null) : null,
        active: person?.status === 'ACTIVE',
        workEmail: person?.workEmail ?? null,
        employmentType: person?.employmentType ?? 'STAFF',
        hireDate: person?.hireDate ?? today,
        expectedEndDate: line.expectedEndDate,
        holdsAccess: person ? await this.holds(line.employeeId, input.planId) : false,
        hasOpenRequest: open.has(line.employeeId),
        isHeadOwnLine: senderIsHead && line.employeeId === input.senderEmployeeId,
      });
    }

    // The price is of the people named, and only a plan a group may take is priced as one (`AC-5`).
    const pricing =
      planRefusal === null
        ? await this.assessment.priceFor(tx, {
            planId: input.planId,
            departmentId: unit.departmentId,
            free: false,
            termMonths: input.termMonths,
            beneficiaries: lines.length,
            expectedSpendOn: input.expectedSpendOn,
            today,
            fiscalYearStartMonth: input.settings.fiscalYearStartMonth,
          })
        : assessed.pricing;

    return {
      today,
      assessed,
      senderIsHead,
      headEmployeeId,
      planRefusal,
      count,
      refused: checkLines(unit.departmentId, facts, today),
      lines,
      pricing,
    };
  }

  private async holds(employeeId: string, planId: string): Promise<boolean> {
    const { total } = await this.licensing.getSeatsHeldInPlans(employeeId, [planId], { skip: 0, take: 1 });

    return total > 0;
  }
}
