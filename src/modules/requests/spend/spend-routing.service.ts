import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { StepTargetService } from '../step-routing/step-target.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, AccessRequestState } from '../access-request/access-request.types';
import { codesOf, type CheckRoute } from './budget-check.policy';
import { BudgetCheckService, type NotCheckable } from './budget-check.service';
import type { CheckRecord, CheckTrigger } from './budget-check.repo';
import { routeFinanceReview, routeSpendStep } from '../step-routing/spend-routing.policy';
import { SpendStepRepo } from './spend-step.repo';

export type RoutingOutcome =
  | {
      status: 'ROUTED';
      route: CheckRoute;
      check: CheckRecord;
      /** Which step the request was given, if any. */
      opened: 'FINANCE_REVIEW' | 'SPEND_APPROVAL' | null;
    }
  | { status: 'NOT_CHECKABLE'; reason: NotCheckable };

type Opened = { state: AccessRequestState; opened: 'FINANCE_REVIEW' | 'SPEND_APPROVAL' };

/**
 * Checks a request against the budget and puts it where the check says (`US-06-12`, `US-06-13`): nowhere when the data is at
 * fault, to Finance when something is out of the ordinary, to the spending approver when nothing is. Nothing here approves
 * or refuses (`SoD-6`). The caller holds the lock on the request and the transaction; the check, the step and the state
 * move together, and a check that finds the request cannot be checked changes nothing.
 */
