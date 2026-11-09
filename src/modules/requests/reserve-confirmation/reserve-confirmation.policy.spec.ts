import { awaitsReserveConfirmation, checkConfirmer } from './reserve-confirmation.policy';

const facts = {
  actorEmployeeId: 'head',
  headedDepartmentId: 'dep-1',
  requestDepartmentId: 'dep-1',
  requesterEmployeeId: 'staff',
  beneficiaryEmployeeIds: ['staff'],
};

describe('BR-MF1-06h: who confirms that a request uses the reserve', () => {
  it('BR-MF1-06h: is the head of the department of the request', () => {
    expect(checkConfirmer(facts)).toBeNull();
  });

  it.each([
    ['heads no department', { headedDepartmentId: null }],
    ['heads another department', { headedDepartmentId: 'dep-2' }],
  ])('BR-MF1-06h: is nobody who %s', (_name, change) => {
    expect(checkConfirmer({ ...facts, ...change })).toBe('NOT_HEAD');
  });

  it('QT 1.6: is never the head when they asked for the request or are given it', () => {
    expect(checkConfirmer({ ...facts, requesterEmployeeId: 'head' })).toBe('CONFIRMER_IS_BENEFICIARY');
    expect(checkConfirmer({ ...facts, beneficiaryEmployeeIds: ['staff', 'head'] })).toBe('CONFIRMER_IS_BENEFICIARY');
  });

  it('M-11: the head of the day confirms whoever headed before: nothing about the person who was head when the request was checked', () => {
    // The confirmer is judged on the department headed now; the department of the request is what it is checked against.
    expect(checkConfirmer({ ...facts, actorEmployeeId: 'successor' })).toBeNull();
  });
});

describe('BR-MF1-06h: when a request waits for the confirmation of the reserve', () => {
  const waiting = {
    state: 'AWAITING_SPEND_SUBMISSION',
    newestCheckOutcome: 'USES_RESERVE',
    hasOpenSpendStep: false,
  } as const;

  it('BR-MF1-06h: is in the queue of its head, its newest check uses the reserve and no spend step is open', () => {
    expect(awaitsReserveConfirmation(waiting)).toBe(true);
  });

  it.each([
    ['its check is within the base', { newestCheckOutcome: 'WITHIN_BASE' }],
    ['its check is blocked', { newestCheckOutcome: 'BLOCKED' }],
    ['it was never checked', { newestCheckOutcome: null }],
    ['a spend step is open', { hasOpenSpendStep: true }],
    ['it is with the approver', { state: 'AWAITING_SPEND_DECISION' }],
    ['it was withdrawn', { state: 'WITHDRAWN' }],
  ] as [string, Partial<Parameters<typeof awaitsReserveConfirmation>[0]>][])(
    'is not waiting when %s',
    (_name, change) => {
      expect(awaitsReserveConfirmation({ ...waiting, ...change })).toBe(false);
    },
  );
});
