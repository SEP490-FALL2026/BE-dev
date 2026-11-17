import type { AuditPayload, NotificationIntent, RequestFacts, StatusEvent, StatusFacts } from '../request-status.types';

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

/**
 * The notice of a request, or of the line of one person of a request for a group, that the system closed because its person is gone
 * (`QĐ-110d`, `QĐ-110o`); null for any other closing, which the rule of the event tells as it always did. The requester is told, and
 * Finance when money was held for it and went back to the budget. The person is told only when they were moved: one who left has no
 * account to read it with. Nothing else of the group is told: the event names the person.
 */
export function goneNotice(event: StatusEvent, facts: StatusFacts): NotificationIntent | null {
  const reasonKind = text(event.after, 'reasonKind');
  if (reasonKind !== 'SYSTEM_BENEFICIARY_LEFT' && reasonKind !== 'SYSTEM_BENEFICIARY_TRANSFERRED') return null;
  const request = requestOf(facts);
  const moved = reasonKind === 'SYSTEM_BENEFICIARY_TRANSFERRED';
  const [gone] = beneficiariesOf(event, request);
  const heldMoney =
    (typeof event.after.commitmentsReleased === 'number' && event.after.commitmentsReleased > 0) ||
    flag(event.after, 'released');

  return {
    recipients: [
      ...(moved ? outcomeRecipients(event, request) : [request.requesterEmployeeId].filter((id) => id !== gone)),
      heldMoney ? facts.financeEmployeeId : null,
    ],
    code: 'REQUEST_CANCELLED_BENEFICIARY_GONE',
    params: {
      requestId: request.id,
      beneficiaryEmployeeId: gone ?? null,
      reasonKind: moved ? 'TRANSFER' : 'DEPARTURE',
    },
  };
}

export function stepKindOf(event: StatusEvent): string | null {
  return text(event.after, 'stepKind');
}
