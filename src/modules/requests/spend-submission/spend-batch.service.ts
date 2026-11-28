import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { hasSpendStep } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { PolicyChecklistIncompleteError } from '../../policies/public/policy-checklist.errors';
import type { ChecklistBody } from '../../policies/public/policy-checklist.types';
import { ReserveConfirmationService } from '../reserve-confirmation/reserve-confirmation.service';
import {
  SpendConfirmationNotInBatchError,
  SpendNotInQueueError,
  SpendReplyNoteNotInBatchError,
} from '../spend/spend.errors';
import { SpendRoutingService } from '../spend/spend-routing.service';
import { processingOrder, restoreBodyOrder } from '../request-ticket/request-ticket-order.policy';
import type { HumanReturn } from '../request-reply/request-reply.types';
import type { StopReason } from '../spend/spend-submission.policy';
import { SpendBatchWriterService, type HeadResubmissionInput } from './spend-batch-writer.service';
import { SpendHeadService } from './spend-head.service';
import { SpendReplyFactsService } from './spend-reply-facts.service';

/** What became of the confirmation of the reserve the head gave for a request of the batch (`RV-11`). */
export type ConfirmationResult = 'APPLIED' | 'IGNORED' | 'NOT_GIVEN';

export interface SubmitResult {
  requestId: string;
  outcome: 'SENT_TO_APPROVER' | 'AWAITING_RESERVE_CONFIRMATION' | 'STOPPED';
  stopReason: StopReason | null;
  reserveConfirmation: ConfirmationResult;
}

/** What `sendOn` made of a request, and who holds the spend step it opened (null: no step, or one that waits); the answer carries the first only. */
interface Sent {
  requestId: string;
  result: SubmitResult;
  openedFor: string | null;
  headReply?: HeadResubmissionInput;
}

export interface ReserveConfirmationInput {
  requestId: string;
  reason: string;
}

export interface ReplyNoteInput {
  requestId: string;
  note: string;
}

/**
 * The head sends requests on to be decided as spend, in a batch of one or more (`US-06-14` AC-1, AC-4, AC-11).
 * Items belonging to the same multi-item ticket are processed in ascending ticket position while preserving
 * the caller's request body order in the returned results, persisted batch items, and audit payload.
 */
