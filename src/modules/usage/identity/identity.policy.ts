import type { UnmatchedStatus } from './identity.types';

/** What the queue lists unless asked otherwise: the open ones and the dismissed ones, which stay in the queue (`US-08-04` AC-7). */
export const DEFAULT_QUEUE_STATUSES: readonly UnmatchedStatus[] = ['OPEN', 'DISMISSED'];

/** The statuses to list: the one asked for, or the open and the dismissed ones. */
export function queueStatuses(requested: UnmatchedStatus | undefined): readonly UnmatchedStatus[] {
  return requested ? [requested] : DEFAULT_QUEUE_STATUSES;
}

/** An identifier that is already resolved is not handled twice (`QT 5.2`): it may be tied or dismissed only while it is open or dismissed. */
export function isHandleable(status: UnmatchedStatus): boolean {
  return status !== 'RESOLVED';
}
