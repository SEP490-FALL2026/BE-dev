import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { AuditEventInput, AuditValue } from '../../audit/public/audit.types';
import type { OperatorAuditActor } from '../../licensing/public/licensing.types';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { NeedNotRequiredReason } from './reassignment.policy';
import { reassignmentAuditEvent } from './step-audit-event.mapper';

/** Who the one-step conversion is the act of: a person at a moment of their own request, or the system (a head period, the sweep, the conversion command). */
export type OneStepCause =
  | { kind: 'USER'; actor: AuthenticatedPrincipal; trigger: 'ASSESSMENT_COMPLETED' | 'RESUBMITTED' }
  | { kind: 'SYSTEM'; trigger: string; correlationId: string; operator?: OperatorAuditActor };

/** The need step a conversion refers to: the audit event is then about the step, otherwise about the request. */
export interface ConvertedNeedStep {
  id: string;
  assigneeEmployeeId: string | null;
  waitingReason: string | null;
  createdAt: Date;
}

/**
 * The one place a request becomes a request of one step because its requester heads the department (`QĐ-103p`, `US-05-24`): the request is marked,
 * and the audit event says so in one shape whichever of the moments brought it here (the assessment of the IT Admin done, the request sent again, the
 * queue of the head, the end of the need step). What each moment does after (opening the spend step, routing the request) stays with it; the callers decide
 * only when to convert.
 */
@Injectable()
export class RequesterHeadConversionService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Marks the request one-step because its requester is the head and records it. */
  async convert(
    tx: DbTx,
    request: { id: string; organizationId: string },
    cause: OneStepCause,
    needStep?: ConvertedNeedStep,
  ): Promise<void> {
    await this.requests.markOneStep(tx, request.id, 'REQUESTER_IS_HEAD');
    await this.record(tx, request, { cause, oneStepReason: 'REQUESTER_IS_HEAD', needStep });
  }

  /**
   * Records that the need step needs nobody, for the reason the table gives, when the caller closes the step itself. `requesterBecameHead` is said only
   * when the reason is the requester heading the department.
   */
  async record(
    tx: DbTx,
    request: { id: string; organizationId: string },
    what: { cause: OneStepCause; oneStepReason: NeedNotRequiredReason; needStep?: ConvertedNeedStep | undefined },
  ): Promise<void> {
    await this.audit.record(tx, notRequiredEvent(request, what));
  }
}

function notRequiredEvent(
  request: { id: string; organizationId: string },
  what: { cause: OneStepCause; oneStepReason: NeedNotRequiredReason; needStep?: ConvertedNeedStep | undefined },
): AuditEventInput {
  const { cause, oneStepReason, needStep } = what;
  const after: { [key: string]: AuditValue } = {
    requestId: request.id,
    stepKind: 'NEED',
    trigger: cause.trigger,
    oneStepReason,
  };
  if (cause.kind === 'SYSTEM') after.source = cause.correlationId;
  if (oneStepReason === 'REQUESTER_IS_HEAD') after.requesterBecameHead = true;
  if (needStep) after.stepCreatedAt = needStep.createdAt.toISOString();
  const resource = needStep
    ? { type: 'ACCESS_REQUEST_STEP', id: needStep.id }
    : { type: 'ACCESS_REQUEST', id: request.id };
  if (cause.kind === 'USER') {
    return accessRequestAuditEvent(
      cause.actor,
      request.organizationId,
      'ACCESS_REQUEST.STEP_NOT_REQUIRED',
      resource.type,
      resource.id,
      after,
    );
  }
  const before = needStep
    ? { assigneeEmployeeId: needStep.assigneeEmployeeId, waitingReason: needStep.waitingReason }
    : { assigneeEmployeeId: null, waitingReason: null };

  return reassignmentAuditEvent(
    request.organizationId,
    'ACCESS_REQUEST.STEP_NOT_REQUIRED',
    resource.type,
    resource.id,
    after,
    cause.correlationId,
    before,
    cause.operator,
  );
}
