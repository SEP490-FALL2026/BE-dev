import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import {
  AccessRequestNotFoundError,
  AccessRequestNotRequesterError,
  AccessRequestNotAwaitingRevisionError,
} from '../access-request/access-request.errors';
import type { AccessRequestRecord, NeedStepWithDecision } from '../access-request/access-request.types';
import { RequestLineRepo } from '../group-request/request-line.repo';
import { SpendRoutingService } from '../spend/spend-routing.service';

/** A need step that its head sent back: closed, with a record of approval that says it was returned. */
const isReturned = (step: NeedStepWithDecision): boolean =>
  step.state === 'CLOSED' && step.decision?.decision === 'RETURNED';

/**
 * The sender sends a request on again after it came back to them (`FR-11.2`, R-24): a request of one step goes to the spending approver again;
 * a request that went through the head, and that the head sent back at the need step (`QĐ-111ap`), goes to the head again, at a new need step
 * given as the returned one was. For a group the people who still wait for their need move to the new step. Request lock precedes the
 * budget-year lock; a concurrent second submission sees the resulting state.
 */
@Injectable()
export class RequestResubmissionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly spending: SpendRoutingService,
    private readonly lines: RequestLineRepo,
    private readonly audit: AuditApi,
  ) {}

  async resubmit(actor: AuthenticatedPrincipal, id: string) {
    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, id);
      if (!request) throw new AccessRequestNotFoundError();
      if (request.requesterEmployeeId !== actor.employeeId) throw new AccessRequestNotRequesterError();
      if (request.state !== 'AWAITING_REQUESTER_REVISION') throw new AccessRequestNotAwaitingRevisionError();
      if (request.routing?.mode === 'ONE_STEP') {
        await this.spending.route(tx, actor, request, 'SUBMISSION', new Date());
      } else {
        await this.reopenNeed(tx, actor, request, new Date());
      }
      const record = await this.requests.findById(id, tx);
      if (!record) throw new AccessRequestNotFoundError();
      return record;
    });
  }

  /** A new need step for each returned one that something still waits on, and the request back to waiting for its head. */
  private async reopenNeed(tx: DbTx, actor: AuthenticatedPrincipal, request: AccessRequestRecord, now: Date) {
    const waiting = await this.stepsStillWaiting(tx, request);
    if (waiting.length === 0) throw new AccessRequestNotAwaitingRevisionError();
    const reopened: string[] = [];
    for (const { step, employeeIds } of waiting) {
      const stepId = await this.requests.addNeedStep(tx, {
        requestId: request.id,
        now,
        step: {
          state: 'PENDING',
          assigneeEmployeeId: step.assigneeEmployeeId,
          routingRow: step.routingRow,
          waitingReason: null,
          slaWorkingDays: step.slaWorkingDays,
        },
      });
      if (employeeIds.length > 0) await this.lines.repointNeed(tx, request.id, employeeIds, stepId);
      reopened.push(stepId);
    }
    await this.requests.setState(tx, request.id, 'PENDING');
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.RESUBMITTED',
        'ACCESS_REQUEST',
        request.id,
        { requestId: request.id, reopenedStepIds: reopened.join(','), requestState: 'PENDING' },
      ),
    );
  }

  /** The returned need steps still holding something: the last one of a request for a person, the ones holding people who wait for their need in a group. */
  private async stepsStillWaiting(
    tx: DbTx,
    request: AccessRequestRecord,
  ): Promise<{ step: NeedStepWithDecision; employeeIds: string[] }[]> {
    if (request.type !== 'GROUP_GRANT') {
      const last = request.needSteps[request.needSteps.length - 1];

      return last && isReturned(last) ? [{ step: last, employeeIds: [] }] : [];
    }
    const lines = (await this.lines.lock(tx, request.id)).filter((line) => line.state === 'AWAITING_NEED');

    return request.needSteps
      .filter(isReturned)
      .map((step) => ({
        step,
        employeeIds: lines.filter((line) => line.needStepId === step.id).map((line) => line.employeeId),
      }))
      .filter((held) => held.employeeIds.length > 0);
  }
}
