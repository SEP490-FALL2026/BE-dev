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
import { ReserveConfirmationService } from '../reserve-confirmation/reserve-confirmation.service';
import { SpendBatchRepo } from '../spend/spend-batch.repo';
import { SpendHeadService } from './spend-head.service';
import { SpendConfirmationNotInBatchError, SpendNotInQueueError } from '../spend/spend.errors';
import { SpendRoutingService } from '../spend/spend-routing.service';
import type { StopReason } from '../spend/spend-submission.policy';

/** What became of the confirmation of the reserve the head gave for a request of the batch (`RV-11`). */
export type ConfirmationResult = 'APPLIED' | 'IGNORED' | 'NOT_GIVEN';

export interface SubmitResult {
  requestId: string;
  outcome: 'SENT_TO_APPROVER' | 'AWAITING_RESERVE_CONFIRMATION' | 'STOPPED';
  stopReason: StopReason | null;
  reserveConfirmation: ConfirmationResult;
}

export interface ReserveConfirmationInput {
  requestId: string;
  reason: string;
}

/**
 * The head sends requests on to be decided as spend, in a batch of one or more (`US-06-14` AC-1, AC-4, AC-11). The batch is
 * an envelope (`QĐ-82j`): who sent which requests and when, nothing more; each request keeps its own steps, state and reason.
 * Each request is judged on its own by the check of the budget (`BR-MF1-06g`): within the base, it goes to the spending approver; it
 * uses the reserve, it goes to the approver only if the head gives a line of reason for it in the same act (`reserveConfirmations`,
 * `RV-11`), and otherwise stays in their queue waiting for the confirmation; blocked, or its data at fault, it stays in the queue with the
 * reason and the others go on (`FR-3.21`, `AC-9`). A confirmation given for a request the check does not say uses the reserve is left
 * unused and the answer says so; one for a request that is not in the batch refuses the batch. Only the head of the department of a
 * request sends it; a request that is not theirs is answered as if it did not exist. The check of each request, the step it is given and
 * the batch are written together.
 */
