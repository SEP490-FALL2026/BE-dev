import {
  checkLineWithdrawal,
  needStepOfGroup,
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
  lineState: 'AWAITING_NEED',
  needStep: 'PENDING',
  requestState: 'PENDING',
  spendStage: null,
  reason: null,
};

describe('withdrawing one person of a request for a group (US-05-08, US-05-17 AC-10)', () => {
  it('QĐ-113d: lets the sender withdraw the person while their line awaits the need, with or without a reason', () => {
    expect(checkLineWithdrawal(facts)).toBeNull();
    expect(checkLineWithdrawal({ ...facts, reason: 'Not needed' })).toBeNull();
  });

  it.each(['NEED_CONFIRMED', 'APPROVED', 'EXECUTING'] as const)(
    'QĐ-113d: refuses the sender once the line is %s, a decision was taken',
    (lineState) => {
      expect(checkLineWithdrawal({ ...facts, lineState, needStep: 'APPROVED' })).toBe('WITHDRAWAL_AFTER_DECISION');
    },
  );

  it('QĐ-113d: lets the sender withdraw a person the head vouched for by sending, until the spending approver decides', () => {
    expect(checkLineWithdrawal({ ...facts, lineState: 'NEED_CONFIRMED', needStep: 'NOT_REQUIRED' })).toBeNull();
    expect(checkLineWithdrawal({ ...facts, lineState: 'APPROVED', needStep: 'NOT_REQUIRED' })).toBe(
      'WITHDRAWAL_AFTER_DECISION',
    );
  });

  it('QĐ-113d: lets the sender withdraw any open line while the request is sent back to add what is missing', () => {
    expect(
      checkLineWithdrawal({
        ...facts,
        lineState: 'NEED_CONFIRMED',
        needStep: 'APPROVED',
        requestState: 'AWAITING_REQUESTER_REVISION',
      }),
    ).toBeNull();
  });

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

  it.each(['BLOCKED', 'RESERVE_CONFIRMATION'] as const)(
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

describe('the need step a request for a group is withdrawn by (QĐ-113d)', () => {
  const steps = [
    { id: 's1', state: 'PENDING' as const },
    { id: 's2', state: 'APPROVED' as const },
    { id: 's3', state: 'NOT_REQUIRED' as const },
  ];
  const first = steps[0];

  it('is the open step while every live person awaits their need', () => {
    expect(needStepOfGroup(steps, first, [{ state: 'AWAITING_NEED', needStepId: 's1' }], 'req')).toBe('PENDING');
  });

  it('is NOT_REQUIRED while the people the head vouched for wait for the spending approver', () => {
    expect(needStepOfGroup(steps, first, [{ state: 'NEED_CONFIRMED', needStepId: 's3' }], 'req')).toBe('NOT_REQUIRED');
  });

  it('is NOT_REQUIRED for a step the sender held and approved by sending, and not for one another head approved', () => {
    const held = [{ id: 'h1', state: 'APPROVED' as const, assigneeEmployeeId: 'req' }];
    const line = [{ state: 'NEED_CONFIRMED' as const, needStepId: 'h1' }];
    expect(needStepOfGroup(held, held[0], line, 'req')).toBe('NOT_REQUIRED');
    expect(needStepOfGroup(held, held[0], line, 'someone-else')).toBe('APPROVED');
  });

  it('counts as decided as soon as one live person was decided, ended lines left out', () => {
    const lines = [
      { state: 'AWAITING_NEED' as const, needStepId: 's1' },
      { state: 'APPROVED' as const, needStepId: 's2' },
    ];
    expect(needStepOfGroup(steps, first, lines, 'req')).toBe('APPROVED');
    expect(needStepOfGroup(steps, first, [lines[0], { state: 'WITHDRAWN', needStepId: 's2' }], 'req')).toBe('PENDING');
  });
});
