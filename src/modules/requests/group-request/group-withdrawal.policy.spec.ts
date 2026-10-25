import { checkLineWithdrawal, hasGrantTask, holdsMoney, type LineWithdrawalFacts } from './group-withdrawal.policy';

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
