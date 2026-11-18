import { isStopRequestOverdue } from './stop-request.policy';
import type { StopRequestRecord } from './stop-request.repo';

/** The wire form of a request; it is late only while open and past its deadline. */
export function toStopRequestWire(record: StopRequestRecord, now: Date) {
  // Every writer sets `due_at`; the column is nullable only in the table, so a row without one reads as due when it was received.
  const dueAt = record.dueAt ?? record.requestedAt;

  return {
    id: record.id,
    registrationId: record.registrationId,
    deviceId: record.deviceId,
    holderEmployeeId: record.holderEmployeeId,
    state: record.state,
    invalidReason: record.invalidReason,
    requestedAt: record.requestedAt.toISOString(),
    dueAt: dueAt.toISOString(),
    handledAt: record.handledAt?.toISOString() ?? null,
    handledByAppUserId: record.handledByAppUserId,
    selfHandled: record.selfHandled,
    overdue: isStopRequestOverdue(record.state, dueAt, now),
  };
}