@Injectable()
export class SpendBatchService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly head: SpendHeadService,
    private readonly routing: SpendRoutingService,
    private readonly reserve: ReserveConfirmationService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly writer: SpendBatchWriterService,
    private readonly replyFacts: SpendReplyFactsService,
  ) {}

  /**
   * Throws SpendNotHeadError, AccessRequestNotFoundError, SpendNotInQueueError, SpendConfirmationNotInBatchError,
   * SpendReplyNoteNotInBatchError, FinanceSetupIncompleteError (the department has no Cost Center in use now, `QĐ-87g`)
   * and what the checklist of the reserve refuses (`QĐ-111ap`); returns the id of the batch and how each fared.
   */
  async submit(
    actor: AuthenticatedPrincipal,
    requestIds: readonly string[],
    confirmations: readonly ReserveConfirmationInput[] = [],
    checklist?: ChecklistBody,
    replyNotes: readonly ReplyNoteInput[] = [],
  ): Promise<{ batchId: string; results: SubmitResult[] }> {
    validateBatchInputs(requestIds, confirmations, checklist, replyNotes);
    const departmentId = await this.head.departmentOf(actor);
    const reasons = new Map(confirmations.map((confirmation) => [confirmation.requestId, confirmation.reason]));
    const notes = cleanNotesMap(replyNotes);

    return this.runner.run((tx) =>
      this.submitWithin(tx, actor, { requestIds, departmentId, confirmations, checklist, reasons, notes }),
    );
  }

  private async submitWithin(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      requestIds: readonly string[];
      departmentId: string;
      confirmations: readonly ReserveConfirmationInput[];
      checklist: ChecklistBody | undefined;
      reasons: ReadonlyMap<string, string>;
      notes: ReadonlyMap<string, string>;
    },
  ): Promise<{ batchId: string; results: SubmitResult[] }> {
    const { requestIds, departmentId, confirmations, checklist, reasons, notes } = input;
    const locked = await this.lockAll(tx, requestIds, departmentId);
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const unit = (await this.organizationReads.getOwningUnits([actor.employeeId], today, tx)).get(actor.employeeId);
    if (unit) this.organizationReads.requireUnitCostCenter(unit);

    const organizationId = requireLocked(locked, requestIds[0]).organizationId;
    const verdict =
      confirmations.length > 0 && checklist
        ? await this.reserve.judgeBatchChecklist(tx, organizationId, checklist)
        : null;
    const now = new Date();
    const pendingReturns = await this.replyFacts.pendingSpendReturnsOf(requestIds, tx);
    const orderedIds = processingOrder(
      requestIds.map((requestId) => ({ requestId, ticket: requireLocked(locked, requestId).ticket })),
    );
    const processed: Sent[] = [];
    for (const id of orderedIds) {
      processed.push(
        await this.processItem(tx, actor, requireLocked(locked, id), {
          reason: reasons.get(id),
          note: notes.get(id),
          pendingReturn: pendingReturns.get(id) ?? null,
          now,
        }),
      );
    }
    // Restore results, batch items, and recorder parallel arrays back to caller body order after ticket-ordered processing.
    const sent = restoreBodyOrder(requestIds, processed);
    const results = sent.map((item) => item.result);
    const confirmed = results.filter((result) => result.reserveConfirmation === 'APPLIED').map((r) => r.requestId);
    if (verdict && confirmed.length > 0) {
      await this.reserve.recordBatchChecklist(tx, actor, organizationId, {
        verdict,
        decidedAt: now,
        requestIds: confirmed,
      });
    }
    const batchId = await this.writer.writeBatchAndAudit(tx, actor, {
      organizationId,
      departmentId,
      now,
      requestIds,
      results,
      openedFor: sent.map((item) => item.openedFor),
      headReplies: sent.flatMap((item) => (item.headReply ? [item.headReply] : [])),
    });

    return { batchId, results };
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

  private async processItem(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    given: { reason: string | undefined; note: string | undefined; pendingReturn: HumanReturn | null; now: Date },
  ): Promise<Sent> {
    if (given.pendingReturn !== null && given.note === undefined) {
      return {
        requestId: request.id,
        result: {
          requestId: request.id,
          outcome: 'STOPPED',
          stopReason: 'REPLY_NOTE_REQUIRED',
          reserveConfirmation: given.reason === undefined ? 'NOT_GIVEN' : 'IGNORED',
        },
        openedFor: null,
      };
    }

    const sent = await this.sendOn(tx, actor, request, { reason: given.reason, now: given.now });
    // Insert the reply only when the item actually leaves the reply-awaiting state; a STOPPED item stays in the queue.
    if (given.pendingReturn !== null && given.note !== undefined && sent.result.outcome !== 'STOPPED') {
      return {
        ...sent,
        headReply: {
          organizationId: request.organizationId,
          requestId: request.id,
          returnedStepId: given.pendingReturn.stepId,
          note: given.note,
          authorEmployeeId: actor.employeeId,
        },
      };
    }

    return sent;
  }

  /** One request of the batch: the check, where the check sent it, and what became of the confirmation of the reserve, if one was given. */
  private async sendOn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    given: { reason: string | undefined; now: Date },
  ): Promise<Sent> {
    const ignored: ConfirmationResult = given.reason === undefined ? 'NOT_GIVEN' : 'IGNORED';
    const routed = await this.routing.route(tx, actor, request, 'SUBMISSION', given.now);
    const stopped = (stopReason: StopReason | null): Sent => ({
      requestId: request.id,
      result: { requestId: request.id, outcome: 'STOPPED', stopReason, reserveConfirmation: ignored },
      openedFor: null,
    });
    if (routed.status === 'NOT_CHECKABLE') return stopped(routed.reason);
    if (routed.outcome === 'BLOCKED') return stopped(routed.check.blockReasons[0] ?? null);
    if (routed.outcome === 'WITHIN_BASE') {
      return {
        requestId: request.id,
        result: { requestId: request.id, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: ignored },
        openedFor: routed.step?.assigneeEmployeeId ?? null,
      };
    }
    // The head never confirms the reserve of a request they are one of the people for (`BR-MF1-06h`): it waits, as without a reason.
    const selfConfirm = request.beneficiaryEmployeeIds.includes(actor.employeeId);
    if (given.reason === undefined || selfConfirm) {
      return {
        requestId: request.id,
        result: {
          requestId: request.id,
          outcome: 'AWAITING_RESERVE_CONFIRMATION',
          stopReason: null,
          reserveConfirmation: given.reason === undefined ? 'NOT_GIVEN' : 'IGNORED',
        },
        openedFor: null,
      };
    }
    const step = await this.reserve.confirmOnCheck(tx, actor, request, routed.check, {
      reason: given.reason,
      now: given.now,
      via: 'BATCH',
    });

    return {
      requestId: request.id,
      result: { requestId: request.id, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'APPLIED' },
      openedFor: step.assigneeEmployeeId,
    };
  }
}

function validateBatchInputs(
  requestIds: readonly string[],
  confirmations: readonly ReserveConfirmationInput[],
  checklist: ChecklistBody | undefined,
  replyNotes: readonly ReplyNoteInput[],
): void {
  // The body asks for the checklist with a confirmation; a caller that did not is refused, never let through.
  if (confirmations.length > 0 && checklist === undefined) throw new PolicyChecklistIncompleteError('1.6', [], []);
  const outside = confirmations.find((confirmation) => !requestIds.includes(confirmation.requestId));
  if (outside) throw new SpendConfirmationNotInBatchError(outside.requestId);
  const outsideNotes = replyNotes
    .filter((entry) => !requestIds.includes(entry.requestId))
    .map((entry) => entry.requestId);
  if (outsideNotes.length > 0) throw new SpendReplyNoteNotInBatchError(outsideNotes);
}

function cleanNotesMap(replyNotes: readonly ReplyNoteInput[]): Map<string, string> {
  const notes = new Map<string, string>();
  for (const entry of replyNotes) {
    const trimmed = entry.note.trim();
    if (trimmed.length > 0) notes.set(entry.requestId, trimmed);
  }
  return notes;
}

function requireLocked(locked: ReadonlyMap<string, AccessRequestRecord>, id: string): AccessRequestRecord {
  const record = locked.get(id);
  if (!record) throw new Error(`Locked request ${id} is missing from the batch lock map.`);
  return record;
}
