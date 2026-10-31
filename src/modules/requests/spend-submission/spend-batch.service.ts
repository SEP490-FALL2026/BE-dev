import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { hasSpendStep } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { SpendBatchRepo, type NewBatchItem } from '../spend/spend-batch.repo';
import { SpendHeadService } from './spend-head.service';
import { SpendNotInQueueError } from '../spend/spend.errors';
import { SpendRoutingService } from '../spend/spend-routing.service';
import { submissionStop, type StopReason } from '../spend/spend-submission.policy';

const stopped = (requestId: string, reason: StopReason): NewBatchItem => ({
  requestId,
  outcome: 'STOPPED',
  stopReason: reason,
  leftReason: null,
});

/**
 * The head sends requests on to be decided as spend, in a batch of one or more (`US-06-14` AC-1, AC-4, AC-11). The batch is
 * an envelope (`QĐ-82j`): who sent which requests and when, nothing more; each request keeps its own steps, state and reason.
 * Each request is judged on its own: one that has no line of the plan or "outside the plan", or whose check finds a problem
 * in its data, stays in the queue with the reason and the others go on (`FR-3.21`, `AC-9`). Only the head of the department
 * of a request sends it; a request that is not theirs is answered as if it did not exist. The check of each request, the
 * step it is given and the batch are written together.
 */
@Injectable()
export class SpendBatchService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly batches: SpendBatchRepo,
    private readonly head: SpendHeadService,
    private readonly routing: SpendRoutingService,
    private readonly audit: AuditApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /**
   * Throws SpendNotHeadError, AccessRequestNotFoundError, SpendNotInQueueError and FinanceSetupIncompleteError (the department has no
   * Cost Center in use now, `QĐ-87g`); returns the id of the batch.
   */
  async submit(actor: AuthenticatedPrincipal, requestIds: readonly string[]): Promise<string> {
    const departmentId = await this.head.departmentOf(actor);

    return this.runner.run(async (tx) => {
      // Locked in the order of their ids, so two batches that share a request queue instead of waiting on each other.
      const locked = new Map<string, AccessRequestRecord>();
      for (const id of [...requestIds].sort()) {
        const request = await this.requests.lockById(tx, id);
        if (!request || request.departmentId !== departmentId) throw new AccessRequestNotFoundError();
        if (request.state !== 'AWAITING_SPEND_SUBMISSION' || !hasSpendStep(request.policy)) {
          throw new SpendNotInQueueError(id);
        }
        locked.set(id, request);
      }
      // A department with no Cost Center in use is stopped before anything is checked against a budget: not the answer of a year
      // with no budget, and nothing is written.
      const today = await this.organizationReads.businessToday(new Date(), tx);
      const unit = (await this.organizationReads.getOwningUnits([actor.employeeId], today, tx)).get(actor.employeeId);
      if (unit) this.organizationReads.requireUnitCostCenter(unit);

      const organizationId = (locked.get(requestIds[0]) as AccessRequestRecord).organizationId;
      const now = new Date();
      const items: NewBatchItem[] = [];
      for (const id of requestIds) items.push(await this.sendOn(tx, actor, locked.get(id) as AccessRequestRecord, now));

      const batchId = await this.batches.create(tx, {
        organizationId,
        departmentId,
        submittedByEmployeeId: actor.employeeId,
        now,
        items,
      });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(actor, organizationId, 'SPEND_BATCH.SUBMITTED', 'SPEND_BATCH', batchId, {
          departmentId,
          requestIds: requestIds.join(','),
          sentToApprover: items.filter((item) => item.outcome === 'SENT_TO_APPROVER').length,
          sentToFinance: items.filter((item) => item.outcome === 'SENT_TO_FINANCE').length,
          stopped: items.filter((item) => item.outcome === 'STOPPED').length,
        }),
      );

      return batchId;
    });
  }

  /** One request of the batch: the gate of the line, the check, and where the check sent it. */
  private async sendOn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    now: Date,
  ): Promise<NewBatchItem> {
    const gate = submissionStop({ hasPlanLine: request.planLine !== null, offPlan: request.offPlan });
    if (gate) return stopped(request.id, gate);

    const outcome = await this.routing.route(tx, actor, request, 'SUBMISSION', now);
    if (outcome.status === 'NOT_CHECKABLE') return stopped(request.id, outcome.reason);
    if (outcome.route === 'BLOCKED') {
      return stopped(
        request.id,
        outcome.check.staleCostEvidence ? 'STALE_COST_EVIDENCE' : 'CLOSED_OR_EXPIRED_BUDGET_PERIOD',
      );
    }

    return {
      requestId: request.id,
      outcome: outcome.opened === 'FINANCE_REVIEW' ? 'SENT_TO_FINANCE' : 'SENT_TO_APPROVER',
      stopReason: null,
      leftReason: outcome.substituted ? 'CONFLICT_OF_INTEREST' : null,
    };
  }
}
