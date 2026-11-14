import {
  changeReturnDateRefusal,
  confirmReturnRefusal,
  isOnSchedule,
  isReturnOverdue,
  startLeaveRefusal,
  stateAfterCancelledDeparture,
  type ChangeReturnDateFacts,
  type ConfirmReturnFacts,
  type StartLeaveFacts,
} from './leave.policy';

const NOTE = 'Đơn xin nghỉ dài hạn số DN-05/2026 của HR';

const start = (over: Partial<StartLeaveFacts> = {}): StartLeaveFacts => ({
  today: '2026-06-02',
  startedOn: '2026-06-01',
  approvedReturnOn: '2026-09-01',
  hireDate: '2025-01-02',
  employee: { status: 'ACTIVE', workState: 'WORKING' },
  groundsNote: NOTE,
  ...over,
});

describe('the start of a long leave (US-03-03 AC-5)', () => {
  it('accepts a person who works, a leave that has begun, a later day of return and a whole basis', () => {
    expect(startLeaveRefusal(start())).toBeNull();
    expect(startLeaveRefusal(start({ startedOn: '2026-06-02' }))).toBeNull();
  });

  it.each([
    ['a person who is on leave already', { status: 'ACTIVE', workState: 'ON_LONG_LEAVE' }, 'ALREADY_ON_LEAVE'],
    ['a person who hands over before leaving', { status: 'ACTIVE', workState: 'HANDING_OVER' }, 'EMPLOYEE_NOT_WORKING'],
    ['a person who has left', { status: 'TERMINATED', workState: 'LEFT' }, 'EMPLOYEE_NOT_WORKING'],
  ] as const)('refuses %s', (_name, employee, code) => {
    expect(startLeaveRefusal(start({ employee }))?.code).toBe(code);
  });

  it.each([
    ['a start in the future', { startedOn: '2026-06-03' }, 'IN_FUTURE'],
    ['a start before the person joined', { startedOn: '2024-12-31' }, 'BEFORE_HIRE_DATE'],
  ])('refuses %s', (_name, over, reason) => {
    expect(startLeaveRefusal(start(over))).toEqual({ code: 'START_DATE_INVALID', details: { reason } });
  });

  it.each([
    ['the same day', '2026-06-01'],
    ['a day before the start', '2026-05-31'],
  ])('refuses a day of return on %s as the start', (_name, approvedReturnOn) => {
    expect(startLeaveRefusal(start({ approvedReturnOn }))).toEqual({
      code: 'RETURN_DATE_INVALID',
      details: { reason: 'NOT_AFTER_START' },
    });
  });

  it.each([
    ['no basis', undefined, 'GROUNDS_REQUIRED'],
    ['a blank box', '   ', 'GROUNDS_REQUIRED'],
    ['a box of 501 characters', 'a'.repeat(501), 'GROUNDS_TOO_LONG'],
    ['the code of a notice', 'BM09-2026-000123', 'GROUNDS_IS_NOTICE'],
  ])('refuses %s', (_name, groundsNote, code) => {
    expect(startLeaveRefusal(start({ groundsNote }))?.code).toBe(code);
  });

  it('judges only the facts of the leave: who may record it (the Super Admin, never about themselves) is the service policy, not asked here', () => {
    expect(startLeaveRefusal(start({ groundsNote: undefined }))?.code).toBe('GROUNDS_REQUIRED');
    expect(Object.keys(start())).not.toContain('selfMode');
  });
});

const change = (over: Partial<ChangeReturnDateFacts> = {}): ChangeReturnDateFacts => ({
  today: '2026-08-20',
  status: 'ACTIVE',
  startedOn: '2026-06-01',
  approvedReturnOn: '2026-09-01',
  newApprovedReturnOn: '2026-09-30',
  groundsNote: NOTE,
  ...over,
});

describe('a new day of return (US-03-03 AC-8)', () => {
  it('accepts a later or an earlier day that is not behind us, with a new basis', () => {
    expect(changeReturnDateRefusal(change())).toBeNull();
    expect(changeReturnDateRefusal(change({ newApprovedReturnOn: '2026-08-20' }))).toBeNull();
  });

  it.each([
    ['a leave that has ended', { status: 'ENDED' as const }, 'NOT_ACTIVE'],
    ['the same day', { newApprovedReturnOn: '2026-09-01' }, 'RETURN_DATE_INVALID'],
    ['a day not after the start', { newApprovedReturnOn: '2026-06-01', today: '2026-05-01' }, 'RETURN_DATE_INVALID'],
    ['a day before today', { newApprovedReturnOn: '2026-08-19' }, 'RETURN_DATE_IN_PAST'],
    ['no new basis', { groundsNote: undefined }, 'GROUNDS_REQUIRED'],
    ['a notice as the basis', { groundsNote: 'BM09-2026-000001' }, 'GROUNDS_IS_NOTICE'],
  ])('refuses %s', (_name, over, code) => {
    expect(changeReturnDateRefusal(change(over))?.code).toBe(code);
  });
});

