import { Injectable } from '@nestjs/common';
import { TransactionRunner, TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { SpendBatchRepo } from '../spend/spend-batch.repo';
import { SpendDecisionRepo } from '../spend/spend-decision.repo';
import { SpendBatchGroupReturnService } from './spend-batch-group-return.service';
import { SpendDecisionService, type JudgedSpendChecklist, type SpendDecisionInput } from './spend-decision.service';
import { spendItemOutcome, type BatchReason, type SpendItemOutcome } from './spend-item-outcome.policy';
import { SpendBatchNotFoundError, SpendDecisionRefusedError } from '../spend/spend.errors';
import type { BatchDecisionResultWire } from '../spend-approval-view/spend-approval.dto';

/** The decision of the record of approval each decision of the body writes. */
const RECORDED_AS = { APPROVE: 'APPROVED', REJECT: 'REJECTED', RETURN: 'RETURNED' } as const;

/** A request with no spend step open is refused with this reason; a request that is not there at all is not found. */
function isNoOpenStep(error: unknown): boolean {
  return error instanceof SpendDecisionRefusedError && error.reason === 'NO_SPEND_STEP';
}

/**
 * The spending approver decides the requests they hold in a batch together, approving or refusing them one by one, in the
 * order chosen (`US-06-01` AC-19, AC-20). Each request is decided on its own, with its own check, snapshot, record and
 * commitment, so one that stops does not stop the others: a request that is not in the batch or not the caller's, one that
 * has no spend step (it was withdrawn), and one that was checked again and went back to its head (blocked, or a reserve nobody
 * confirmed) are skipped and say why; the requester and the head are told of each one that went back. A refusal gives one reason for all (`AC-20`). The batch
 * has no decision of its own.
 *
 * One checklist answers for the whole batch and is kept for each request decided (`QĐ-111aq`): it is judged once, before any request is decided, and
 * every request is decided on that judgement (a policy published meanwhile leaves no batch half decided); what it refuses is told once, and a return
 * (the only thing a No leaves besides a refusal) takes every request of the batch the person holds, a request for a group too (sent back whole, its
 * people decided by none), so a batch with a problem goes back whole and the head drops the request at fault and sends a new batch.
 *
 * A request whose transaction the database could not complete for a moment (a deadlock, a serialization failure) answers `RETRYABLE`: only that request is
 * sent again, the rest of the batch was decided. A batch sent again finds the requests it already decided with no open step; when the newest spend step of
 * one holds a record of this very person with this very decision, it answers what was decided with `ALREADY_DECIDED` and writes nothing, so the sender can
 * send the whole batch again after a failure without a request being decided twice or counted as skipped.
 */
@Injectable()
export class SpendBatchDecisionService {
  constructor(
    private readonly batches: SpendBatchRepo,
    private readonly decisions: SpendDecisionService,
    private readonly runner: TransactionRunner,
    private readonly checklists: PolicyChecklistApi,
    private readonly groupReturns: SpendBatchGroupReturnService,
    private readonly spendDecisions: SpendDecisionRepo,
  ) {}

  /** Throws SpendBatchNotFoundError for a batch the caller holds nothing of, and what the checklist refuses. */
  async decide(
    actor: AuthenticatedPrincipal,
    batchId: string,
    body: SpendDecisionInput & { requestIds?: readonly string[] },
  ): Promise<BatchDecisionResultWire[]> {
    const held = await this.batches.heldBy(batchId, actor.employeeId);
    const batch = await this.batches.findById(batchId);
    if (held.length === 0 || !batch) throw new SpendBatchNotFoundError();
    const inBatch = new Set(await this.batches.requestIdsOf(batchId));
    const judged = await this.runner.run(async (tx) => {
      const { verdict, reason } = await this.checklists.judge(tx, {
        organizationId: batch.organizationId,
        stepCode: '1.7',
        checklist: body.checklist,
        decision: body.decision,
        reason: body.reason,
      });

      return { verdict, reason };
    });
    const requestIds = body.decision === 'RETURN' ? [...new Set(held)] : (body.requestIds ?? []);

    const results: BatchDecisionResultWire[] = [];
    for (const requestId of requestIds) {
      results.push(await this.decideOne(actor, requestId, body, { inBatch, judged }));
    }

    return results;
  }

  private async decideOne(
    actor: AuthenticatedPrincipal,
    requestId: string,
    body: SpendDecisionInput,
    of: { inBatch: ReadonlySet<string>; judged: JudgedSpendChecklist },
  ): Promise<BatchDecisionResultWire> {
    if (!of.inBatch.has(requestId)) return { requestId, outcome: 'SKIPPED', reason: 'NOT_IN_BATCH' };

    let outcome: SpendItemOutcome<BatchReason> | null;
    try {
      const result = await this.decisions.decide(
        actor,
        requestId,
        { decision: body.decision, reason: body.reason, checklist: body.checklist },
        of.judged,
      );
      outcome = spendItemOutcome({ context: 'BATCH', result });
    } catch (error) {
      outcome = spendItemOutcome({ context: 'BATCH', error });
      if (outcome === null) throw error;
    }
    if (outcome?.kind === 'RESULT') {
      return { requestId, outcome: outcome.outcome, reason: outcome.reason };
    }
    if (outcome?.kind === 'NO_OPEN_STEP') return this.withoutOpenStep(actor, requestId, body.decision);
    if (outcome?.kind === 'GROUP_USES_LINES') {
      // Each person in a group is decided separately. Returning a batch sends the whole group back.
      if (body.decision === 'RETURN') return this.returnGroup(actor, requestId, of.judged);
      return { requestId, outcome: 'SKIPPED', reason: 'GROUP_NEEDS_LINES' };
    }

    throw new Error(`No outcome for spend decision ${requestId}`);
  }

  /** The group goes back whole on the judgement of the batch; refused like any request of the batch when the person does not hold its step. */
  private async returnGroup(
    actor: AuthenticatedPrincipal,
    requestId: string,
    judged: JudgedSpendChecklist,
  ): Promise<BatchDecisionResultWire> {
    try {
      await this.groupReturns.returnWhole(actor, requestId, judged);

      return { requestId, outcome: 'RETURNED', reason: null };
    } catch (error) {
      if (error instanceof TransientDatabaseError)
        return { requestId, outcome: 'RETRYABLE', reason: 'TRANSIENT_FAILURE' };
      if (error instanceof AccessRequestNotFoundError)
        return { requestId, outcome: 'SKIPPED', reason: 'NO_SPEND_STEP' };
      if (isNoOpenStep(error)) return this.withoutOpenStep(actor, requestId, 'RETURN');
      if (error instanceof SpendDecisionRefusedError) return { requestId, outcome: 'SKIPPED', reason: error.reason };
      throw error;
    }
  }

  /** A request with no open spend step: what this person already decided on its newest step when it is the same decision, otherwise skipped. */
  private async withoutOpenStep(
    actor: AuthenticatedPrincipal,
    requestId: string,
    decision: SpendDecisionInput['decision'],
  ): Promise<BatchDecisionResultWire> {
    const recorded = await this.spendDecisions.decisionOfLatestStep(requestId, actor.employeeId);
    if (recorded !== null && recorded === RECORDED_AS[decision]) {
      return { requestId, outcome: recorded, reason: 'ALREADY_DECIDED' };
    }

    return { requestId, outcome: 'SKIPPED', reason: 'NO_SPEND_STEP' };
  }
}
