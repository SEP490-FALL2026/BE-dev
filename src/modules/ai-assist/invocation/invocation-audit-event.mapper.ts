import type { AuditEventInput } from '../../audit/public/audit.types';

/*
 * The audit events of the content of the calls of the AI: who read it, and what an operator purged. Neither carries content: the read
 * names the call and the purge counts what it deleted. No key may read as a secret to the audit trail (`AuditApi` refuses pass, hash,
 * token…).
 */

/** The account that reads a content, as the audit trail names them. */
export interface ContentReader {
  appUserId: string;
  roles: readonly string[];
  sessionId: string;
}

/** `AI_INVOCATION.CONTENT_READ`: one read of the content of a call, by the Super Admin. The payload is the id of the call only. */
export function contentReadEvent(reader: ContentReader, organizationId: string, invocationId: string): AuditEventInput {
  return {
    organizationId,
    actorKind: 'USER',
    actorAppUserId: reader.appUserId,
    actorRoles: reader.roles,
    action: 'AI_INVOCATION.CONTENT_READ',
    resourceType: 'AiInvocation',
    resourceId: invocationId,
    after: { invocationId },
    correlationId: reader.sessionId,
  };
}

/** `AI_INVOCATION.PURGED`: the contents deleted up to the end of the day `through`, by an operator; the count and the cut-off only. */
export function contentsPurgedEvent(
  organizationId: string,
  facts: { deletedCount: number; through: string },
  operatorReference: string,
  correlationId: string,
): AuditEventInput {
  return {
    organizationId,
    actorKind: 'OPERATOR',
    actorAppUserId: null,
    actorRoles: [],
    action: 'AI_INVOCATION.PURGED',
    resourceType: 'AiInvocationContent',
    resourceId: facts.through,
    after: { deletedCount: facts.deletedCount, through: facts.through },
    correlationId,
    operatorReference,
  };
}
