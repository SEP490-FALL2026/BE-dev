import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';

/** What a batch was, as the audit trail and the approvers read it: how many requests it sent on, kept waiting and stopped. */
export interface SubmittedBatch {
  organizationId: string;
  departmentId: string;
  batchId: string;
  requestIds: readonly string[];
  /** The outcome of each request of the batch. */
  outcomes: readonly ('SENT_TO_APPROVER' | 'AWAITING_RESERVE_CONFIRMATION' | 'STOPPED')[];
  /** For each request of the batch, who holds the spend step it opened (null: none, or one that waits for an approver). */
  openedFor: readonly (string | null)[];
}

/**
 * Writes what a sent batch leaves behind, in its transaction (so it exists exactly when the batch does): the audit event, and the notice of
 * the spending approvers (`FR-3.21`, `Q-5A-1`): one for each approver who holds a step the batch opened, with how many it opened for them,
 * and not one for each request. A step that waits has no holder, and the head who sent the batch is never told of their own act.
 */
@Injectable()
export class SpendBatchRecorder {
  constructor(
    private readonly audit: AuditApi,
    private readonly notifications: NotificationsApi,
  ) {}

  async submitted(tx: DbTx, actor: AuthenticatedPrincipal, batch: SubmittedBatch): Promise<void> {
    const count = (outcome: SubmittedBatch['outcomes'][number]) =>
      batch.outcomes.filter((item) => item === outcome).length;
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
    const opened = new Map<string, number>();
    for (const holder of batch.openedFor) {
      if (holder === null || holder === actor.employeeId) continue;
      opened.set(holder, (opened.get(holder) ?? 0) + 1);
    }
    for (const [recipientEmployeeId, sentCount] of opened) {
      await this.notifications.notifyInApp(tx, {
        organizationId: batch.organizationId,
        recipientEmployeeId,
        code: 'SPEND_BATCH_SUBMITTED',
        subject: { type: 'SPEND_BATCH', id: batch.batchId },
        params: { batchId: batch.batchId, departmentId: batch.departmentId, sentCount },
        eventKey: `SPEND_BATCH_SUBMITTED:${batch.batchId}`,
      });
    }
  }
}
