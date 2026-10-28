import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import type { AssignmentFacts } from '../../licensing/licensing-renewal.types';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { hasSpendStep } from '../access-request/access-request.policy';
import type { Assessment } from '../access-request/request-assessment.service';
import type { RenewalBodyDto } from './renewal-request.dto';

/** The row of the routing table of `US-05-03` for a head who sends for somebody else of the department. */
export const DELEGATED_ROW = 5;

/**
 * The audit events of sending a request for a renewal: the request and where its need step went. The events carry who, which
 * seat, the ends and the amount; never the reason or the identifier of the account.
 */
@Injectable()
export class RenewalRequestTrail {
  constructor(private readonly audit: AuditService) {}

  async submitted(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    input: {
      created: { id: string; needStepId: string };
      assessed: Assessment;
      state: string;
      input: {
        body: RenewalBodyDto;
        facts: AssignmentFacts;
        previousEnd: BusinessDate;
        byHead: boolean;
        termMonths: number;
        consecutiveMonths: number;
      };
    },
  ): Promise<void> {
    const { created, assessed } = input;
    const { body, facts, byHead } = input.input;
    const { policy, pricing, unit, routing } = assessed;
    const { decision } = routing;
    await this.audit.record(
      tx,
      accessRequestAuditEvent(actor, organizationId, 'ACCESS_REQUEST.SUBMITTED', 'ACCESS_REQUEST', created.id, {
        type: 'RENEWAL',
        branch: policy.branch,
        state: input.state,
        planId: facts.planId,
        termMonths: input.input.termMonths,
        requesterEmployeeId: actor.employeeId,
        beneficiaryEmployeeIds: [facts.employeeId],
        departmentId: unit.departmentId,
        costCenterId: unit.costCenter?.id ?? null,
        policyVersion: policy.version,
        hasSpendStep: hasSpendStep(policy),
        slaWorkingDays: policy.slaWorkingDays,
        pricingStatus: pricing.status,
        amountMinor: pricing.amount?.amountMinor.toString() ?? null,
        amountCurrency: pricing.amount?.currency ?? null,
        budgetYear: pricing.budgetYear,
        expectedSpendOn: pricing.expectedSpendOn,
        delegated: byHead,
        assignmentId: facts.assignmentId,
        previousExpectedEndDate: input.input.previousEnd,
        newExpectedEndDate: body.newExpectedEndDate,
        consecutiveMonths: input.input.consecutiveMonths,
      }),
    );
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        organizationId,
        'ACCESS_REQUEST.NEED_STEP_ROUTED',
        'ACCESS_REQUEST_STEP',
        created.needStepId,
        {
          type: 'RENEWAL',
          requestId: created.id,
          routingRow: byHead ? DELEGATED_ROW : decision.row,
          outcome: byHead ? 'CONFIRMED_BY_SENDING' : decision.outcome,
          assigneeEmployeeId: byHead
            ? actor.employeeId
            : decision.outcome === 'ASSIGNED'
              ? decision.assigneeEmployeeId
              : null,
          role: byHead ? 'MANAGER' : decision.outcome === 'ASSIGNED' ? decision.role : null,
          waitingReason: !byHead && decision.outcome === 'WAITING' ? decision.reason : null,
          samePersonAsSpend: !byHead && decision.outcome === 'ASSIGNED' && decision.samePersonAsSpend,
          requesterEmployeeId: actor.employeeId,
          beneficiaryEmployeeId: facts.employeeId,
          departmentId: unit.departmentId,
          departmentHeadEmployeeId: routing.departmentHeadEmployeeId,
        },
      ),
    );
  }
}
