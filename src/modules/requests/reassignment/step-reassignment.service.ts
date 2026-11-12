import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import type { OperatorAuditActor } from '../../licensing/public/licensing.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ControlledWaitAlertService } from './controlled-wait-alert.service';
import {
  decideReassignment,
  requestStateFor,
  touchesHeldStep,
  type OpenStep,
  type ReassignableStepKind,
  type ReassignmentTrigger,
} from '../step-routing/reassignment.policy';
import { reassignmentAuditEvent } from './reassignment-audit.mapper';
import {
  StepReassignmentRepo,
  type ReassignableRequest,
  type ReassignableStep,
} from '../step-routing/step-reassignment.repo';
import { StepTargetService, type TodayFacts } from '../step-routing/step-target.service';

/** The events a pass of the worker looks again at a request for. */
export type SweepTrigger = 'WAITING_RETRY' | 'HOLDER_LEFT' | 'EFFECTIVE_DATE_REACHED';

/** What a pass changed, for the log and the tests: nothing at all when the data did not move. */
export interface ReconcileResult {
  requests: number;
  /** Steps taken from one holder and given to another. */
  redetermined: number;
  /** Steps that were held and now wait for somebody valid. */
  madeToWait: number;
  /** Steps that waited and are now held. */
  assignedFromWait: number;
  /** Steps that went on waiting, for another reason (`QĐ-93k(2)`). */
  rewaited: number;
  /** Alerts raised for a stretch of waiting that had none. */
  alerted: number;
}

const OPEN: ReadonlySet<string> = new Set(['PENDING', 'WAITING']);

/**
 * Who holds the open steps of the requests an event may concern (`FR-3.16`, `US-05-11`, `US-05-12`): the routing tables run
 * again on today's data, and a step goes to the person they name, stays where it is, or waits under control when they name
 * nobody. The caller owns the transaction (the change that caused the event, or one request of a sweep); the requests are
 * locked by id, and everything that moves is written in it: the step, the state of the request, the audit event and the alert.
 *
 * What never moves: the deadline of a step (its creation time), the policy of the request, its department and Cost Center,
 * a step that is decided or closed, a step the person who sends for others already confirmed, and the task of the IT Admin to
 * carry out a grant. Running it again on the same data writes nothing, which is what makes a listener that hears an event
 * twice safe.
 */
