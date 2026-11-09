import type { AuditPayload, RequestFacts, StatusEvent, StatusFacts } from '../request-status.types';

/** A text of the payload of an event; null when it is not there or is not a text. */
export function text(payload: AuditPayload, key: string): string | null {
  const value = payload[key];

  return typeof value === 'string' && value !== '' ? value : null;
}

export function flag(payload: AuditPayload, key: string): boolean {
  return payload[key] === true;
}

/** The request of the facts; a rule that asked for it is only run when it is there. */
export function requestOf(facts: StatusFacts): RequestFacts {
  if (facts.request === null) throw new Error('A rule that needs the request was run without it.');

  return facts.request;
}

/**
 * The people the request is for, as this event concerns them: the one named by `beneficiaryEmployeeId` when the event is about one
 * person of a request for a group (`US-05-15` AC-9), otherwise everybody it is for.
 */
export function beneficiariesOf(event: StatusEvent, request: RequestFacts): readonly string[] {
  const named = text(event.after, 'beneficiaryEmployeeId');

  return named === null ? request.beneficiaryEmployeeIds : [named];
}

/** The people who are told of how a request ended: the requester, and those it is for when they are not the requester. */
export function outcomeRecipients(event: StatusEvent, request: RequestFacts): string[] {
  return [
    request.requesterEmployeeId,
    ...beneficiariesOf(event, request).filter((id) => id !== request.requesterEmployeeId),
  ];
}

export function stepKindOf(event: StatusEvent): string | null {
  return text(event.after, 'stepKind');
}
