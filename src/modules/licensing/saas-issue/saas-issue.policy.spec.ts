import {
  assignmentProblem,
  assigneeOf,
  canHandle,
  canMove,
  duplicateTargetProblem,
  isReopenLapsed,
  isResponseOverdue,
  messageProblem,
  occurredProblem,
  reopenProblem,
  reopenUntil,
  responseDueOn,
  SAAS_ISSUE_STATES,
  transitionProblem,
  type ReportableAssignment,
  type SaasIssueState,
} from './saas-issue.policy';

const mine: ReportableAssignment = {
  employeeId: 'E1',
  kind: 'PERSONAL',
  failedAt: null,
  cancelledAt: null,
  validUntil: null,
};

describe('the state graph of a SaaS issue (US-07-11)', () => {
  const allowed: [SaasIssueState, SaasIssueState][] = [
    ['NEW', 'IN_PROGRESS'],
    ['NEW', 'DUPLICATE'],
    ['IN_PROGRESS', 'WAITING_REPORTER'],
    ['IN_PROGRESS', 'WAITING_PROVIDER'],
    ['IN_PROGRESS', 'RESOLVED'],
    ['IN_PROGRESS', 'DUPLICATE'],
    ['WAITING_REPORTER', 'IN_PROGRESS'],
    ['WAITING_REPORTER', 'RESOLVED'],
    ['WAITING_REPORTER', 'DUPLICATE'],
    ['WAITING_PROVIDER', 'IN_PROGRESS'],
    ['WAITING_PROVIDER', 'RESOLVED'],
    ['WAITING_PROVIDER', 'DUPLICATE'],
    ['RESOLVED', 'IN_PROGRESS'],
    ['RESOLVED', 'CLOSED'],
  ];

  it('moves along exactly the listed edges and no other', () => {
    for (const from of SAAS_ISSUE_STATES) {
      for (const to of SAAS_ISSUE_STATES) {
        expect([from, to, canMove(from, to)]).toEqual([from, to, allowed.some(([a, b]) => a === from && b === to)]);
      }
    }
  });

  it('lets the IT Admin handle by a transition only the four states, never from a resolved report, a closed one or a duplicate', () => {
    expect(canHandle('NEW', 'IN_PROGRESS')).toBe(true);
    expect(canHandle('WAITING_REPORTER', 'RESOLVED')).toBe(true);
    expect(canHandle('RESOLVED', 'IN_PROGRESS')).toBe(false);
    expect(canHandle('NEW', 'RESOLVED')).toBe(false);
    expect(canHandle('IN_PROGRESS', 'DUPLICATE')).toBe(false);
    expect(canHandle('RESOLVED', 'CLOSED')).toBe(false);
    expect(canHandle('CLOSED', 'IN_PROGRESS')).toBe(false);
    expect(canHandle('DUPLICATE', 'IN_PROGRESS')).toBe(false);
  });

  it.each([
    ['a move off the graph', 'NEW', 'RESOLVED', null, null, 'INVALID_TRANSITION'],
    ['no result to resolve (AC-2)', 'IN_PROGRESS', 'RESOLVED', null, null, 'RESOLUTION_REQUIRED'],
    ['a result to resolve', 'IN_PROGRESS', 'RESOLVED', null, 'resent the invitation', null],
    ['no question to wait for the reporter (AC-4)', 'IN_PROGRESS', 'WAITING_REPORTER', null, null, 'MESSAGE_REQUIRED'],
    ['a question to wait for the reporter', 'IN_PROGRESS', 'WAITING_REPORTER', 'Which account?', null, null],
    ['waiting for the vendor needs no text (AC-3)', 'IN_PROGRESS', 'WAITING_PROVIDER', null, null, null],
  ] as const)('%s', (_name, from, to, message, resolution, expected) => {
    expect(transitionProblem({ from, to, message, resolution })).toBe(expected);
  });
});

describe('the right a person reports on (US-07-10 AC-2, AC-3)', () => {
  const today = '2026-11-02';

  it.each([
    ['a personal right of theirs', mine, null],
    ['a right that ends later', { ...mine, validUntil: '2026-11-03' }, null],
    ['no such right', null, 'ASSIGNMENT_NOT_YOURS'],
    ['the right of somebody else', { ...mine, employeeId: 'E2' }, 'ASSIGNMENT_NOT_YOURS'],
    ['a service account', { ...mine, kind: 'SERVICE' as const }, 'ASSIGNMENT_NOT_YOURS'],
    ['a grant that failed', { ...mine, failedAt: new Date() }, 'ASSIGNMENT_NOT_OPEN'],
    ['a grant that was cancelled', { ...mine, cancelledAt: new Date() }, 'ASSIGNMENT_NOT_OPEN'],
    ['a right that ended today', { ...mine, validUntil: today }, 'ASSIGNMENT_NOT_OPEN'],
  ])('%s', (_name, assignment, expected) => {
    expect(assignmentProblem({ assignment, actorEmployeeId: 'E1', today })).toBe(expected);
  });

  it('refuses a moment of the error in the future', () => {
    const now = new Date('2026-11-02T08:00:00Z');

    expect(occurredProblem(new Date('2026-11-02T08:00:01Z'), now)).toBe('OCCURRED_IN_FUTURE');
    expect(occurredProblem(new Date('2026-11-02T08:00:00Z'), now)).toBeNull();
    expect(occurredProblem(new Date('2026-11-01T08:00:00Z'), now)).toBeNull();
  });
});