const back = (over: Partial<ConfirmReturnFacts> = {}): ConfirmReturnFacts => ({
  today: '2026-09-01',
  status: 'ACTIVE',
  startedOn: '2026-06-01',
  approvedReturnOn: '2026-09-01',
  returnedOn: '2026-09-01',
  groundsNote: undefined,
  ...over,
});

describe('the return of a person (US-03-03 AC-7, AC-8, R-32)', () => {
  it('needs the basis on the approved day too: the box is prefilled from the leave, may be edited, and is kept (P26)', () => {
    expect(isOnSchedule('2026-09-01', '2026-09-01')).toBe(true);
    expect(confirmReturnRefusal(back())?.code).toBe('GROUNDS_REQUIRED');
    expect(confirmReturnRefusal(back({ groundsNote: '   ' }))?.code).toBe('GROUNDS_REQUIRED');
    expect(confirmReturnRefusal(back({ groundsNote: NOTE }))).toBeNull();
  });

  it('judges a wrong basis on the approved day as on any other: too long, or the code of a notice', () => {
    expect(confirmReturnRefusal(back({ groundsNote: 'BM09-2026-000001' }))?.code).toBe('GROUNDS_IS_NOTICE');
    expect(confirmReturnRefusal(back({ groundsNote: 'x'.repeat(501) }))?.code).toBe('GROUNDS_TOO_LONG');
  });

  it('judges the day before the basis: a leave that ended or a day that cannot be is refused whatever the basis', () => {
    expect(confirmReturnRefusal(back({ status: 'ENDED' }))?.code).toBe('NOT_ACTIVE');
    expect(confirmReturnRefusal(back({ returnedOn: '2026-09-02' }))?.code).toBe('RETURN_DATE_INVALID');
  });

  it.each([
    ['earlier than approved', { returnedOn: '2026-08-20', today: '2026-08-20' }],
    ['later than approved', { returnedOn: '2026-09-05', today: '2026-09-06' }],
  ])('needs a basis when the person comes back %s', (_name, over) => {
    expect(isOnSchedule(over.returnedOn, '2026-09-01')).toBe(false);
    expect(confirmReturnRefusal(back(over))?.code).toBe('GROUNDS_REQUIRED');
    expect(confirmReturnRefusal(back({ ...over, groundsNote: NOTE }))).toBeNull();
  });

  it.each([
    ['a leave that has ended', { status: 'ENDED' as const }, 'NOT_ACTIVE'],
    ['a day before the leave began', { returnedOn: '2026-05-31' }, 'RETURN_DATE_INVALID'],
    ['a day to come', { returnedOn: '2026-09-02' }, 'RETURN_DATE_INVALID'],
  ])('refuses %s', (_name, over, code) => {
    expect(confirmReturnRefusal(back(over))?.code).toBe(code);
  });
});

describe('a return that is late (US-03-03 AC-4)', () => {
  it('is overdue only while the leave runs and the approved day is behind us', () => {
    expect(isReturnOverdue({ status: 'ACTIVE', approvedReturnOn: '2026-08-31' }, '2026-09-01')).toBe(true);
    expect(isReturnOverdue({ status: 'ACTIVE', approvedReturnOn: '2026-09-01' }, '2026-09-01')).toBe(false);
    expect(isReturnOverdue({ status: 'ENDED', approvedReturnOn: '2026-08-31' }, '2026-09-01')).toBe(false);
  });
});

describe('a handover that was cancelled (US-03-04 AC-26)', () => {
  it('returns the person to the leave while the approved day has not come, and to work after it', () => {
    expect(stateAfterCancelledDeparture({ approvedReturnOn: '2026-09-01' }, '2026-08-20')).toBe('ON_LONG_LEAVE');
    expect(stateAfterCancelledDeparture({ approvedReturnOn: '2026-09-01' }, '2026-09-01')).toBe('WORKING');
    expect(stateAfterCancelledDeparture({ approvedReturnOn: '2026-09-01' }, '2026-09-05')).toBe('WORKING');
    expect(stateAfterCancelledDeparture(null, '2026-08-20')).toBe('WORKING');
  });
});
