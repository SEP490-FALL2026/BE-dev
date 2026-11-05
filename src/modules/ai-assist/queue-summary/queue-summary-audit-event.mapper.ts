import type { AuditEventInput } from '../../audit/public/audit.types';
import type { InvocationMetadata } from '../invocation/invocation.types';
import { QUEUE_SUMMARY_FEATURE } from './queue-summary.types';

/** The person a call is made for, as the audit trail names them. */
export interface SummaryActor {
  appUserId: string;
  roles: readonly string[];
  sessionId: string;
}

/** How a call ended, as the audit trail tells it. */
export interface SummaryEnding {
  status: 'COMPLETED' | 'NO_VALID_OUTPUT' | 'FAILED';
  errorCode: string | null;
  metadata: InvocationMetadata | null;
  acceptedCount: number;
  rejectedCount: number;
}

/*
 * The audit events of a call of the AI: metadata and the reference to the record of its content, never the context, the
 * prompt or the answer. No key may read as a secret to the audit trail (`AuditApi` refuses pass, hash, token…): the configuration is a
 * `configFingerprint`, and the counts of the model are `promptSize` and `completionSize`.
 */

const NO_MODEL = {
  modelId: null,
  modelRevision: null,
  promptVersion: null,
  schemaVersion: null,
  configFingerprint: null,
  latencyMs: null,
  promptSize: null,
  completionSize: null,
};

/** What the AI service said about itself, under keys the audit trail takes; nulls for a call it never answered. */
function modelFacts(metadata: InvocationMetadata | null) {
  if (metadata === null) return NO_MODEL;
  const { promptTokens, completionTokens, ...facts } = metadata;

  return { ...facts, promptSize: promptTokens, completionSize: completionTokens };
}

function event(
  actor: SummaryActor,
  organizationId: string,
  invocationId: string,
  action: string,
  after: NonNullable<AuditEventInput['after']>,
): AuditEventInput {
  return {
    organizationId,
    actorKind: 'USER',
    actorAppUserId: actor.appUserId,
    actorRoles: actor.roles,
    action,
    resourceType: 'AiInvocation',
    resourceId: invocationId,
    after: { feature: QUEUE_SUMMARY_FEATURE, contentRecordId: invocationId, ...after },
    correlationId: actor.sessionId,
  };
}

/** `AI_INVOCATION.REQUESTED`: a call was recorded for the queue revision, with how many steps it sends and leaves out. */
export function summaryRequestedEvent(
  actor: SummaryActor,
  organizationId: string,
  invocationId: string,
  facts: { queueRevision: string; stepCount: number; omittedCount: number },
): AuditEventInput {
  return event(actor, organizationId, invocationId, 'AI_INVOCATION.REQUESTED', { status: 'PENDING', ...facts });
}

/** `AI_INVOCATION.COMPLETED` (lines kept, or none valid) or `AI_INVOCATION.FAILED`, with what the AI service said of itself. */
export function summaryEndedEvent(
  actor: SummaryActor,
  organizationId: string,
  invocationId: string,
  ending: SummaryEnding,
): AuditEventInput {
  return event(
    actor,
    organizationId,
    invocationId,
    ending.status === 'FAILED' ? 'AI_INVOCATION.FAILED' : 'AI_INVOCATION.COMPLETED',
    {
      status: ending.status,
      errorCode: ending.errorCode,
      acceptedCount: ending.acceptedCount,
      rejectedCount: ending.rejectedCount,
      ...modelFacts(ending.metadata),
    },
  );
}

/** `AI_INVOCATION.FAILED` of a call that ended with no answer to record: taken for stuck, or its source could not be read. */
export function summaryFailedEvent(
  actor: SummaryActor,
  organizationId: string,
  invocationId: string,
  errorCode: string,
): AuditEventInput {
  return summaryEndedEvent(actor, organizationId, invocationId, {
    status: 'FAILED',
    errorCode,
    metadata: null,
    acceptedCount: 0,
    rejectedCount: 0,
  });
}
