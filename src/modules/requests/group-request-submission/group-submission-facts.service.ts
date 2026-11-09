import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RequestPartyEligibilityApi } from '../../identity-access/public/request-party-eligibility.api';
import { RequestPartyIneligibleError } from '../../identity-access/public/request-party.errors';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { PricingRecord } from '../access-request/access-request.types';
import { RequestFactsService, type Assessment, type RequestSettings } from '../access-request/request-facts.service';
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
  /** The day the access of this person ends: the one the group names, for every person of it (`US-05-17` AC-8). */
  expectedEndDate?: BusinessDate | null;
}

export interface GroupSubmissionInput {
  senderEmployeeId: string;
  planId: string;
  /** The day the access of every person named ends; null for no end. */
  expectedEndDate: BusinessDate | null;
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
    private readonly organizationReads: OrganizationReadApi,
    private readonly licensing: LicensingApi,
    private readonly assessment: RequestFactsService,
    private readonly requests: AccessRequestRepo,
    private readonly requestParties: RequestPartyEligibilityApi,
  ) {}

  /**
   * A sender who can never be a party of a Request (the spending approver) is refused with the answer of every route that sends one,
   * before any department is read (`D-S21`). Sending judges under the lock of the account, the check judges without one.
   * Throws RequestPartyIneligibleError.
   */
  async requireEligibleSender(tx: DbTx, senderEmployeeId: string, options: { lock: boolean }): Promise<void> {
    const parties = { requesterEmployeeId: senderEmployeeId, beneficiaryEmployeeIds: [senderEmployeeId] };
    if (options.lock) return this.requestParties.assertEligible(tx, parties);

    const block = await this.requestParties.blockOf(parties, tx);
    if (block !== null) throw new RequestPartyIneligibleError(block);
  }

  /** Throws AccessRequestNoDepartmentError, AccessRequestPlanNotFoundError and AccessRequestApplicationRetiredError. */
  async judge(tx: DbTx, input: GroupSubmissionInput): Promise<GroupJudgement> {
    const assessed = await this.assessment.assess(tx, {
      employeeId: input.senderEmployeeId,
      planId: input.planId,
      expectedEndDate: input.expectedEndDate,
      now: input.now,
      settings: input.settings,
      lockDepartment: input.lockPeople,
    });
    const { today, unit, target, routing } = assessed;
    const headEmployeeId = routing.departmentHeadEmployeeId;
    const senderIsHead = headEmployeeId === input.senderEmployeeId;
    if (senderIsHead && !assessed.policy.chain.includes('NEED')) assessed.policy = { ...assessed.policy, chain: ['NEED', ...assessed.policy.chain] };

    const planRefusal = checkGroupPlan(target);
    const requested = input.lines.map((line) => line.employeeId);
    const count = checkLineCount({ senderIsHead, requested });
    const lines = input.lines
      .filter((line, index) => requested.indexOf(line.employeeId) === index)
      .map((line) => ({ employeeId: line.employeeId, expectedEndDate: input.expectedEndDate }));
    const ids = lines.map((line) => line.employeeId);

    const people = await this.organizationReads.getEmployees(ids, tx);
    const units = await this.organizationReads.getOwningUnits(ids, today, tx);
    const open = await this.requests.openRequestHolders(tx, input.planId, ids);
    const known = new Map(people.map((person) => [person.id, person]));
    // The employees are locked first and their accounts after (employee, then account); checking locks nothing (`D-S21`).
    if (input.lockPeople) {
      for (const line of lines) {
        if (known.has(line.employeeId)) await this.organizationReads.lockEmployeeForShare(tx, line.employeeId);
      }
    }
    const party = await this.requestParties.ineligibleAmong(ids, tx, { lockForShare: input.lockPeople });
    const facts: LineFacts[] = [];
    for (const line of lines) {
      const person = known.get(line.employeeId);
      const own = units.get(line.employeeId);
      facts.push({
        employeeId: line.employeeId,
        departmentId: person ? (own?.departmentId ?? null) : null,
        active: person?.status === 'ACTIVE',
        workEmail: person?.workEmail ?? null,
        employmentType: person?.employmentType ?? 'STAFF',
        hireDate: person?.hireDate ?? today,
        holdsAccess: person ? await this.holds(line.employeeId, input.planId) : false,
        hasOpenRequest: open.has(line.employeeId),
        isDepartmentHead: headEmployeeId !== null && line.employeeId === headEmployeeId,
        termRequired: input.expectedEndDate === null && (person?.employmentType ?? 'STAFF') !== 'STAFF',
        spendingApprover: party.get(line.employeeId) === 'SPENDING_APPROVER',
      });
    }

    // The price is of the people named, and only a plan a group may take is priced as one (`AC-5`).
    const pricing =
      planRefusal === null
        ? await this.assessment.priceFor(tx, {
            planId: input.planId,
            free: false,
            beneficiaries: lines.length,
            checkDate: today,
            endDate: input.expectedEndDate,
          })
        : assessed.pricing;

    return {
      today,
      assessed,
      senderIsHead,
      headEmployeeId,
      planRefusal,
      count,
      refused: checkLines(unit.departmentId, facts),
      lines,
      pricing,
    };
  }

  private async holds(employeeId: string, planId: string): Promise<boolean> {
    const { total } = await this.licensing.getSeatsHeldInPlans(employeeId, [planId], { skip: 0, take: 1 });

    return total > 0;
  }
}
