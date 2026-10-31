import {
  checkLineWithdrawal,
  hasGrantTask,
  holdsMoney,
  releasedByYear,
  withdrawalAuditOf,
  type LineWithdrawalFacts,
} from './group-withdrawal.policy';

const facts: LineWithdrawalFacts = {
  actorEmployeeId: 'sender',
  requesterEmployeeId: 'sender',
  actorHeadsDepartment: false,
  lineState: 'NEED_CONFIRMED',
  spendStage: null,
  reason: null,
};

describe('withdrawing one person of a request for a group (US-05-08, US-05-17 AC-10)', () => {
  it.each(['AWAITING_NEED', 'NEED_CONFIRMED', 'APPROVED', 'EXECUTING'] as const)(
    'lets the sender withdraw the person while their line is %s, with or without a reason',
    (lineState) => {
      expect(checkLineWithdrawal({ ...facts, lineState })).toBeNull();
      expect(checkLineWithdrawal({ ...facts, lineState, reason: 'Not needed' })).toBeNull();
    },
  );

  it('refuses a person the request is for who is not the sender, whatever the state of their line', () => {
    expect(checkLineWithdrawal({ ...facts, actorEmployeeId: 'e2' })).toBe('NOT_REQUESTER');
    expect(checkLineWithdrawal({ ...facts, actorEmployeeId: 'e2', lineState: 'EXECUTING' })).toBe('NOT_REQUESTER');
  });

  it('refuses a head of the department who is not the sender outside the stages the head acts on', () => {
    expect(checkLineWithdrawal({ ...facts, actorEmployeeId: 'head', actorHeadsDepartment: true })).toBe(
      'NOT_REQUESTER',
    );
    expect(
      checkLineWithdrawal({
        ...facts,
        actorEmployeeId: 'head',
        actorHeadsDepartment: true,
        spendStage: 'WAITING_SPEND_DECISION',
        reason: 'x',
      }),
    ).toBe('NOT_REQUESTER');
  });

  it.each(['BLOCKED', 'RETURNED_BY_FINANCE', 'WAITING_BUDGET'] as const)(
    'lets the head withdraw in the stage %s with a reason, and not without one',
    (spendStage) => {
      const head = { ...facts, actorEmployeeId: 'head', actorHeadsDepartment: true, spendStage };

      expect(checkLineWithdrawal({ ...head, reason: 'Left the project' })).toBeNull();
      expect(checkLineWithdrawal(head)).toBe('REASON_REQUIRED');
      expect(checkLineWithdrawal({ ...head, reason: '   ' })).toBe('REASON_REQUIRED');
    },
  );

  it('sends the person whose seat is real to a return, and tells that the withdrawal waits for the IT Admin', () => {
    expect(checkLineWithdrawal({ ...facts, lineState: 'COMPLETED' })).toBe('GRANT_COMPLETED');
    expect(checkLineWithdrawal({ ...facts, lineState: 'AWAITING_IT_CLOSE' })).toBe('WITHDRAWAL_PENDING');
  });

  it.each(['NEED_REJECTED', 'SPEND_REJECTED', 'FAILED', 'WITHDRAWN', 'DROPPED', 'CANCELLED'] as const)(
    'has nothing left to withdraw on a line that ended as %s',
    (lineState) => {
      expect(checkLineWithdrawal({ ...facts, lineState })).toBe('ALREADY_ENDED');
    },
  );

  it('knows which lines hold a part of the commitment and which have a task of the grant', () => {
    expect(
      ['AWAITING_NEED', 'NEED_CONFIRMED', 'APPROVED', 'EXECUTING'].map((state) => holdsMoney(state as never)),
    ).toEqual([false, false, true, true]);
    expect(['APPROVED', 'EXECUTING'].map((state) => hasGrantTask(state as never))).toEqual([false, true]);
  });
});

describe('what is given back and what is recorded when people of a group are withdrawn (US-05-08, US-06-14 AC-14)', () => {
  it('adds up the shares of every person by year, in the order the years first appear, and nothing for nobody', () => {
    expect(
      releasedByYear([
        [
          { year: 2026, amountMinor: 100n },
          { year: 2027, amountMinor: 50n },
        ],
        [{ year: 2026, amountMinor: 25n }],
        [],
      ]),
    ).toEqual([
      { year: 2026, amountMinor: 125n },
      { year: 2027, amountMinor: 50n },
    ]);
    expect(releasedByYear([])).toEqual([]);
  });

  const request = { id: 'req-1', requesterEmployeeId: 'sender' };
  const line = { employeeId: 'emp-2', state: 'APPROVED' as const };

  it('records a line that ended as withdrawn, with whether its money went back and whether the sender did it', () => {
    expect(
      withdrawalAuditOf(
        request,
        line,
        { kind: 'ENDED', released: true },
        { actorEmployeeId: 'sender', reason: 'Không cần' },
      ),
    ).toEqual({
      action: 'ACCESS_REQUEST.LINE_WITHDRAWN',
      detail: {
        requestId: 'req-1',
        beneficiaryEmployeeId: 'emp-2',
        from: 'APPROVED',
        to: 'WITHDRAWN',
        withdrawnByEmployeeId: 'sender',
        reason: 'Không cần',
        requesterEmployeeId: 'sender',
        byRequester: true,
        released: true,
      },
    });
  });

  it('records a line that waits for the IT Admin as requested, with the task, and no money given back', () => {
    const recorded = withdrawalAuditOf(
      request,
      { employeeId: 'emp-2', state: 'EXECUTING' },
      { kind: 'WAITING_FOR_IT', taskId: 'task-1' },
      { actorEmployeeId: 'head', reason: null },
    );

    expect(recorded.action).toBe('ACCESS_REQUEST.LINE_WITHDRAWAL_REQUESTED');
    expect(recorded.detail).toMatchObject({
      to: 'AWAITING_IT_CLOSE',
      byRequester: false,
      released: false,
      taskId: 'task-1',
    });
  });
});
