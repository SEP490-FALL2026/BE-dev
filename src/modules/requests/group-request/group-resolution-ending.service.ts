import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { SpendBatchRepo } from '../spend/spend-batch.repo';
import { SpendStepRepo } from '../spend/spend-step.repo';
import { requestEndingOf } from './group-resolution.policy';

/**
 * Every line has ended: the request ends with the outcome of the most that was done, and nothing is left open on it (`US-05-17`,
 * `US-05-08`): its steps are closed, it leaves its batch, and what says who closed it and
 * why is written; the Audit Trail says it was resolved, by the actor, or by the system when the grant gate moved it.
 */
@Injectable()
export class GroupResolutionEnding {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly batches: SpendBatchRepo,
    private readonly audit: AuditApi,
  ) {}

  async end(
    tx: DbTx,
    actor: AuthenticatedPrincipal | null,
    request: AccessRequestRecord,
    outcome: 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED' | 'WITHDRAWN',
    now: Date,
  ): Promise<void> {
    if (request.state === outcome) return;
    await this.steps.closeAllOpen(tx, request.id, now);
    const leaving = outcome === 'CANCELLED' ? 'REQUEST_CANCELLED' : 'REQUEST_WITHDRAWN';
    if (outcome === 'WITHDRAWN' || outcome === 'CANCELLED') await this.batches.markLeft(tx, request.id, leaving, now);

    await this.write(tx, request, requestEndingOf(outcome, request.lines, request.requesterEmployeeId, now));
    await this.audit.record(
      tx,
      this.event(actor, request, 'ACCESS_REQUEST.GROUP_RESOLVED', {
        requestId: request.id,
        from: request.state,
        to: outcome,
        lineCount: request.lines.length,
      }),
    );
  }

  private async write(
    tx: DbTx,
    request: AccessRequestRecord,
    ending: ReturnType<typeof requestEndingOf>,
  ): Promise<void> {
    switch (ending.kind) {
      case 'GRANT_OUTCOME':
        await this.requests.setGrantOutcome(tx, request.id, ending.outcome, ending.endedAt);
        break;
      case 'CANCELLATION':
        await this.requests.setCancellation(tx, request.id, {
          cancelledAt: ending.cancelledAt,
          cancelledByEmployeeId: ending.cancelledByEmployeeId,
          cause: ending.cause,
          note: ending.note,
        });
        break;
      case 'WITHDRAWAL':
        await this.requests.setWithdrawal(
          tx,
          request.id,
          {
            requestedAt: ending.requestedAt,
            requestedByEmployeeId: ending.requestedByEmployeeId,
            reason: ending.reason,
            withdrawnAt: ending.withdrawnAt,
          },
          'WITHDRAWN',
        );
        break;
      case 'STATE':
        await this.requests.setState(tx, request.id, ending.state);
        break;
    }
  }

  private event(
    actor: AuthenticatedPrincipal | null,
    request: AccessRequestRecord,
    action: string,
    after: { [key: string]: string | number | null },
  ) {
    return actor
      ? accessRequestAuditEvent(actor, request.organizationId, action, 'ACCESS_REQUEST', request.id, after)
      : {
          organizationId: request.organizationId,
          actorKind: 'SYSTEM' as const,
          action,
          resourceType: 'ACCESS_REQUEST',
          resourceId: request.id,
          before: null,
          after,
          correlationId: request.id,
        };
  }
}
