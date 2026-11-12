import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import type { AuditEventInput, AuditValue } from '../../audit/public/audit.types';
import type { SystemActor } from '../../licensing/public/licensing.types';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { LineRecord, SystemCancelCause } from '../access-request/group-request.types';
import { GroupGrantService } from '../group-request/group-grant.service';
import { GroupResolutionService } from '../group-request/group-resolution.service';
import { holdsMoney } from '../group-request/group-withdrawal.policy';
import { RequestLineRepo } from '../group-request/request-line.repo';
import { lineCancelledDetail } from '../line-closure/group-line-closure.policy';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import { RequestEndService } from '../request-end/request-end.service';

/** The audit event of a closing by the system: the actor is the system, and the pass that made it is the correlation. */
function systemEvent(
  actor: SystemActor,
  request: { id: string; organizationId: string },
  action: string,
  after: { [key: string]: AuditValue },
): AuditEventInput {
  return {
    ...accessRequestAuditEvent(null, request.organizationId, action, 'ACCESS_REQUEST', request.id, after),
    correlationId: actor.correlationId,
  };
}

/**
 * The writes of a closing by the system (`QĐ-110d`, `QĐ-110o`), for a request and for one line of a request for a group. Nobody closes
 * it, so the column of who closed it stays empty and the cause is the system's. What a closing by the IT Admin does is done here too, in the
 * caller's transaction and under its locks: the steps still open and the questions to Finance are closed, the request leaves its batch,
 * what was held for it and is not spent goes back to the budget (`QĐ-83a`), the audit event is written (where the requester and Finance are
 * told from, `status-rules-*`), and the contexts that listen are told how it ended. The judgement (is it in scope, has the grant begun) is
 * the policy's and the caller's; this writes.
 */
@Injectable()
export class BeneficiaryGoneClosing {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly lines: RequestLineRepo,
    private readonly end: RequestEndService,
    private readonly grants: GroupGrantService,
    private readonly resolution: GroupResolutionService,
    private readonly outcomes: RequestOutcomeService,
    private readonly audit: AuditApi,
  ) {}

  /** Ends the request as cancelled. The caller holds its lock and has judged that no grant task has begun. */
  async cancelRequest(
    tx: DbTx,
    actor: SystemActor,
    request: AccessRequestRecord,
    cause: SystemCancelCause,
    now: Date,
  ): Promise<void> {
    const released = await this.end.close(tx, null, request, 'REQUEST_CANCELLED', now);
    await this.requests.setCancellation(tx, request.id, {
      cancelledAt: now,
      cancelledByEmployeeId: null,
      cause,
      note: null,
    });
    await this.audit.record(
      tx,
      systemEvent(actor, request, 'ACCESS_REQUEST.CANCELLED', {
        requestId: request.id,
        from: request.state,
        to: 'CANCELLED',
        reasonKind: cause,
        cancelledByEmployeeId: null,
        beneficiaryEmployeeId: request.beneficiaryEmployeeIds[0],
        taskId: null,
        taskStatusBefore: null,
        commitmentsReleased: released.length,
        releasedMinor: released.reduce((sum, item) => sum + item.releasedMinor, 0n).toString(),
      }),
    );
    await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, now);
  }

  /**
   * Ends the line of the person as cancelled and nothing else of the request: the others are decided, granted and withdrawn as before,
   * and the request follows its lines (`GroupResolutionService`, which ends it when none is live). The caller holds the locks of the
   * request and of the line and has judged that the grant of the line has not begun.
   */
  async cancelLine(
    tx: DbTx,
    actor: SystemActor,
    request: AccessRequestRecord,
    line: LineRecord,
    cause: SystemCancelCause,
    now: Date,
  ): Promise<void> {
    await this.lines.move(tx, request.id, line.employeeId, {
      state: 'CANCELLED',
      endedAt: now,
      endedByEmployeeId: null,
      endReason: null,
      cancelCause: cause,
    });
    // What was held for the person goes back, and nobody else's share does (`US-05-17` AC-10).
    const released = holdsMoney(line.state);
    if (released) await this.grants.release(tx, request.id, line.employeeId, 'REQUEST_CANCELLED', now);
    await this.audit.record(
      tx,
      systemEvent(
        actor,
        request,
        'ACCESS_REQUEST.LINE_CANCELLED',
        lineCancelledDetail(
          request,
          { employeeId: line.employeeId, from: line.state, cause, actorEmployeeId: null },
          null,
          released,
        ),
      ),
    );
    await this.outcomes.ended(tx, request, [line.employeeId], now);
    await this.resolution.resolve(tx, null, request.id, now);
  }
}