describe('who a new report is given to', () => {
  it('names the IT Admin in charge when they can act, else the first who can, else nobody', () => {
    expect(assigneeOf({ inChargeEmployeeId: 'IT1', inChargeUsable: true, fallbackEmployeeId: 'IT0' })).toEqual({
      employeeId: 'IT1',
      byFallback: false,
    });
    expect(assigneeOf({ inChargeEmployeeId: 'IT1', inChargeUsable: false, fallbackEmployeeId: 'IT0' })).toEqual({
      employeeId: 'IT0',
      byFallback: true,
    });
    expect(assigneeOf({ inChargeEmployeeId: null, inChargeUsable: false, fallbackEmployeeId: 'IT0' })).toEqual({
      employeeId: 'IT0',
      byFallback: true,
    });
    expect(assigneeOf({ inChargeEmployeeId: null, inChargeUsable: false, fallbackEmployeeId: null })).toBeNull();
  });
});

describe('the two days a report is bound by (US-07-10 AC-6, US-07-11 AC-6)', () => {
  const none = new Set<string>();

  it('counts the days to respond and to reopen in working days, skipping the weekend and the holidays', () => {
    // 2026-11-02 is a Monday.
    expect(responseDueOn('2026-11-02', 1, none)).toBe('2026-11-03');
    expect(responseDueOn('2026-11-06', 1, none)).toBe('2026-11-09');
    expect(reopenUntil('2026-11-02', 5, none)).toBe('2026-11-09');
    expect(reopenUntil('2026-11-02', 5, new Set(['2026-11-04']))).toBe('2026-11-10');
  });

  it('is overdue only while new and after the day', () => {
    const base = { responseDueOn: '2026-11-03', today: '2026-11-04' };

    expect(isResponseOverdue({ ...base, state: 'NEW' })).toBe(true);
    expect(isResponseOverdue({ ...base, state: 'NEW', today: '2026-11-03' })).toBe(false);
    expect(isResponseOverdue({ ...base, state: 'IN_PROGRESS' })).toBe(false);
  });

  it('reopens a resolved report up to and including the last day, and no later', () => {
    const resolved = { state: 'RESOLVED' as const, reopenUntil: '2026-11-09' };

    expect(reopenProblem({ ...resolved, today: '2026-11-05' })).toBeNull();
    expect(reopenProblem({ ...resolved, today: '2026-11-09' })).toBeNull();
    expect(reopenProblem({ ...resolved, today: '2026-11-10' })).toBe('REOPEN_WINDOW_ENDED');
    expect(reopenProblem({ state: 'CLOSED', reopenUntil: '2026-11-09', today: '2026-11-10' })).toBe(
      'REOPEN_WINDOW_ENDED',
    );
    expect(reopenProblem({ state: 'IN_PROGRESS', reopenUntil: null, today: '2026-11-05' })).toBe('NOT_RESOLVED');
  });

  it('closes a resolved report only after its last day', () => {
    expect(isReopenLapsed({ state: 'RESOLVED', reopenUntil: '2026-11-09', today: '2026-11-09' })).toBe(false);
    expect(isReopenLapsed({ state: 'RESOLVED', reopenUntil: '2026-11-09', today: '2026-11-10' })).toBe(true);
    expect(isReopenLapsed({ state: 'IN_PROGRESS', reopenUntil: '2026-11-01', today: '2026-11-10' })).toBe(false);
  });
});

describe('what is added to a report and what it duplicates (US-07-11 AC-5)', () => {
  it('adds nothing to a report that is closed or a duplicate', () => {
    expect(messageProblem('CLOSED')).toBe('CLOSED');
    expect(messageProblem('DUPLICATE')).toBe('CLOSED');
    expect(messageProblem('RESOLVED')).toBeNull();
    expect(messageProblem('WAITING_REPORTER')).toBeNull();
  });

  it('marks a duplicate of another report that is not itself a duplicate', () => {
    expect(duplicateTargetProblem({ issueId: 'P2', original: { id: 'P1', state: 'IN_PROGRESS' } })).toBeNull();
    expect(duplicateTargetProblem({ issueId: 'P2', original: { id: 'P2', state: 'NEW' } })).toBe(
      'DUPLICATE_TARGET_INVALID',
    );
    expect(duplicateTargetProblem({ issueId: 'P2', original: { id: 'P1', state: 'DUPLICATE' } })).toBe(
      'DUPLICATE_TARGET_INVALID',
    );
    expect(duplicateTargetProblem({ issueId: 'P2', original: null })).toBe('DUPLICATE_TARGET_INVALID');
  });
});
