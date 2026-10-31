import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { ApprovalRoleHolders } from '../../identity-access/public/identity-access.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RoutingFactsService } from '../access-request/routing-facts.service';
import { routeNeedStep } from '../access-request/routing.policy';
import { routeFinanceReview, routeSpendStep } from './spend-routing.policy';
import type { StepTarget } from './reassignment.policy';
import type { ReassignableRequest, ReassignableStep } from './step-reassignment.repo';

/** What the tables read on one day, once for a pass over many requests: the roles whose holders can act today. */
export interface TodayFacts {
  today: BusinessDate;
  /** The holders of the three approval roles who still work: a role whose holder has left is held by nobody. */
  roles: ApprovalRoleHolders;
  /** Finance on an account that can act now, or null. */
  financeEmployeeId: string | null;
}

/**
 * Who each kind of step would be given on today's data, by running the routing tables that gave it in the first place on the
 * facts of today (`FR-3.16`, `US-05-12`). No table of its own: the need step is `routeNeedStep` on the department the
 * requester is in now, the spend step `routeSpendStep`, the review of Finance `routeFinanceReview`, and the assessment goes to
 * the IT Admin in charge of the department of the requester. A person who has left holds nothing, whether or not they are
 * still named, which is also what the spend step and the review are given from (`FR-3.16` last sentence).
 */
@Injectable()
export class StepTargetService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly routing: RoutingFactsService,
  ) {}

  /** Who holds the three approval roles now, leaving out whoever has left the company. */
  async usableApprovalRoleHolders(tx: DbTx): Promise<ApprovalRoleHolders> {
    const holders = await this.identity.getApprovalRoleHolders(tx);
    const named = [
      holders.spendingApproverEmployeeId,
      holders.conflictSubstituteEmployeeId,
      holders.fallbackApproverEmployeeId,
    ].filter((id): id is string => id !== null);
    const working = new Set(
      (named.length === 0 ? [] : await this.organizationReads.getEmployees(named, tx))
        .filter((employee) => employee.status === 'ACTIVE')
        .map((employee) => employee.id),
    );
    const whoCanAct = (id: string | null): string | null => (id !== null && working.has(id) ? id : null);

    return {
      spendingApproverEmployeeId: whoCanAct(holders.spendingApproverEmployeeId),
      conflictSubstituteEmployeeId: whoCanAct(holders.conflictSubstituteEmployeeId),
      fallbackApproverEmployeeId: whoCanAct(holders.fallbackApproverEmployeeId),
    };
  }

  async gatherToday(tx: DbTx, now: Date): Promise<TodayFacts> {
    return {
      today: await this.organizationReads.businessToday(now, tx),
      roles: await this.usableApprovalRoleHolders(tx),
      financeEmployeeId: await this.identity.findUsableFinanceEmployeeId(tx),
    };
  }

  /** Who the step would be given today, or nobody and why. The step is not changed. */
  async targetOf(
    tx: DbTx,
    request: ReassignableRequest,
    step: ReassignableStep,
    facts: TodayFacts,
  ): Promise<StepTarget> {
    const people = {
      requesterEmployeeId: request.requesterEmployeeId,
      beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
    };
    switch (step.kind) {
      case 'NEED': {
        const gathered = (
          await this.routing.gather(tx, {
            requesterEmployeeId: request.requesterEmployeeId,
            departmentId: await this.needDepartment(tx, request, facts.today),
            today: facts.today,
            chainHasSpendStep: request.chainHasSpendStep,
          })
        ).facts;
        // The step that holds the line of the head of a group is routed as a head's own request is: the head never decides it.
        const head = gathered.departmentHeadEmployeeId;
        const holdsHead =
          head !== null && request.lines.some((line) => line.needStepId === step.id && line.employeeId === head);
        const decision = routeNeedStep(holdsHead ? { ...gathered, requesterEmployeeId: head } : gathered);

        return decision.outcome === 'ASSIGNED'
          ? { assigneeEmployeeId: decision.assigneeEmployeeId, routingRow: decision.row }
          : { assigneeEmployeeId: null, reason: decision.reason };
      }
      case 'SPEND_APPROVAL': {
        const assignment = routeSpendStep(people, {
          spendingApproverEmployeeId: facts.roles.spendingApproverEmployeeId,
          conflictSubstituteEmployeeId: facts.roles.conflictSubstituteEmployeeId,
        });

        return assignment.outcome === 'ASSIGNED'
          ? { assigneeEmployeeId: assignment.assigneeEmployeeId, routingRow: null }
          : { assigneeEmployeeId: null, reason: assignment.reason };
      }
      case 'FINANCE_REVIEW': {
        const review = routeFinanceReview(people, facts.financeEmployeeId);

        // Finance being a party to a review that is already open leaves nobody independent to hold it: it waits.
        return review.outcome === 'ASSIGNED'
          ? { assigneeEmployeeId: review.assigneeEmployeeId, routingRow: null }
          : { assigneeEmployeeId: null, reason: 'NO_FINANCE_REVIEWER' };
      }
      case 'IT_ASSESSMENT': {
        const inCharge = await this.organizationReads.getItAdminInCharge(request.requesterEmployeeId, facts.today, tx);

        return inCharge?.itAdminEmployeeId
          ? { assigneeEmployeeId: inCharge.itAdminEmployeeId, routingRow: null }
          : { assigneeEmployeeId: null, reason: 'NO_IT_ADMIN_IN_CHARGE' };
      }
    }
  }

  /**
   * The department the need step is routed for. Only a request for internal software with no fee follows where its requester is now,
   * or keeps the one it was sent for when they have none (`FR-3.16`); a paid request, a proposal of new software and a service account
   * keep the department they were sent for whoever moves (`QĐ-90b`, `QĐ-86c`).
   */
  private async needDepartment(tx: DbTx, request: ReassignableRequest, today: BusinessDate): Promise<string> {
    if (request.type === 'SERVICE_ACCOUNT' || request.branch !== 'INTERNAL_FREE') return request.departmentId;
    const placement = await this.organizationReads.getEmployeePlacement(request.requesterEmployeeId, today, tx);

    return placement?.departmentId ?? request.departmentId;
  }
}
