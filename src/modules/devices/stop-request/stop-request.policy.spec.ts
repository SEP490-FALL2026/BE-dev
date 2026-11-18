import type { BusinessDate } from '../../../core/business-date';
import {
  STOP_REQUEST_WORKING_DAYS,
  isStopRequestOverdue,
  stopRequestDueAt,
  stopRequestVerdict,
  type StopRequestFacts,
} from './stop-request.policy';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const open: StopRequestFacts = { registrationEnded: false, collectionStopped: false, openRequestExists: false };

describe('stopRequestVerdict', () => {
  it('lets a holder of a registration in force ask to stop collection', () => {
    expect(stopRequestVerdict(open)).toBeNull();
  });

  it('names the first reason in the order ENDED, ALREADY_STOPPED, DUPLICATE', () => {
    expect(stopRequestVerdict({ registrationEnded: true, collectionStopped: true, openRequestExists: true })).toBe(
      'REGISTRATION_ENDED',
    );
    expect(stopRequestVerdict({ registrationEnded: false, collectionStopped: true, openRequestExists: true })).toBe(
      'ALREADY_STOPPED',
    );
    expect(stopRequestVerdict({ ...open, openRequestExists: true })).toBe('DUPLICATE');
  });
});

describe('stopRequestDueAt', () => {
  const none = new Set<BusinessDate>();

  it('is two working days, the same wall clock: 09:00 on a Monday is 09:00 on the Wednesday (US-09-04 AC-5)', () => {
    expect(STOP_REQUEST_WORKING_DAYS).toBe(2);
    const monday = new Date('2026-11-16T02:00:00.000Z');

    expect(stopRequestDueAt(monday, none, TIME_ZONE).toISOString()).toBe('2026-11-18T02:00:00.000Z');
  });

  it('skips the weekend: a request on a Friday is due on the Tuesday', () => {
    const friday = new Date('2026-11-20T02:00:00.000Z');

    expect(stopRequestDueAt(friday, none, TIME_ZONE).toISOString()).toBe('2026-11-24T02:00:00.000Z');
  });

  it('skips a day nobody works', () => {
    const monday = new Date('2026-11-16T02:00:00.000Z');
    const holiday = new Set<BusinessDate>(['2026-11-17']);

    expect(stopRequestDueAt(monday, holiday, TIME_ZONE).toISOString()).toBe('2026-11-19T02:00:00.000Z');
  });
});

describe('isStopRequestOverdue', () => {
  const dueAt = new Date('2026-11-18T02:00:00.000Z');

  it('is overdue only while open and after the deadline', () => {
    expect(isStopRequestOverdue('OPEN', dueAt, new Date('2026-11-18T02:00:00.001Z'))).toBe(true);
    expect(isStopRequestOverdue('OPEN', dueAt, dueAt)).toBe(false);
    expect(isStopRequestOverdue('COMPLETED', dueAt, new Date('2026-12-01T00:00:00.000Z'))).toBe(false);
    expect(isStopRequestOverdue('INVALID', dueAt, new Date('2026-12-01T00:00:00.000Z'))).toBe(false);
  });
});
