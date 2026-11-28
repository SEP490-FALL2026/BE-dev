import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { RequestReplyRepo } from '../request-reply/request-reply.repo';
import { SpendBatchRepo } from '../spend/spend-batch.repo';
import type { StopReason } from '../spend/spend-submission.policy';
import { SpendBatchRecorder } from './spend-batch-recorder.service';

export interface HeadResubmissionInput {
  organizationId: string;
  requestId: string;
  returnedStepId: string;
  note: string;
  authorEmployeeId: string;
}

export interface BatchWriteInput {
  organizationId: string;
  departmentId: string;
  now: Date;
  requestIds: readonly string[];
  results: readonly {
    requestId: string;
    outcome: 'SENT_TO_APPROVER' | 'AWAITING_RESERVE_CONFIRMATION' | 'STOPPED';
    stopReason: StopReason | null;
  }[];
  openedFor: readonly (string | null)[];
  headReplies?: readonly HeadResubmissionInput[];
}

/**
 * Persistence and audit writer for submitting a spend batch.
 * Lock order: caller locks access_requests in ascending id order (plus budget-year locks inside routing)
 * before writing head replies, spend_batches, spend_batch_items, and audit events in the same transaction.
 */
@Injectable()
export class SpendBatchWriterService {
  constructor(
    private readonly batches: SpendBatchRepo,
    private readonly recorder: SpendBatchRecorder,
    private readonly replies: RequestReplyRepo,
  ) {}

  async writeBatchAndAudit(tx: DbTx, actor: AuthenticatedPrincipal, input: BatchWriteInput): Promise<string> {
    for (const reply of input.headReplies ?? []) {
      await this.replies.insert(tx, { ...reply, kind: 'HEAD_RESUBMISSION' });
    }
    const batchId = await this.batches.create(tx, {
      organizationId: input.organizationId,
      departmentId: input.departmentId,
      submittedByEmployeeId: actor.employeeId,
      now: input.now,
      items: input.results.map((result) => ({
        requestId: result.requestId,
        outcome: result.outcome,
        stopReason: result.stopReason,
        leftReason: null,
      })),
    });
    await this.recorder.submitted(tx, actor, {
      organizationId: input.organizationId,
      departmentId: input.departmentId,
      batchId,
      requestIds: input.requestIds,
      outcomes: input.results.map((item) => item.outcome),
      openedFor: input.openedFor,
    });
    return batchId;
  }
}