@Injectable()
export class StepReassignmentService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: StepReassignmentRepo,
    private readonly targets: StepTargetService,
    private readonly alerts: ControlledWaitAlertService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  // --- what the worker looks at: the requests no event carried, each in a transaction of its own -------------------

  /** The requests that have a step waiting for somebody valid. */
  waitingRequestIds(): Promise<string[]> {
    return this.repo.waitingRequestIds();
  }

  /** The requests with a step held by somebody who no longer works for the company. */
  async requestIdsHeldByLeavers(): Promise<string[]> {
    const holders = await this.repo.holderIds();
    if (holders.length === 0) return [];
    const left = (await this.organizationReads.getEmployees(holders))
      .filter((employee) => employee.status !== 'ACTIVE')
      .map((employee) => employee.id);

    return this.repo.requestIdsHeldBy(left);
  }

  /** The next requests, by id after `after`, whose need step is held: the pass of the day over every held need step. */
  heldNeedRequestIds(after: string | null, limit: number): Promise<string[]> {
    return this.repo.pendingNeedRequestIds(after, limit);
  }

  /** Looks again at one request in a transaction of its own, so that one that fails does not hold back the others. */
  reconcileInOwnTransaction(
    requestId: string,
    trigger: SweepTrigger,
    correlationId: string,
    now: Date,
  ): Promise<ReconcileResult> {
    return this.runner.run((tx) =>
      this.reconcileRequests(tx, [requestId], { kind: trigger, employeeId: null }, correlationId, now),
    );
  }

  // --- the reconciliation, in the transaction of the caller ------------------------------------------------------

  async reconcileRequests(
    tx: DbTx,
    requestIds: readonly string[],
    trigger: ReassignmentTrigger,
    correlationId: string,
    now: Date,
    operator?: OperatorAuditActor,
  ): Promise<ReconcileResult> {
    const result: ReconcileResult = {
      requests: 0,
      redetermined: 0,
      madeToWait: 0,
      assignedFromWait: 0,
      rewaited: 0,
      alerted: 0,
    };
    const requests = await this.repo.lockWithOpenSteps(tx, requestIds);
    if (requests.length === 0) return result;

    const facts = await this.targets.gatherToday(tx, now);
    const gone = await this.holdersWhoLeft(tx, requests);
    for (const request of requests) {
      result.requests += 1;
      await this.reconcileOne(tx, request, trigger, correlationId, now, facts, { gone, operator }, result);
    }

    return result;
  }

  private async holdersWhoLeft(tx: DbTx, requests: readonly ReassignableRequest[]): Promise<Set<string>> {
    const holders = [
      ...new Set(
        requests.flatMap((request) =>
          request.steps.flatMap((step) =>
            step.state === 'PENDING' && step.assigneeEmployeeId !== null ? [step.assigneeEmployeeId] : [],
          ),
        ),
      ),
    ];
    if (holders.length === 0) return new Set();

    return new Set(
      (await this.organizationReads.getEmployees(holders, tx))
        .filter((employee) => employee.status !== 'ACTIVE')
        .map((employee) => employee.id),
    );
  }

  private async reconcileOne(
    tx: DbTx,
    request: ReassignableRequest,
    trigger: ReassignmentTrigger,
    correlationId: string,
    now: Date,
    facts: TodayFacts,
    context: { gone: ReadonlySet<string>; operator?: OperatorAuditActor },
    result: ReconcileResult,
  ): Promise<void> {
    const { gone, operator } = context;
    const steps = request.steps.map((step) => ({ ...step }));
    let state = request.state;

    for (const step of steps) {
      if (!OPEN.has(step.state)) continue;
      const open: OpenStep = {
        kind: step.kind,
        state: step.state as 'PENDING' | 'WAITING',
        holderEmployeeId: step.assigneeEmployeeId,
        holderGone: step.assigneeEmployeeId !== null && gone.has(step.assigneeEmployeeId),
        waitingReason: step.waitingReason,
      };
      if (open.state === 'PENDING' && !touchesHeldStep(open, trigger)) continue;

      const decision = decideReassignment(open, trigger, await this.targets.targetOf(tx, request, step, facts));
      if (decision.action === 'KEEP') {
        if (open.state === 'WAITING') result.alerted += await this.alert(tx, request, step, correlationId);
        continue;
      }
      if (decision.action === 'REWAIT') {
        const previousReason = step.waitingReason;
        await this.repo.rewait(tx, step.id, decision.reason);
        step.waitingReason = decision.reason;
        await this.audit.record(
          tx,
          reassignmentAuditEvent(
            request.organizationId,
            'ACCESS_REQUEST.STEP_WAITING_REASON_CHANGED',
            'ACCESS_REQUEST_STEP',
            step.id,
            {
              requestId: request.id,
              stepKind: step.kind,
              trigger: trigger.kind,
              source: correlationId,
              waitingReason: decision.reason,
              // The stretch of waiting goes on: the deadline and the alert of the stretch do not start again.
              stepCreatedAt: step.createdAt.toISOString(),
            },
            correlationId,
            { waitingReason: previousReason },
            operator,
          ),
        );
        result.rewaited += 1;
        result.alerted += await this.alert(tx, request, step, correlationId);
        continue;
      }

      const previous = step.assigneeEmployeeId;
      const previousReason = step.waitingReason;
      if (decision.action === 'ASSIGN') {
        await this.repo.assign(tx, step.id, decision.assigneeEmployeeId, decision.routingRow, now);
        const wasWaiting = open.state === 'WAITING';
        step.state = 'PENDING';
        step.assigneeEmployeeId = decision.assigneeEmployeeId;
        step.waitingReason = null;
        step.waitingSince = null;
        if (decision.routingRow !== null) step.routingRow = decision.routingRow;
        state = await this.followState(tx, request.id, state, step.kind, true, wasWaiting);
        await this.audit.record(
          tx,
          reassignmentAuditEvent(
            request.organizationId,
            wasWaiting ? 'ACCESS_REQUEST.STEP_ASSIGNED_FROM_WAIT' : 'ACCESS_REQUEST.STEP_REDETERMINED',
            'ACCESS_REQUEST_STEP',
            step.id,
            {
              requestId: request.id,
              stepKind: step.kind,
              trigger: trigger.kind,
              source: correlationId,
              assigneeEmployeeId: decision.assigneeEmployeeId,
              // The deadline runs from here and does not start again.
              stepCreatedAt: step.createdAt.toISOString(),
              requestState: state,
            },
            correlationId,
            { assigneeEmployeeId: previous, waitingReason: previousReason },
            operator,
          ),
        );
        if (wasWaiting) result.assignedFromWait += 1;
        else result.redetermined += 1;
      } else {
        await this.repo.wait(tx, step.id, decision.reason);
        step.state = 'WAITING';
        step.assigneeEmployeeId = null;
        step.waitingReason = decision.reason;
        step.waitingSince = await this.repo.waitingSinceOf(tx, step.id);
        state = await this.followState(tx, request.id, state, step.kind, false, false);
        await this.audit.record(
          tx,
          reassignmentAuditEvent(
            request.organizationId,
            'ACCESS_REQUEST.STEP_WAITING',
            'ACCESS_REQUEST_STEP',
            step.id,
            {
              requestId: request.id,
              stepKind: step.kind,
              trigger: trigger.kind,
              source: correlationId,
              waitingReason: decision.reason,
              stepCreatedAt: step.createdAt.toISOString(),
              requestState: state,
            },
            correlationId,
            { assigneeEmployeeId: previous },
            operator,
          ),
        );
        result.madeToWait += 1;
        result.alerted += await this.alert(tx, request, step, correlationId);
      }
    }
  }

  /** The request follows the step: waiting under control while a step waits, the state of the step once it is held. */
  private async followState(
    tx: DbTx,
    requestId: string,
    current: string,
    kind: ReassignableStepKind,
    held: boolean,
    wasWaiting: boolean,
  ): Promise<string> {
    const next = requestStateFor(kind, held);
    // A step that was held and stays held leaves the state as it is; one that comes out of waiting takes the request out of it.
    if (next === null || next === current || (held && !(wasWaiting && current === 'WAITING_CONTROLLED'))) {
      return current;
    }
    await this.repo.setRequestState(tx, requestId, next);

    return next;
  }

  private async alert(
    tx: DbTx,
    request: ReassignableRequest,
    step: ReassignableStep,
    correlationId: string,
  ): Promise<number> {
    if (step.waitingSince === null || step.waitingReason === null) return 0;
    const raised = await this.alerts.raise(
      tx,
      {
        organizationId: request.organizationId,
        requestId: request.id,
        requesterEmployeeId: request.requesterEmployeeId,
        stepId: step.id,
        stepKind: step.kind,
        waitingReason: step.waitingReason,
        waitingSince: step.waitingSince,
      },
      correlationId,
    );

    return raised ? 1 : 0;
  }
}
