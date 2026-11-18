import { termEndOf } from '../../../core/term-limit';
import {
  daysOverdue,
  isDebt,
  isExpired,
  queueStatusOf,
  reminderDayOf,
  reminderHeldBack,
  reminderRange,
  remindersOwed,
  revocationOpensOn,
  startRefusalOf,
  systemRevocationOwed,
} from './expiry.policy';

describe('the rules of a right that ends on a day (US-03-05)', () => {
  it('is in force on its end day and expired from the day after (AC-2)', () => {
    expect(isExpired('2026-09-30', '2026-09-30')).toBe(false);
    expect(isExpired('2026-09-30', '2026-10-01')).toBe(true);
    expect(isExpired('2026-09-30', '2026-09-23')).toBe(false);
  });

  it('counts the days past the end and flags a debt only after seven (AC-3)', () => {
    expect(daysOverdue('2026-09-30', '2026-09-30')).toBe(0);
    expect(daysOverdue('2026-09-30', '2026-09-25')).toBe(0);
    expect(daysOverdue('2026-09-30', '2026-10-01')).toBe(1);
    expect(isDebt('2026-09-30', '2026-10-07')).toBe(false);
    expect(isDebt('2026-09-30', '2026-10-08')).toBe(true);
    expect(isDebt('2026-02-27', '2026-03-07')).toBe(true);
  });

  it('reminds from today to seven days ahead, so a missed seventh day is caught up (AC-1)', () => {
    expect(reminderRange('2026-09-23')).toEqual({ from: '2026-09-23', to: '2026-09-30' });
    expect(reminderRange('2026-12-28')).toEqual({ from: '2026-12-28', to: '2027-01-04' });
  });

  it('owes a reminder to the holder, the head and the IT Admin, and none to a head nobody is (AC-1, AC-10)', () => {
    expect(remindersOwed({ holderEmployeeId: 'e', headEmployeeId: 'h', itAdminEmployeeId: 'i' })).toEqual([
      { audience: 'EMPLOYEE', employeeId: 'e' },
      { audience: 'HEAD', employeeId: 'h' },
      { audience: 'IT_ADMIN', employeeId: 'i' },
    ]);
    expect(remindersOwed({ holderEmployeeId: 'e', headEmployeeId: null, itAdminEmployeeId: 'i' })).toEqual([
      { audience: 'EMPLOYEE', employeeId: 'e' },
      { audience: 'IT_ADMIN', employeeId: 'i' },
    ]);
    expect(remindersOwed({ holderEmployeeId: 'e', headEmployeeId: null, itAdminEmployeeId: null })).toEqual([
      { audience: 'EMPLOYEE', employeeId: 'e' },
    ]);
  });

  it.each([
    [{ revocationOpen: false, renewalPending: false }, 'READY_TO_REVOKE'],
    [{ revocationOpen: false, renewalPending: true }, 'WAITING_RENEWAL_DECISION'],
    [{ revocationOpen: true, renewalPending: false }, 'REVOCATION_OPEN'],
    [{ revocationOpen: true, renewalPending: true }, 'REVOCATION_OPEN'],
  ] as const)('puts %j in %s (AC-6, AC-7)', (input, expected) => {
    expect(queueStatusOf(input)).toBe(expected);
  });

  describe('may the IT Admin start the revocation', () => {
    const base = {
      kind: 'PERSONAL',
      expectedEndDate: '2026-09-30',
      open: true,
      today: '2026-10-01',
      status: 'READY_TO_REVOKE',
    } as const;

    it.each([
      [{}, null],
      [{ status: 'REVOCATION_OPEN' }, null],
      [{ kind: 'SERVICE' }, 'NOT_FOUND'],
      [{ expectedEndDate: null }, 'NOT_FOUND'],
      [{ open: false }, 'NOT_OPEN'],
      [{ today: '2026-09-30' }, 'NOT_EXPIRED'],
      [{ status: 'WAITING_RENEWAL_DECISION' }, 'RENEWAL_PENDING'],
    ] as const)('with %j: %s', (change, expected) => {
      expect(startRefusalOf({ ...base, ...change })).toBe(expected);
    });
  });

  describe('T-RQ3: what the end of the time of use does to a right (QĐ-111l, R-27)', () => {
    // A `K1` plan granted on 05/08/2026 for 3 months: the last day is the day before the same day 3 months later.
    const end = termEndOf('2026-08-05', 3);

    it('ends on 04/11/2026, is reminded from 28/10 and has its revocation opened by the system on 05/11', () => {
      expect(end).toBe('2026-11-04');
      expect(reminderDayOf(end)).toBe('2026-10-28');
      expect(revocationOpensOn(end)).toBe('2026-11-05');
      // The reminder range is the same rule seen from the day of the pass: it reaches the end on the 28th and not on the 27th.
      expect(reminderRange('2026-10-27').to < end).toBe(true);
      expect(reminderRange('2026-10-28').to >= end).toBe(true);
    });

    it('follows the new end when the renewal moves it: 04/02/2027 is reminded from 28/01/2027, the old reminder is not owed', () => {
      const renewedEnd = termEndOf('2026-11-05', 3);

      expect(renewedEnd).toBe('2027-02-04');
      expect(reminderDayOf(renewedEnd)).toBe('2027-01-28');
      expect(revocationOpensOn(renewedEnd)).toBe('2027-02-05');
    });

    const owed = {
      expectedEndDate: end,
      renewal: null,
      revocationEver: false,
      today: '2026-11-05',
    } as const;

    it('opens the revocation on the day after the end and not on the end day itself', () => {
      expect(systemRevocationOwed({ ...owed, today: '2026-11-04' })).toBe(false);
      expect(systemRevocationOwed({ ...owed, today: '2026-11-05' })).toBe(true);
      expect(systemRevocationOwed({ ...owed, today: '2026-11-20' })).toBe(true);
    });

    it('opens nothing while a renewal waits, approved or not, and once more when it is refused or withdrawn', () => {
      expect(systemRevocationOwed({ ...owed, renewal: { approved: false } })).toBe(false);
      expect(systemRevocationOwed({ ...owed, renewal: { approved: true } })).toBe(false);
      expect(systemRevocationOwed({ ...owed, renewal: null })).toBe(true);
    });

    it('opens it once for a right: not again after a revocation of the expiry was opened, whatever became of it', () => {
      expect(systemRevocationOwed({ ...owed, revocationEver: true })).toBe(false);
    });

    it('holds the reminder of the old end back only when the renewal is approved (R-27)', () => {
      expect(reminderHeldBack(null)).toBe(false);
      expect(reminderHeldBack({ approved: false })).toBe(false);
      expect(reminderHeldBack({ approved: true })).toBe(true);
    });
  });
});
