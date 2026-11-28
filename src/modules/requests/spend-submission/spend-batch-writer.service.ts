import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { HumanReturn } from '../request-reply/request-reply.types';
import { SpendBatchRepo } from '../spend/spend-batch.repo';
import type { StopReason } from '../spend/spend-submission.policy';
import { SpendBatchRecorder } from './spend-batch-recorder.service';
import { SpendTicketReplyService } from './spend-ticket-reply.service';

export type BatchSubmitStopReason = StopReason;

export interface BatchWriteInput {
  organizationId: string;
  departmentId: string;
  now: Date;
  requestIds: readonly string[];
  results: readonly {
    requestId: string;
    outcome: 'SENT_TO_APPROVER' | 'AWAITING_RESERVE_CONFIRMATION' | 'STOPPED';
    stopReason: BatchSubmitStopReason | null;
  }[];
  openedFor: readonly (string | null)[];
}

/** Persistence and reply-note coordination for submitting a spend batch. */
@Injectable()
export class SpendBatchWriterService {
  constructor(
    private readonly batches: SpendBatchRepo,
    private readonly recorder: SpendBatchRecorder,
    private readonly ticketReplies: SpendTicketReplyService,
  ) {}

  pendingSpendReturn(tx: DbTx, requestId: string): Promise<HumanReturn | null> {
    return this.ticketReplies.pendingSpendReturn(tx, requestId);
  }

  recordHeadResubmission(
    tx: DbTx,
    input: {
      organizationId: string;
      requestId: string;
      returnedStepId: string;
      note: string;
      authorEmployeeId: string;
    },
  ): Promise<{ id: string }> {
    return this.ticketReplies.recordHeadResubmission(tx, input);
  }

  async writeBatchAndAudit(tx: DbTx, actor: AuthenticatedPrincipal, input: BatchWriteInput): Promise<string> {
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
