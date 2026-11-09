import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RoutingFactsService } from '../access-request/routing-facts.service';
import { routeNeedStep } from '../access-request/routing.policy';
import { routeSpendStep } from './spend-routing.policy';
import type { StepTarget } from './reassignment.policy';
import type { ReassignableRequest, ReassignableStep } from './step-reassignment.repo';

/** What the tables read on one day, once for a pass over many requests: the spending approver who can act today. */
export interface TodayFacts {
  today: BusinessDate;
  /** The spending approver when they still work: a role whose holder has left is held by nobody. */
  spendingApproverEmployeeId: string | null;
}

/**
 * Who each kind of step would be given on today's data, by running the routing tables that gave it in the first place on the
 * facts of today (`FR-3.16`, `US-05-12`). No table of its own: the need step is `routeNeedStep` on the department the
 * requester is in now, the spend step `routeSpendStep`, and the assessment goes to the IT Admin in charge of the department of the
 * requester. A person who has left holds nothing, whether or not they are still named, which is also what the spend step is given
 * from (`FR-3.16` last sentence).
 */
@Injectable()
export class StepTargetService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly routing: RoutingFactsService,
  ) {}

  async assessmentTarget(tx: DbTx, requesterEmployeeId: string, now: Date): Promise<string | null> {
    const today = await this.organizationReads.businessToday(now, tx);
    return (await this.organizationReads.getItAdminInCharge(requesterEmployeeId, today, tx))?.itAdminEmployeeId ?? null;
  }

  /**
   * The spending approver now, leaving out one who has left the company. With `forShare` the row of the grant is locked until the
   * transaction ends, which a step that is being opened asks for (`M6`).
   */
  async usableSpendingApproverEmployeeId(tx: DbTx, options?: { forShare?: boolean }): Promise<string | null> {
    const holder = await this.identity.getSpendingApproverEmployeeId(tx, options);
    if (holder === null) return null;
    const [found] = await this.organizationReads.getEmployees([holder], tx);

    return found?.status === 'ACTIVE' ? holder : null;
  }

  async gatherToday(tx: DbTx, now: Date): Promise<TodayFacts> {
    return {
      today: await this.organizationReads.businessToday(now, tx),
      spendingApproverEmployeeId: await this.usableSpendingApproverEmployeeId(tx),
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
          : { assigneeEmployeeId: null, reason: decision.outcome === 'NOT_REQUIRED' ? 'NO_DEPARTMENT_HEAD' : decision.reason };
      }
      case 'SPEND_APPROVAL': {
        const assignment = routeSpendStep(people, facts.spendingApproverEmployeeId);

        return assignment.outcome === 'ASSIGNED'
          ? { assigneeEmployeeId: assignment.assigneeEmployeeId, routingRow: null }
          : { assigneeEmployeeId: null, reason: assignment.reason };
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
