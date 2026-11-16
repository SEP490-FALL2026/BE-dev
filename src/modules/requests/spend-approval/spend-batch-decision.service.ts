import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import { AccessRequestGroupUsesLinesError, AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { SpendBatchRepo } from '../spend/spend-batch.repo';
import { SpendDecisionService, type SpendDecisionInput } from './spend-decision.service';
import { SpendBatchNotFoundError, SpendDecisionRefusedError } from '../spend/spend.errors';
import type { BatchDecisionResultWire } from '../spend-approval-view/spend-approval.dto';

/**
 * The spending approver decides the requests they hold in a batch together, approving or refusing them one by one, in the
 * order chosen (`US-06-01` AC-19, AC-20). Each request is decided on its own, with its own check, snapshot, record and
 * commitment, so one that stops does not stop the others: a request that is not in the batch or not the caller's, one that
 * has no spend step (it was withdrawn), and one that was checked again and went back to its head (blocked, or a reserve nobody
 * confirmed) are skipped and say why; the requester and the head are told of each one that went back. A refusal gives one reason for all (`AC-20`). The batch
 * has no decision of its own.
 *
 * One checklist answers for the whole batch and is kept for each request decided (`QĐ-111aq`): what it refuses is told once before any request is
 * decided, and a return (the only thing a No leaves besides a refusal) takes every request of the batch the person holds, so a batch with a problem
 * goes back whole and the head drops the request at fault and sends a new batch.
 */
@Injectable()
export class SpendBatchDecisionService {
  constructor(
    private readonly batches: SpendBatchRepo,
    private readonly decisions: SpendDecisionService,
    private readonly runner: TransactionRunner,
    private readonly checklists: PolicyChecklistApi,
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
    await this.runner.run((tx) =>
      this.checklists.judge(tx, {
        organizationId: batch.organizationId,
        stepCode: '1.7',
        checklist: body.checklist,
        decision: body.decision,
        reason: body.reason,
      }),
    );
    const requestIds = body.decision === 'RETURN' ? [...new Set(held)] : (body.requestIds ?? []);

    const results: BatchDecisionResultWire[] = [];
    for (const requestId of requestIds) {
      results.push(await this.decideOne(actor, requestId, body, inBatch));
    }

    return results;
  }

  private async decideOne(
    actor: AuthenticatedPrincipal,
    requestId: string,
    body: SpendDecisionInput,
    inBatch: ReadonlySet<string>,
  ): Promise<BatchDecisionResultWire> {
    const skipped = (reason: NonNullable<BatchDecisionResultWire['reason']>): BatchDecisionResultWire => ({
      requestId,
      outcome: 'SKIPPED',
      reason,
    });
    if (!inBatch.has(requestId)) return skipped('NOT_IN_BATCH');

    try {
      const result = await this.decisions.decide(actor, requestId, {
        decision: body.decision,
        reason: body.reason,
        checklist: body.checklist,
      });
      if (result.status === 'DECIDED') return { requestId, outcome: result.decision, reason: null };

      return skipped('RECHECKED_RETURNED_TO_HEAD');
    } catch (error) {
      if (error instanceof AccessRequestNotFoundError) return skipped('NO_SPEND_STEP');
      // A request for a group is decided for each person, never in bulk (`US-05-17`).
      if (error instanceof AccessRequestGroupUsesLinesError) return skipped('GROUP_NEEDS_LINES');
      if (error instanceof SpendDecisionRefusedError) return skipped(error.reason);
      throw error;
    }
  }
}
