import {
  isBacklog,
  isReminderDue,
  noticeCodeOf,
  noticeParamsOf,
  queueRecipientsOf,
  recipientsOf,
  standingOf,
  superiorOf,
  type SlaCalendar,
  type StepRecipientFacts,
} from './step-sla.policy';

const CALENDAR: SlaCalendar = { nonWorkingDates: new Set(), timeZone: 'Asia/Ho_Chi_Minh' };
// Friday 2026-10-23 16:00 in Ho Chi Minh City.
const MADE = new Date('2026-10-23T09:00:00.000Z');

const alone: StepRecipientFacts = {
  holderEmployeeId: 'holder',
  holderUsable: true,
  superiorEmployeeId: 'head',
  superAdminEmployeeId: 'admin',
  stepKind: 'SPEND_APPROVAL',
  requesterEmployeeId: 'requester',
};

describe('the deadline of a step and what it makes due (US-05-09 AC-6)', () => {
  it('is not overdue at 09:00 on the Monday after the Friday it was made, with two days to wait', () => {
    const standing = standingOf({ createdAt: MADE, slaWorkingDays: 2 }, new Date('2026-10-26T02:00:00.000Z'), CALENDAR);

    expect(standing).toMatchObject({ overdue: false, ageWorkingDays: 1, overdueWorkingDays: 0 });
  });

  it('is not overdue at 15:59 on the Tuesday and is overdue at 16:01', () => {
    const before = standingOf({ createdAt: MADE, slaWorkingDays: 2 }, new Date('2026-10-27T08:59:00.000Z'), CALENDAR);
    const after = standingOf({ createdAt: MADE, slaWorkingDays: 2 }, new Date('2026-10-27T09:01:00.000Z'), CALENDAR);

    expect(before.overdue).toBe(false);
    expect(after).toMatchObject({ overdue: true, ageWorkingDays: 2, overdueWorkingDays: 0 });
  });

  it('counts the days late from the day it fell due: made three working days ago with two days to wait is one day late', () => {
    const standing = standingOf({ createdAt: MADE, slaWorkingDays: 2 }, new Date('2026-10-28T03:00:00.000Z'), CALENDAR);

    expect(standing).toMatchObject({ overdue: true, ageWorkingDays: 3, overdueWorkingDays: 1 });
  });

  it('takes a day off added later into account, because the calendar is the one of today', () => {
    const calendar: SlaCalendar = { ...CALENDAR, nonWorkingDates: new Set(['2026-10-26']) };
    const tuesday = new Date('2026-10-27T09:01:00.000Z');

    expect(standingOf({ createdAt: MADE, slaWorkingDays: 2 }, tuesday, CALENDAR).overdue).toBe(true);
    expect(standingOf({ createdAt: MADE, slaWorkingDays: 2 }, tuesday, calendar).overdue).toBe(false);
    expect(
      standingOf({ createdAt: MADE, slaWorkingDays: 2 }, new Date('2026-10-28T09:01:00.000Z'), calendar).overdue,
    ).toBe(true);
  });

  it('uses the number of days the step carries, whatever the parameter is today', () => {
    const wednesday = new Date('2026-10-28T03:00:00.000Z');

    expect(standingOf({ createdAt: MADE, slaWorkingDays: 5 }, wednesday, CALENDAR).overdue).toBe(false);
    expect(standingOf({ createdAt: MADE, slaWorkingDays: 1 }, wednesday, CALENDAR).overdue).toBe(true);
  });

  it('reminds once a working day: not on a day off, not twice on one day, not before it is overdue', () => {
    const standing = standingOf({ createdAt: MADE, slaWorkingDays: 1 }, new Date('2026-10-28T03:00:00.000Z'), CALENDAR);
    const holidays = new Set(['2026-10-28']);

    expect(isReminderDue(standing, '2026-10-28', new Set(), false)).toBe(true);
    expect(isReminderDue(standing, '2026-10-28', new Set(), true)).toBe(false);
    expect(isReminderDue(standing, '2026-10-28', holidays, false)).toBe(false);
    expect(isReminderDue(standing, '2026-10-24', new Set(), false)).toBe(false);
    const early = standingOf({ createdAt: MADE, slaWorkingDays: 2 }, new Date('2026-10-26T03:00:00.000Z'), CALENDAR);
    expect(isReminderDue(early, '2026-10-26', new Set(), false)).toBe(false);
  });
});

