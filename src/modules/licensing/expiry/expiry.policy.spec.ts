import {
  daysOverdue,
  isDebt,
  isExpired,
  queueStatusOf,
  reminderRange,
  remindersOwed,
  startRefusalOf,
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
});