@Injectable()
export class SpendBatchService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly batches: SpendBatchRepo,
    private readonly head: SpendHeadService,
    private readonly routing: SpendRoutingService,
    private readonly reserve: ReserveConfirmationService,
    private readonly audit: AuditApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /**
   * Throws SpendNotHeadError, AccessRequestNotFoundError, SpendNotInQueueError, SpendConfirmationNotInBatchError and
   * FinanceSetupIncompleteError (the department has no Cost Center in use now, `QĐ-87g`); returns the id of the batch and how each fared.
   */
  async submit(
    actor: AuthenticatedPrincipal,
    requestIds: readonly string[],
    confirmations: readonly ReserveConfirmationInput[] = [],
  ): Promise<{ batchId: string; results: SubmitResult[] }> {
    const outside = confirmations.find((confirmation) => !requestIds.includes(confirmation.requestId));
    if (outside) throw new SpendConfirmationNotInBatchError(outside.requestId);
    const departmentId = await this.head.departmentOf(actor);
    const reasons = new Map(confirmations.map((confirmation) => [confirmation.requestId, confirmation.reason]));

    return this.runner.run(async (tx) => {
      const locked = await this.lockAll(tx, requestIds, departmentId);
      // A department with no Cost Center in use is stopped before anything is checked against a budget: not the answer of a year
      // with no budget, and nothing is written.
      const today = await this.organizationReads.businessToday(new Date(), tx);
      const unit = (await this.organizationReads.getOwningUnits([actor.employeeId], today, tx)).get(actor.employeeId);
      if (unit) this.organizationReads.requireUnitCostCenter(unit);

      const organizationId = (locked.get(requestIds[0]) as AccessRequestRecord).organizationId;
      const now = new Date();
      const results: SubmitResult[] = [];
      for (const id of requestIds) {
        results.push(
          await this.sendOn(tx, actor, locked.get(id) as AccessRequestRecord, { reason: reasons.get(id), now }),
        );
      }

      const batchId = await this.batches.create(tx, {
        organizationId,
        departmentId,
        submittedByEmployeeId: actor.employeeId,
        now,
        items: results.map((result) => ({
          requestId: result.requestId,
          outcome: result.outcome,
          stopReason: result.stopReason,
          leftReason: null,
        })),
      });
      await this.recordSubmitted(tx, actor, { organizationId, departmentId, batchId, requestIds, results });

      return { batchId, results };
    });
  }

  /** The requests locked in the order of their ids, so two batches that share a request queue instead of waiting on each other. */
  private async lockAll(
    tx: DbTx,
    requestIds: readonly string[],
    departmentId: string,
  ): Promise<Map<string, AccessRequestRecord>> {
    const locked = new Map<string, AccessRequestRecord>();
    for (const id of [...requestIds].sort()) {
      const request = await this.requests.lockById(tx, id);
      if (!request || request.departmentId !== departmentId) throw new AccessRequestNotFoundError();
      if (
        request.routing?.mode === 'ONE_STEP' ||
        request.state !== 'AWAITING_SPEND_SUBMISSION' ||
        !hasSpendStep(request.policy)
      ) {
        throw new SpendNotInQueueError(id);
      }
      locked.set(id, request);
    }

    return locked;
  }

  private async recordSubmitted(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    batch: {
      organizationId: string;
      departmentId: string;
      batchId: string;
      requestIds: readonly string[];
      results: readonly SubmitResult[];
    },
  ): Promise<void> {
    const count = (outcome: SubmitResult['outcome']) => batch.results.filter((item) => item.outcome === outcome).length;
    await this.audit.record(
      tx,
      accessRequestAuditEvent(actor, batch.organizationId, 'SPEND_BATCH.SUBMITTED', 'SPEND_BATCH', batch.batchId, {
        departmentId: batch.departmentId,
        requestIds: batch.requestIds.join(','),
        sentToApprover: count('SENT_TO_APPROVER'),
        awaitingReserveConfirmation: count('AWAITING_RESERVE_CONFIRMATION'),
        stopped: count('STOPPED'),
      }),
    );
  }

  /** One request of the batch: the check, where the check sent it, and what became of the confirmation of the reserve, if one was given. */
  private async sendOn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    given: { reason: string | undefined; now: Date },
  ): Promise<SubmitResult> {
    const ignored: ConfirmationResult = given.reason === undefined ? 'NOT_GIVEN' : 'IGNORED';
    const routed = await this.routing.route(tx, actor, request, 'SUBMISSION', given.now);
    if (routed.status === 'NOT_CHECKABLE') {
      return { requestId: request.id, outcome: 'STOPPED', stopReason: routed.reason, reserveConfirmation: ignored };
    }
    if (routed.outcome === 'BLOCKED') {
      const [first] = routed.check.blockReasons;

      return { requestId: request.id, outcome: 'STOPPED', stopReason: first ?? null, reserveConfirmation: ignored };
    }
    if (routed.outcome === 'WITHIN_BASE') {
      return { requestId: request.id, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: ignored };
    }
    // The head never confirms the reserve of a request they are one of the people for (`BR-MF1-06h`): it waits, as without a reason.
    const selfConfirm = request.beneficiaryEmployeeIds.includes(actor.employeeId);
    if (given.reason === undefined || selfConfirm) {
      return {
        requestId: request.id,
        outcome: 'AWAITING_RESERVE_CONFIRMATION',
        stopReason: null,
        reserveConfirmation: given.reason === undefined ? 'NOT_GIVEN' : 'IGNORED',
      };
    }
    await this.reserve.confirmOnCheck(tx, actor, request, routed.check, { reason: given.reason, now: given.now });

    return { requestId: request.id, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'APPLIED' };
  }
}