@Injectable()
export class SpendRoutingService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly checks: BudgetCheckService,
    private readonly steps: SpendStepRepo,
    private readonly identity: IdentityAccessApi,
    private readonly targets: StepTargetService,
    private readonly audit: AuditApi,
  ) {}

  /** Makes a check and moves the request where it says. The request must have no review or spend step open. */
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
    let moved: Opened | null = null;
    if (check.route === 'FINANCE_REVIEW') moved = await this.openReview(tx, request, now);
    else if (check.route === 'SPEND_APPROVAL') moved = await this.openSpend(tx, request, false, now);
    const state = moved?.state ?? 'AWAITING_SPEND_SUBMISSION';

    await this.requests.setState(tx, request.id, state);
    await this.recordChecked(tx, actor, request, check, trigger, state, moved);

    return {
      status: 'ROUTED',
      route: check.route,
      check,
      opened: moved?.opened ?? null,
    };
  }

  /** The audit event of a check and where it sent the request. */
  private async recordChecked(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    check: CheckRecord,
    trigger: CheckTrigger,
    state: AccessRequestState,
    moved: Opened | null,
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
          trigger,
          route: check.route,
          codes: codesOf(check).join(','),
          state,
          opened: moved?.opened ?? null,
          offPlan: check.offPlan,
        },
      ),
    );
  }

  /**
   * Who holds, or would hold, the spend step of the request: the spending approver, and nobody when nobody who still works can (the
   * step then waits). Finance does not complete the review of a request they will decide
   * (`SoD-8`); the same table gave the spend step in the first place.
   */
  async spendDeciderOf(tx: DbTx, request: AccessRequestRecord): Promise<string | null> {
    const assignment = routeSpendStep(
      { requesterEmployeeId: request.requesterEmployeeId, beneficiaryEmployeeIds: request.beneficiaryEmployeeIds },
      await this.targets.usableSpendingApproverEmployeeId(tx),
    );

    return assignment.outcome === 'ASSIGNED' ? assignment.assigneeEmployeeId : null;
  }

  /**
   * Finance gave an opinion to a request that waited for a version of the budget (J.3): it is checked again, as a check of its own
   * (`FINANCE_OUTCOME_WHILE_WAITING`). A request whose data is at fault (the year closed, a quote that is no longer in force) or that
   * cannot be checked goes back to the queue of its head, where the check runs when they send it again, and no spend step is made
   * (`QĐ-92a`). Otherwise the spend step is opened with the opinion in front of the approver: the review of Finance is not opened again,
   * whatever the check found, since Finance has just looked. The caller holds the lock of the request and ended the review step.
   */
  async routeAfterOpinionWhileWaiting(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    now: Date,
  ): Promise<void> {
    const outcome = await this.checks.run(tx, request, 'FINANCE_OUTCOME_WHILE_WAITING', actor, now);
    if (outcome.status === 'NOT_CHECKABLE') {
      await this.backToSubmission(tx, request);

      return;
    }
    const { check } = outcome;
    if (check.route === 'BLOCKED') {
      await this.requests.setState(tx, request.id, 'AWAITING_SPEND_SUBMISSION');
      await this.recordChecked(
        tx,
        actor,
        request,
        check,
        'FINANCE_OUTCOME_WHILE_WAITING',
        'AWAITING_SPEND_SUBMISSION',
        null,
      );

      return;
    }
    const state = await this.openSpendAfterReview(tx, actor, request, now);
    await this.recordChecked(tx, actor, request, check, 'FINANCE_OUTCOME_WHILE_WAITING', state, {
      state,
      opened: 'SPEND_APPROVAL',
    });
  }

  /**
   * A request that could not be checked goes back to the queue of its head, where the check runs again when they send it:
   * nothing was decided and nothing was made for Finance or the approver.
   */
  async backToSubmission(tx: DbTx, request: AccessRequestRecord): Promise<void> {
    await this.requests.setState(tx, request.id, 'AWAITING_SPEND_SUBMISSION');
  }

  /** Opens the spend step after Finance gave its opinion; the approver now has the opinion in front of them. Returns the state the request is in. */
  async openSpendAfterReview(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    now: Date,
  ): Promise<AccessRequestState> {
    const { state } = await this.openSpend(tx, request, false, now);
    await this.requests.setState(tx, request.id, state);
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.SPEND_STEP_OPENED',
        'ACCESS_REQUEST',
        request.id,
        {
          requestId: request.id,
          state,
        },
      ),
    );

    return state;
  }

  /** Opens a new review when the spending approver checks a request again and it is an exception Finance has not reviewed (`US-06-01` AC-18). */
  async reopenReview(tx: DbTx, actor: AuthenticatedPrincipal, request: AccessRequestRecord, now: Date): Promise<void> {
    const { state, opened } = await this.openReview(tx, request, now);
    await this.requests.setState(tx, request.id, state);
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.BUDGET_REFUSED_REVIEW_OPENED',
        'ACCESS_REQUEST',
        request.id,
        {
          requestId: request.id,
          state,
          opened,
        },
      ),
    );
  }

  /** Gives the review to Finance, or leaves it waiting for a Finance who can act, or goes straight to the approver when Finance is a party. */
  private async openReview(tx: DbTx, request: AccessRequestRecord, now: Date): Promise<Opened> {
    const finance = await this.identity.findUsableFinanceEmployeeId(tx);
    const review = routeFinanceReview(
      { requesterEmployeeId: request.requesterEmployeeId, beneficiaryEmployeeIds: request.beneficiaryEmployeeIds },
      finance,
    );
    // Finance is the one it is for: nobody independent can review it, and the approver is told so (`US-06-13` AC-5).
    if (review.outcome === 'SKIPPED') return this.openSpend(tx, request, true, now);

    await this.steps.open(tx, {
      requestId: request.id,
      kind: 'FINANCE_REVIEW',
      assigneeEmployeeId: review.outcome === 'ASSIGNED' ? review.assigneeEmployeeId : null,
      waitingReason: review.outcome === 'WAITING' ? review.reason : null,
      slaWorkingDays: request.policy.slaWorkingDays,
      now,
    });

    return {
      state: review.outcome === 'ASSIGNED' ? 'AWAITING_FINANCE_REVIEW' : 'WAITING_CONTROLLED',
      opened: 'FINANCE_REVIEW',
    };
  }

  /** Opens the spend step for the spending approver, or leaves it waiting: nobody takes it in their place. */
  private async openSpend(
    tx: DbTx,
    request: AccessRequestRecord,
    noIndependentReview: boolean,
    now: Date,
  ): Promise<Opened> {
    // Whoever holds the role and has left the company holds nothing, though the grant still names them (`FR-3.16`). The row of the
    // grant is locked `FOR SHARE`, so a revocation that is being made and this step take turns (`M6`).
    const assignment = routeSpendStep(
      { requesterEmployeeId: request.requesterEmployeeId, beneficiaryEmployeeIds: request.beneficiaryEmployeeIds },
      await this.targets.usableSpendingApproverEmployeeId(tx, { forShare: true }),
    );
    const assignee = assignment.outcome === 'ASSIGNED' ? assignment.assigneeEmployeeId : null;
    const samePerson = assignee !== null && request.needSteps.some((step) => step.assigneeEmployeeId === assignee);
    await this.steps.open(tx, {
      requestId: request.id,
      kind: 'SPEND_APPROVAL',
      assigneeEmployeeId: assignee,
      waitingReason: assignment.outcome === 'WAITING' ? assignment.reason : null,
      samePersonAsSpend: samePerson,
      noIndependentReview,
      slaWorkingDays: request.policy.slaWorkingDays,
      now,
    });
    // One person holding the need step and the spend step is flagged on both (`US-05-03` AC-9).
    if (samePerson) await this.steps.flagSamePerson(tx, request.id, assignee);

    return {
      state: assignment.outcome === 'ASSIGNED' ? 'AWAITING_SPEND_DECISION' : 'WAITING_CONTROLLED',
      opened: 'SPEND_APPROVAL',
    };
  }
}
