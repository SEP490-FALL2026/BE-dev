import {
  successorCandidateRefusal,
  successorRequiredRefusal,
  type SuccessorCandidate,
  type SuccessorFacts,
} from './personnel-successor.policy';

const NOT_THE_HEAD: SuccessorFacts = { required: false, chosen: undefined, candidate: null };
const required = (patch: Partial<SuccessorFacts>): SuccessorFacts => ({ ...NOT_THE_HEAD, required: true, ...patch });
const EMPLOYEE = { kind: 'EMPLOYEE', employeeId: 'e' } as const;
const member: SuccessorCandidate = {
  isTransferee: false,
  memberOfOldDepartmentOnDay: true,
  stillWorking: true,
  holdsSuperAdmin: false,
  holdsManager: true,
  holdsSpendingApprover: false,
  hasPendingTransfer: false,
};
const refusedFor = (reason: string) => ({ code: 'SUCCESSOR_NOT_A_MEMBER_ON_DATE', details: { reason } });

describe('whether a head who leaves must name who follows (QĐ-110h, US-03-01 AC-8)', () => {
  it.each([
    ['nothing chosen', undefined],
    ['nobody chosen', { kind: 'NONE' }],
    ['an employee', EMPLOYEE],
  ] as const)('asks nothing of a person who is not the head, whatever they gave: %s', (_name, chosen) => {
    expect(successorRequiredRefusal({ ...NOT_THE_HEAD, chosen })).toBeNull();
  });

  it.each([
    ['nothing is given', undefined],
    ['nobody is chosen: the choice "no successor" is gone', { kind: 'NONE' }],
  ] as const)('refuses a head who leaves when %s', (_name, chosen) => {
    expect(successorRequiredRefusal(required({ chosen }))).toEqual({ code: 'SUCCESSOR_REQUIRED' });
  });

  it('accepts a head who names a member who works and holds MANAGER', () => {
    expect(successorRequiredRefusal(required({ chosen: EMPLOYEE, candidate: member }))).toBeNull();
  });

  it('judges the person named, as a transfer judges them', () => {
    expect(successorRequiredRefusal(required({ chosen: EMPLOYEE, candidate: null }))).toEqual(
      refusedFor('NOT_A_MEMBER_ON_DATE'),
    );
    expect(
      successorRequiredRefusal(required({ chosen: EMPLOYEE, candidate: { ...member, holdsManager: false } })),
    ).toEqual(refusedFor('MANAGER_ROLE_REQUIRED'));
  });
});

describe('who can follow the head of a department on the day (QĐ-66a, QĐ-93a/b)', () => {
  it('accepts a member of the department who works and holds MANAGER', () => {
    expect(successorCandidateRefusal(member)).toBeNull();
  });

  it.each([
    ['is not a member of the old department that day', { memberOfOldDepartmentOnDay: false }, 'NOT_A_MEMBER_ON_DATE'],
    ['is the person who leaves', { isTransferee: true }, 'SAME_PERSON'],
    ['has a transfer of their own waiting', { hasPendingTransfer: true }, 'HAS_PENDING_TRANSFER'],
    ['has left', { stillWorking: false }, 'EMPLOYEE_NOT_ACTIVE'],
    ['holds Super Admin', { holdsSuperAdmin: true }, 'SUPER_ADMIN_CANNOT_HEAD'],
    [
      'holds the spending approver, who never holds MANAGER',
      { holdsSpendingApprover: true },
      'SPENDING_APPROVER_CANNOT_HEAD',
    ],
    ['does not hold MANAGER', { holdsManager: false }, 'MANAGER_ROLE_REQUIRED'],
  ] as const)('refuses a successor who %s', (_name, patch, reason) => {
    expect(successorCandidateRefusal({ ...member, ...patch })).toEqual(refusedFor(reason));
  });

  it('refuses a person who is not there', () => {
    expect(successorCandidateRefusal(null)).toEqual(refusedFor('NOT_A_MEMBER_ON_DATE'));
  });

  it('judges the first thing that is wrong, in the order a person would fix it', () => {
    const reasonOf = (patch: Partial<SuccessorCandidate>) =>
      successorCandidateRefusal({ ...member, ...patch })?.details?.reason;

    expect(reasonOf({ memberOfOldDepartmentOnDay: false, isTransferee: true })).toBe('NOT_A_MEMBER_ON_DATE');
    expect(reasonOf({ isTransferee: true, hasPendingTransfer: true })).toBe('SAME_PERSON');
    expect(reasonOf({ hasPendingTransfer: true, stillWorking: false })).toBe('HAS_PENDING_TRANSFER');
    expect(reasonOf({ holdsSuperAdmin: true, holdsSpendingApprover: true, holdsManager: false })).toBe(
      'SUPER_ADMIN_CANNOT_HEAD',
    );
    expect(reasonOf({ holdsSpendingApprover: true, holdsManager: false })).toBe('SPENDING_APPROVER_CANNOT_HEAD');
  });
});
