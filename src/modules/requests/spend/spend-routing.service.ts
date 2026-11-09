import { isSingleStep } from './spend-submission.policy';
import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { StepTargetService } from '../step-routing/step-target.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, AccessRequestState } from '../access-request/access-request.types';
import { codesOf, type BudgetOutcome } from './budget-check.policy';
import { BudgetCheckService, type NotCheckable } from './budget-check.service';
import type { CheckRecord, CheckTrigger } from './budget-check.repo';
import { routeSpendStep } from '../step-routing/spend-routing.policy';
import { SpendStepRepo, type SpendStepRecord } from './spend-step.repo';

export type RoutingOutcome =
  | {
      status: 'ROUTED';
      /** What the check said: within the base and uses the reserve go on to the approver (the second once the head confirms). */
      outcome: BudgetOutcome;
      check: CheckRecord;
      /** The spend step the request was given, if any: only a request within the base is given one by the check itself. */
      step: SpendStepRecord | null;
    }
  | { status: 'NOT_CHECKABLE'; reason: NotCheckable };

/**
 * Checks a request against the budget and puts it where the check says (`US-06-12`, `BR-MF1-06g`): within the base, the spend step is made
 * at once for the spending approver; uses the reserve, it stays in the queue of its head until they confirm it with a line of reason
 * (`ReserveConfirmationService`); blocked, it stays in the queue and says why. Nothing here approves or refuses (`SoD-6`). The caller holds
 * the lock on the request and the transaction; the check, the step and the state move together, and a check that finds the request
 * cannot be checked changes nothing.
 */
@Injectable()
export class SpendRoutingService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly checks: BudgetCheckService,
    private readonly steps: SpendStepRepo,
    private readonly targets: StepTargetService,
    private readonly audit: AuditApi,
  ) {}

  /** Makes a check and moves the request where it says. The request must have no spend step open. */
  async route(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    trigger: CheckTrigger,
    now: Date,
  ): Promise<RoutingOutcome> {
    const outcome = await this.checks.run(tx, request, trigger, actor, now);
    if (outcome.status === 'NOT_CHECKABLE') return outcome;

    const { check } = outcome;
    // A one-step request that needs the reserve goes on too: the spending approver decides the reserve themself (`BR-MF1-06`).
    const goesOn = check.outcome === 'WITHIN_BASE' || (check.outcome === 'USES_RESERVE' && isSingleStep(request));
    const opened = goesOn ? await this.openSpend(tx, request, now) : null;
    const state = opened?.state ?? 'AWAITING_SPEND_SUBMISSION';

    await this.requests.setState(tx, request.id, state);
    await this.recordChecked(tx, actor, request, check, state, opened !== null);

    return { status: 'ROUTED', outcome: check.outcome ?? 'BLOCKED', check, step: opened?.step ?? null };
  }

  /** The audit event of a check and where it sent the request; the notices of the head and the requester are projected from it. */
  async recordChecked(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    check: CheckRecord,
    state: AccessRequestState,
    opened: boolean,
  ): Promise<void> {
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.BUDGET_CHECKED',
        'ACCESS_REQUEST',
        request.id,
        {
          requestId: request.id,
          checkId: check.id,
          number: check.number,
          trigger: check.trigger,
          route: check.route,
          outcome: check.outcome,
          blockReasons: check.blockReasons.join(','),
          overBaseBy: check.overBaseByMinor?.toString() ?? null,
          overBy: check.overByMinor?.toString() ?? null,
          codes: codesOf(check).join(','),
          state,
          opened: opened ? 'SPEND_APPROVAL' : null,
        },
      ),
    );
  }

  /**
   * Who holds, or would hold, the spend step of the request: the spending approver, and nobody when nobody who still works can (the
   * step then waits).
   */
  async spendDeciderOf(tx: DbTx, request: AccessRequestRecord): Promise<string | null> {
    const assignment = routeSpendStep(
      { requesterEmployeeId: request.requesterEmployeeId, beneficiaryEmployeeIds: request.beneficiaryEmployeeIds },
      await this.targets.usableSpendingApproverEmployeeId(tx),
    );

    return assignment.outcome === 'ASSIGNED' ? assignment.assigneeEmployeeId : null;
  }

  /**
   * A request that could not be checked goes back to the queue of its head, where the check runs again when they send it:
   * nothing was decided and nothing was made for the approver.
   */
  async backToSubmission(tx: DbTx, request: AccessRequestRecord): Promise<void> {
    await this.requests.setState(tx, request.id, 'AWAITING_SPEND_SUBMISSION');
  }

  /**
   * Opens the spend step for the spending approver, or leaves it waiting: nobody takes it in their place. The request is given the state
   * of the step (the caller writes it). Used by the check of a request within the base and by the confirmation of the reserve.
   */
  async openSpend(
    tx: DbTx,
    request: AccessRequestRecord,
    now: Date,
  ): Promise<{ state: AccessRequestState; step: SpendStepRecord }> {
    // Whoever holds the role and has left the company holds nothing, though the grant still names them (`FR-3.16`). The row of the
    // grant is locked `FOR SHARE`, so a revocation that is being made and this step take turns (`M6`).
    const assignment = routeSpendStep(
      { requesterEmployeeId: request.requesterEmployeeId, beneficiaryEmployeeIds: request.beneficiaryEmployeeIds },
      await this.targets.usableSpendingApproverEmployeeId(tx, { forShare: true }),
    );
    const assignee = assignment.outcome === 'ASSIGNED' ? assignment.assigneeEmployeeId : null;
    const samePerson = assignee !== null && request.needSteps.some((step) => step.assigneeEmployeeId === assignee);
    const step = await this.steps.open(tx, {
      requestId: request.id,
      kind: 'SPEND_APPROVAL',
      assigneeEmployeeId: assignee,
      waitingReason: assignment.outcome === 'WAITING' ? assignment.reason : null,
      samePersonAsSpend: samePerson,
      slaWorkingDays: request.policy.slaWorkingDays,
      now,
    });
    // One person holding the need step and the spend step is flagged on both (`US-05-03` AC-9).
    if (samePerson) await this.steps.flagSamePerson(tx, request.id, assignee);

    return { state: assignment.outcome === 'ASSIGNED' ? 'AWAITING_SPEND_DECISION' : 'WAITING_CONTROLLED', step };
  }
}
