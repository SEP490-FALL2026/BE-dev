import {
  eventKindOf,
  eventShapeRefusal,
  isNoticeOverdue,
  isPriorityKind,
  noticeGroundsRefusal,
  pendingRefusal,
  rejectReasonRefusal,
  sendRefusal,
  verificationRefusal,
  type SendFacts,
} from './notice.policy';
import type { NoticeKind } from './notice.types';

const HEAD = 'head-1';
const PERSON = 'person-1';
const DES = 'dept-des';
const FIN = 'dept-fin';

function facts(over: Partial<SendFacts> = {}): SendFacts {
  return {
    kind: 'DEPARTURE',
    senderEmployeeId: HEAD,
    employeeId: PERSON,
    employee: { status: 'ACTIVE', workState: 'WORKING', departmentId: DES },
    targetDepartmentId: undefined,
    targetUsable: false,
    senderHeadOf: DES,
    pendingCode: null,
    ...over,
  };
}

const code = (over: Partial<SendFacts>) => sendRefusal(facts(over))?.code ?? null;

describe('who may send which notice (US-03-10)', () => {
  it('lets the head of the department of the person send a notice of leaving, a new title, a long leave or a sudden departure', () => {
    for (const kind of ['DEPARTURE', 'ABRUPT_DEPARTURE', 'JOB_TITLE_CHANGE', 'LONG_LEAVE'] as NoticeKind[]) {
      expect(code({ kind })).toBeNull();
    }
  });

  it('lets the head send a transfer out of the department with the department it goes to', () => {
    expect(code({ kind: 'DEPARTMENT_TRANSFER_OUT', targetDepartmentId: FIN, targetUsable: true })).toBeNull();
  });

  it('lets the head of the receiving department send a transfer in for a person of another department (AC-4)', () => {
    expect(
      code({
        kind: 'DEPARTMENT_TRANSFER_IN',
        targetDepartmentId: FIN,
        targetUsable: true,
        senderHeadOf: FIN,
      }),
    ).toBeNull();
  });

  it.each([
    ['a person that does not exist', { employee: null }, 'EMPLOYEE_NOT_FOUND'],
    [
      'a person who has left',
      { employee: { status: 'TERMINATED', workState: 'LEFT', departmentId: null } },
      'EMPLOYEE_LEFT',
    ],
    ['the head themselves (AC-3)', { employeeId: HEAD }, 'SELF_NOTICE'],
    ['a person of another department (AC-3)', { senderHeadOf: FIN }, 'NOT_DEPARTMENT_HEAD'],
    ['a sender who heads nothing (AC-9)', { senderHeadOf: null }, 'NOT_DEPARTMENT_HEAD'],
    [
      'a departure sent by the head of the receiving department for a person outside theirs (AC-4)',
      { senderHeadOf: FIN, employee: { status: 'ACTIVE', workState: 'WORKING', departmentId: DES } },
      'NOT_DEPARTMENT_HEAD',
    ],
    [
      'a transfer with no department (AC-7)',
      { kind: 'DEPARTMENT_TRANSFER_OUT' as const },
      'TARGET_DEPARTMENT_REQUIRED',
    ],
    [
      'a transfer to a department that cannot take people',
      { kind: 'DEPARTMENT_TRANSFER_OUT' as const, targetDepartmentId: FIN, targetUsable: false },
      'TARGET_DEPARTMENT_INVALID',
    ],
    [
      'a transfer to the department the person is in',
      { kind: 'DEPARTMENT_TRANSFER_OUT' as const, targetDepartmentId: DES, targetUsable: true },
      'TARGET_DEPARTMENT_INVALID',
    ],
    [
      'a department named for a kind that takes none',
      { kind: 'DEPARTURE' as const, targetDepartmentId: FIN, targetUsable: true },
      'TARGET_DEPARTMENT_INVALID',
    ],
    [
      'a transfer in sent by the head of another department',
      { kind: 'DEPARTMENT_TRANSFER_IN' as const, targetDepartmentId: FIN, targetUsable: true, senderHeadOf: DES },
      'NOT_DEPARTMENT_HEAD',
    ],
    [
      'a transfer in for a person already in the receiving department',
      {
        kind: 'DEPARTMENT_TRANSFER_IN' as const,
        targetDepartmentId: FIN,
        targetUsable: true,
        senderHeadOf: FIN,
        employee: { status: 'ACTIVE', workState: 'WORKING', departmentId: FIN },
      },
      'KIND_NOT_ALLOWED',
    ],
    ['a notice of the same kind that waits (AC-5)', { pendingCode: 'BM09-2026-000001' }, 'DUPLICATE_PENDING'],
  ])('refuses %s', (_name, over, expected) => {
    expect(code(over as Partial<SendFacts>)).toBe(expected);
  });

  it('names the notice that waits', () => {
    expect(sendRefusal(facts({ pendingCode: 'BM09-2026-000001' }))).toEqual({
      code: 'DUPLICATE_PENDING',
      details: { pendingCode: 'BM09-2026-000001' },
    });
  });

  it('answers the person first, then the self notice, then the head', () => {
    expect(code({ employee: null, employeeId: HEAD, senderHeadOf: null })).toBe('EMPLOYEE_NOT_FOUND');
    expect(code({ employeeId: HEAD, senderHeadOf: FIN })).toBe('SELF_NOTICE');
  });
});

