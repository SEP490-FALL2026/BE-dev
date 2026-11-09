import { DEFAULT_QUEUE_STATUSES, isHandleable, queueStatuses } from './identity.policy';

describe('US-08-04 AC-7: the queue of identifiers nobody could be tied to', () => {
  it('lists the open and the dismissed ones unless a status is asked for', () => {
    expect(queueStatuses(undefined)).toEqual(DEFAULT_QUEUE_STATUSES);
    expect(DEFAULT_QUEUE_STATUSES).toEqual(['OPEN', 'DISMISSED']);
    expect(queueStatuses('RESOLVED')).toEqual(['RESOLVED']);
  });

  it('QT 5.2: a resolved identifier is not handled again, a dismissed one may still be tied', () => {
    expect(isHandleable('OPEN')).toBe(true);
    expect(isHandleable('DISMISSED')).toBe(true);
    expect(isHandleable('RESOLVED')).toBe(false);
  });
});
