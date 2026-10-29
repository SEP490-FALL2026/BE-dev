import { checkAnswer, checkAsk } from './budget-information.policy';

const ask = {
  actorEmployeeId: 'approver',
  requesterEmployeeId: 'requester',
  beneficiaryEmployeeIds: ['beneficiary'],
  assigneeEmployeeId: 'approver',
  stepState: 'PENDING',
  hasOpenQuestion: false,
};

const answer = {
  actorIsFinance: true,
  actorEmployeeId: 'finance',
  requesterEmployeeId: 'requester',
  beneficiaryEmployeeIds: ['beneficiary'],
  approverEmployeeIds: ['approver', null],
  questionState: 'OPEN',
};

describe('the question to Finance and its answer', () => {
  describe('checkAsk', () => {
    it('lets the holder of the pending step ask', () => {
      expect(checkAsk(ask)).toBeNull();
    });

    it.each([
      ['somebody else', { actorEmployeeId: 'finance' }, 'NOT_THE_ASSIGNEE'],
      ['a party to the request', { actorEmployeeId: 'requester', assigneeEmployeeId: 'requester' }, 'OWN_REQUEST'],
      ['a step that is waiting for a holder', { stepState: 'WAITING', assigneeEmployeeId: null }, 'NOT_THE_ASSIGNEE'],
      ['a step that is decided', { stepState: 'APPROVED' }, 'STEP_NOT_PENDING'],
      ['a question that is still open', { hasOpenQuestion: true }, 'ALREADY_OPEN'],
    ])('refuses %s', (_name, change, refusal) => {
      expect(checkAsk({ ...ask, ...change })).toBe(refusal);
    });
  });

  describe('checkAnswer', () => {
    it('lets Finance answer an open question', () => {
      expect(checkAnswer(answer)).toBeNull();
    });

    it.each([
      ['somebody who is not Finance', { actorIsFinance: false }, 'NOT_FINANCE'],
      ['Finance as the requester', { actorEmployeeId: 'requester' }, 'OWN_REQUEST'],
      ['Finance as the beneficiary', { actorEmployeeId: 'beneficiary' }, 'OWN_REQUEST'],
      ['Finance who holds the step (SoD-8)', { actorEmployeeId: 'approver' }, 'SOD_APPROVER'],
      ['Finance who is the spending approver now', { approverEmployeeIds: [null, 'finance'] }, 'SOD_APPROVER'],
      ['a question that was answered', { questionState: 'ANSWERED' }, 'NOT_OPEN'],
      ['a question that was closed', { questionState: 'CLOSED' }, 'NOT_OPEN'],
    ])('refuses %s', (_name, change, refusal) => {
      expect(checkAnswer({ ...answer, ...change })).toBe(refusal);
    });
  });
});