describe('what a notice that waits allows', () => {
  it('lets only a waiting notice be handled (AC-8)', () => {
    expect(pendingRefusal('PENDING_VERIFICATION')).toBeNull();
    for (const status of ['RECORDED', 'REJECTED', 'WITHDRAWN'] as const) {
      expect(pendingRefusal(status)).toEqual({ code: 'NOT_PENDING' });
    }
  });

  it('requires a reason to reject', () => {
    expect(rejectReasonRefusal('Duplicate event already recorded')).toBeNull();
    for (const empty of [undefined, null, '', '   '])
      expect(rejectReasonRefusal(empty)).toEqual({ code: 'REASON_REQUIRED' });
  });

  it('requires what the notice was checked against', () => {
    expect(verificationRefusal({ method: 'EMAIL_FROM_ISSUER', reference: 'HR mail 31/10' })).toBeNull();
    expect(verificationRefusal({ method: 'DIRECT_CONTACT', reference: '  ' })).toEqual({
      code: 'VERIFICATION_REQUIRED',
    });
    expect(verificationRefusal(undefined)).toEqual({ code: 'VERIFICATION_REQUIRED' });
  });
});

describe('the basis outside the notice (US-03-11 AC-9)', () => {
  const whole = { type: 'RESIGNATION_LETTER', reference: 'DN-31/2026', issuer: 'E1', issuedOn: '2026-10-20' };

  it('accepts a whole basis', () => {
    expect(noticeGroundsRefusal(whole)).toBeNull();
  });

  it('refuses a basis that is only the code of a notice, of this one or of another', () => {
    expect(noticeGroundsRefusal({ ...whole, reference: 'BM09-2026-000123' })).toEqual({ code: 'GROUNDS_IS_NOTICE' });
  });

  it('refuses a basis with no issuer and names the part', () => {
    expect(noticeGroundsRefusal({ ...whole, issuer: '' })).toEqual({
      code: 'GROUNDS_INCOMPLETE',
      details: { missing: ['issuer'] },
    });
  });

  it('refuses no basis at all', () => {
    expect(noticeGroundsRefusal(undefined)).toEqual({ code: 'GROUNDS_REQUIRED' });
    expect(noticeGroundsRefusal({})).toEqual({ code: 'GROUNDS_REQUIRED' });
  });
});

describe('the event a notice is recorded as', () => {
  it.each([
    ['a transfer with its day', 'DEPARTMENT_TRANSFER_OUT', { effectiveOn: '2026-11-01' }],
    [
      'a transfer with the department and the title',
      'DEPARTMENT_TRANSFER_IN',
      { effectiveOn: '2026-11-01', toJobTitleId: 't' },
    ],
    ['a new title with the title and the day', 'JOB_TITLE_CHANGE', { toJobTitleId: 't', effectiveOn: '2026-11-01' }],
    ['a departure with the last working day', 'DEPARTURE', { lastWorkingDay: '2026-10-31' }],
    ['a sudden departure with the day', 'ABRUPT_DEPARTURE', { lastWorkingDay: '2026-10-24' }],
    ['a long leave with its days', 'LONG_LEAVE', { startedOn: '2026-10-01', approvedReturnOn: '2026-12-01' }],
  ] as const)('accepts %s', (_name, kind, event) => {
    expect(eventShapeRefusal(kind, event)).toBeNull();
  });

  it.each([
    ['a transfer with no day', 'DEPARTMENT_TRANSFER_OUT', {}, ['effectiveOn'], []],
    ['a new title with no title', 'JOB_TITLE_CHANGE', { effectiveOn: '2026-11-01' }, ['toJobTitleId'], []],
    [
      'a departure with a transfer day',
      'DEPARTURE',
      { lastWorkingDay: '2026-10-31', effectiveOn: '2026-11-01' },
      [],
      ['effectiveOn'],
    ],
    ['a long leave with only the start', 'LONG_LEAVE', { startedOn: '2026-10-01' }, ['approvedReturnOn'], []],
  ] as const)('refuses %s', (_name, kind, event, missing, notAllowed) => {
    expect(eventShapeRefusal(kind, event)).toEqual({ code: 'EVENT_INVALID', details: { missing, notAllowed } });
  });

  it('maps each kind to the event it leads to', () => {
    expect(eventKindOf('DEPARTMENT_TRANSFER_OUT')).toBe('DEPARTMENT_TRANSFER');
    expect(eventKindOf('DEPARTMENT_TRANSFER_IN')).toBe('DEPARTMENT_TRANSFER');
    expect(eventKindOf('JOB_TITLE_CHANGE')).toBe('DEPARTMENT_TRANSFER');
    expect(eventKindOf('DEPARTURE')).toBe('OFFBOARDING_CASE');
    expect(eventKindOf('ABRUPT_DEPARTURE')).toBe('OFFBOARDING_CASE');
    expect(eventKindOf('LONG_LEAVE')).toBe('LONG_LEAVE');
  });
});

describe('priority and lateness', () => {
  it('marks only a sudden departure as a priority', () => {
    expect(isPriorityKind('ABRUPT_DEPARTURE')).toBe(true);
    expect(isPriorityKind('DEPARTURE')).toBe(false);
  });

  it('is late only while it waits and its day has passed', () => {
    expect(isNoticeOverdue({ status: 'PENDING_VERIFICATION', dueOn: '2026-10-29' }, '2026-10-30')).toBe(true);
    expect(isNoticeOverdue({ status: 'PENDING_VERIFICATION', dueOn: '2026-10-30' }, '2026-10-30')).toBe(false);
    expect(isNoticeOverdue({ status: 'RECORDED', dueOn: '2026-10-01' }, '2026-10-30')).toBe(false);
  });
});