describe('the person above the holder (FR-3.8, QĐ-52c)', () => {
  const position = {
    holderEmployeeId: 'e1',
    isSpendingApprover: false,
    departmentHeadEmployeeId: 'h1',
    spendingApproverEmployeeId: 'c1',
  };

  it('is the head of the department for an employee, an IT Admin, Finance and the fallback approver alike', () => {
    expect(superiorOf(position)).toBe('h1');
  });

  it('is the spending approver for a head', () => {
    expect(superiorOf({ ...position, holderEmployeeId: 'h1' })).toBe('c1');
  });

  it('is nobody for the spending approver, even one who also heads the department', () => {
    expect(superiorOf({ ...position, holderEmployeeId: 'c1', isSpendingApprover: true })).toBeNull();
    expect(
      superiorOf({ ...position, holderEmployeeId: 'c1', isSpendingApprover: true, departmentHeadEmployeeId: 'c1' }),
    ).toBeNull();
  });

  it('is nobody when the department has no head or the head would be the spending approver themself', () => {
    expect(superiorOf({ ...position, departmentHeadEmployeeId: null })).toBeNull();
    expect(superiorOf({ ...position, holderEmployeeId: 'h1', spendingApproverEmployeeId: null })).toBeNull();
    expect(superiorOf({ ...position, holderEmployeeId: 'h1', spendingApproverEmployeeId: 'h1' })).toBeNull();
  });
});

describe('who is told that a step is late (US-05-09 AC-1, AC-4, AC-8, AC-9)', () => {
  it('tells the holder and their superior', () => {
    expect(recipientsOf(alone)).toEqual([
      { employeeId: 'holder', role: 'HOLDER', cause: null },
      { employeeId: 'head', role: 'SUPERIOR', cause: null },
    ]);
  });

  it('tells the Super Admin when there is no superior (the spending approver holds the step)', () => {
    expect(recipientsOf({ ...alone, superiorEmployeeId: null })).toEqual([
      { employeeId: 'holder', role: 'HOLDER', cause: null },
      { employeeId: 'admin', role: 'SUPER_ADMIN', cause: 'NO_SUPERIOR' },
    ]);
  });

  it('treats a superior who is the holder as no superior', () => {
    expect(recipientsOf({ ...alone, superiorEmployeeId: 'holder' }).map((entry) => entry.role)).toEqual([
      'HOLDER',
      'SUPER_ADMIN',
    ]);
  });

  it('tells only the Super Admin of a step nobody holds', () => {
    expect(recipientsOf({ ...alone, holderEmployeeId: null, holderUsable: false, superiorEmployeeId: null })).toEqual([
      { employeeId: 'admin', role: 'SUPER_ADMIN', cause: 'NO_HOLDER' },
    ]);
  });

  it('does not tell a holder who has left, nor their superior, only the Super Admin', () => {
    expect(recipientsOf({ ...alone, holderUsable: false })).toEqual([
      { employeeId: 'admin', role: 'SUPER_ADMIN', cause: 'HOLDER_NOT_USABLE' },
    ]);
  });

  it('is recorded and told to nobody when there is no Super Admin and no superior', () => {
    expect(recipientsOf({ ...alone, superiorEmployeeId: null, superAdminEmployeeId: null })).toEqual([
      { employeeId: 'holder', role: 'HOLDER', cause: null },
    ]);
    expect(recipientsOf({ ...alone, holderEmployeeId: null, holderUsable: false, superAdminEmployeeId: null })).toEqual(
      [],
    );
  });

  it('QĐ-100j: tells the holder of a late need step and the person who asked for the request, and nobody above them', () => {
    expect(recipientsOf({ ...alone, stepKind: 'NEED' })).toEqual([
      { employeeId: 'holder', role: 'HOLDER', cause: null },
      { employeeId: 'requester', role: 'REQUESTER', cause: null },
    ]);
  });

  it('QĐ-100j: tells only the holder of a late need step when the requester has left or is the holder, and never names a person twice', () => {
    expect(recipientsOf({ ...alone, stepKind: 'NEED', requesterEmployeeId: null }).map((entry) => entry.role)).toEqual([
      'HOLDER',
    ]);
    expect(
      recipientsOf({ ...alone, stepKind: 'NEED', requesterEmployeeId: 'holder' }).map((entry) => entry.role),
    ).toEqual(['HOLDER']);
  });

  it('QĐ-100j: still tells the Super Admin of a need step nobody holds, and never the requester then', () => {
    expect(recipientsOf({ ...alone, stepKind: 'NEED', holderEmployeeId: null, holderUsable: false })).toEqual([
      { employeeId: 'admin', role: 'SUPER_ADMIN', cause: 'NO_HOLDER' },
    ]);
  });

  it('QĐ-100j: does not tell the requester of any step but the need step, and keeps the superior of those', () => {
    for (const stepKind of ['SPEND_APPROVAL', 'IT_ASSESSMENT'] as const) {
      expect(recipientsOf({ ...alone, stepKind }).map((entry) => entry.role)).toEqual(['HOLDER', 'SUPERIOR']);
    }
  });

  it('names nobody twice when the Super Admin is also the superior', () => {
    const roles = recipientsOf({ ...alone, superiorEmployeeId: 'admin' }).map((entry) => entry.employeeId);

    expect(new Set(roles).size).toBe(roles.length);
  });
});

