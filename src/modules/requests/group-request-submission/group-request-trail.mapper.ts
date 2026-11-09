import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput } from '../../audit/public/audit.types';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { hasSpendStep } from '../access-request/access-request.policy';
import type { GroupJudgement } from './group-submission-facts.service';
import type { PlannedNeedStep } from './group-need-routing.policy';

/**
 * What the Audit Trail says of a request for a group when it is sent (`US-05-17` AC-11): the request with the people it is for and
 * how many, one routing of the need for each step with the people it holds, and the routing of every line. The people are named in the
 * events so that each of them can be told, and no event carries an account identifier.
 */
export function submissionEvents(
  actor: AuthenticatedPrincipal,
  input: {
    organizationId: string;
    requestId: string;
    planId: string;
    expectedEndDate: string | null;
    state: string;
    judged: GroupJudgement;
    planned: readonly PlannedNeedStep<{ employeeId: string }>[];
    stepIds: readonly string[];
  },
): AuditEventInput[] {
  const { organizationId, requestId, judged, planned, stepIds } = input;
  const { policy, unit, routing } = judged.assessed;
  const { pricing } = judged;
  const people = judged.lines.map((line) => line.employeeId);

  return [
    accessRequestAuditEvent(actor, organizationId, 'ACCESS_REQUEST.SUBMITTED', 'ACCESS_REQUEST', requestId, {
      type: 'GROUP_GRANT',
      branch: policy.branch,
      state: input.state,
      planId: input.planId,
      expectedEndDate: input.expectedEndDate,
      requesterEmployeeId: actor.employeeId,
      createdByEmployeeId: actor.employeeId,
      beneficiaryEmployeeIds: people,
      lineCount: people.length,
      departmentId: unit.departmentId,
      costCenterId: unit.costCenter?.id ?? null,
      policyVersion: policy.version,
      hasSpendStep: hasSpendStep(policy),
      slaWorkingDays: policy.slaWorkingDays,
      pricingStatus: pricing.status,
      amountMinor: pricing.amount?.amountMinor.toString() ?? null,
      amountCurrency: pricing.amount?.currency ?? null,
      budgetYear: pricing.budgetYear,
      delegated: judged.senderIsHead,
    }),
    ...planned.map((entry, index) => {
      const { step } = entry;

      return accessRequestAuditEvent(
        actor,
        organizationId,
        'ACCESS_REQUEST.NEED_STEP_ROUTED',
        'ACCESS_REQUEST_STEP',
        stepIds[index],
        {
          requestId,
          routingRow: step.routingRow,
          outcome: entry.confirmedBySending
            ? 'CONFIRMED_BY_SENDING'
            : step.state === 'PENDING'
              ? 'ASSIGNED'
              : 'WAITING',
          assigneeEmployeeId: step.assigneeEmployeeId,
          role: entry.confirmedBySending ? 'MANAGER' : null,
          waitingReason: step.waitingReason,
          samePersonAsSpend: false,
          requesterEmployeeId: actor.employeeId,
          beneficiaryEmployeeIds: entry.lines.map((line) => line.employeeId),
          type: 'GROUP_GRANT',
          lineCount: entry.lines.length,
          departmentId: unit.departmentId,
          departmentHeadEmployeeId: routing.departmentHeadEmployeeId,
        },
      );
    }),
    accessRequestAuditEvent(actor, organizationId, 'ACCESS_REQUEST.LINES_ROUTED', 'ACCESS_REQUEST', requestId, {
      requestId,
      lines: planned.flatMap((entry, index) =>
        entry.lines.map((line) => ({
          employeeId: line.employeeId,
          stepId: stepIds[index],
          routingRow: entry.step.routingRow,
          state: entry.confirmedBySending ? 'NEED_CONFIRMED' : 'AWAITING_NEED',
        })),
      ),
    }),
  ];
}