describe('who is told that a request waits too long in the queue of its head (US-05-09 AC-11)', () => {
  it('tells the head, and nobody above them', () => {
    expect(queueRecipientsOf({ headEmployeeId: 'head', headUsable: true, superAdminEmployeeId: 'admin' })).toEqual([
      { employeeId: 'head', role: 'HOLDER', cause: null },
    ]);
  });

  it('tells the Super Admin when the department has no head or the head has left', () => {
    const asked = { superAdminEmployeeId: 'admin' };

    expect(queueRecipientsOf({ headEmployeeId: null, headUsable: false, ...asked })).toEqual([
      { employeeId: 'admin', role: 'SUPER_ADMIN', cause: 'NO_HOLDER' },
    ]);
    expect(queueRecipientsOf({ headEmployeeId: 'head', headUsable: false, ...asked })).toEqual([
      { employeeId: 'admin', role: 'SUPER_ADMIN', cause: 'NO_HOLDER' },
    ]);
    expect(queueRecipientsOf({ headEmployeeId: null, headUsable: false, superAdminEmployeeId: null })).toEqual([]);
  });
});

describe('what the notice of a reminder says', () => {
  const facts = {
    requestId: 'r1',
    stepKind: 'NEED' as const,
    reminderNumber: 2,
    ageWorkingDays: 4,
    overdueWorkingDays: 2,
    holderEmployeeId: 'holder',
  };

  it.each([
    ['STEP', 'HOLDER', 'STEP_SLA_REMINDER'],
    ['STEP', 'SUPERIOR', 'STEP_SLA_ESCALATION'],
    ['STEP', 'SUPER_ADMIN', 'STEP_SLA_NO_SUPERIOR'],
    ['STEP', 'REQUESTER', 'STEP_SLA_REMINDER'],
    ['SPEND_QUEUE', 'HOLDER', 'SPEND_QUEUE_REMINDER'],
    ['SPEND_QUEUE', 'SUPER_ADMIN', 'SPEND_QUEUE_REMINDER'],
  ] as const)('is the code for %s and %s', (subject, role, code) => {
    expect(noticeCodeOf(subject, role)).toBe(code);
  });

  it('carries the cause to the Super Admin and the holder to the superior, and no amount, no check and no reason', () => {
    expect(noticeParamsOf('STEP_SLA_REMINDER', facts, null)).toEqual({
      requestId: 'r1',
      stepKind: 'NEED',
      reminderNumber: 2,
      ageWorkingDays: 4,
      overdueWorkingDays: 2,
    });
    expect(noticeParamsOf('STEP_SLA_ESCALATION', facts, null)).toMatchObject({ holderEmployeeId: 'holder' });
    expect(noticeParamsOf('STEP_SLA_NO_SUPERIOR', facts, 'NO_SUPERIOR')).toMatchObject({
      holderEmployeeId: 'holder',
      cause: 'NO_SUPERIOR',
    });
    expect(noticeParamsOf('SPEND_QUEUE_REMINDER', { ...facts, stepKind: null }, null)).toEqual({
      requestId: 'r1',
      reminderNumber: 2,
      ageWorkingDays: 4,
      overdueWorkingDays: 2,
      cause: null,
    });
  });
});

describe('the backlog of a holder (US-05-10 AC-1)', () => {
  it('is more than the threshold, not equal to it', () => {
    expect(isBacklog(10, 10)).toBe(false);
    expect(isBacklog(11, 10)).toBe(true);
    expect(isBacklog(0, 1)).toBe(false);
  });
});
