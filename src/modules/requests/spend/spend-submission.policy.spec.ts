import {
  checkSupplement,
  entryFor,
  isSingleStep,
  supplementAuditDetail,
  supplementChangeOf,
} from './spend-submission.policy';

describe('where an approved request goes (US-06-14 AC-8)', () => {
  it('is the queue of the head when the head decided the need', () => {
    expect(entryFor({ deciderRole: 'MANAGER' })).toBe('HEAD_QUEUE');
  });

  it('is straight to the check when the spending approver decided it in the place of the head who sent it', () => {
    expect(entryFor({ deciderRole: 'SPENDING_APPROVER' })).toBe('DIRECT');
  });

  it('is straight to the check for a need decided before QĐ-93 by the fallback approver, who had no queue', () => {
    expect(entryFor({ deciderRole: 'FALLBACK_APPROVER' })).toBe('DIRECT');
  });

  it('BR-MF1-02 (review G23-02): a request whose need no head decided goes in one step, the reserve decided by the spending approver', () => {
    expect(isSingleStep({ needDecision: { deciderRole: 'SPENDING_APPROVER' } })).toBe(true);
    expect(isSingleStep({ needDecision: { deciderRole: 'MANAGER' } })).toBe(false);
    expect(isSingleStep({ needDecision: null })).toBe(false);
  });
});

describe('the supplementary file (US-06-14 AC-13, AC-15; US-05-04 AC-16; L2-38)', () => {
  const facts = {
    state: 'AWAITING_SPEND_SUBMISSION',
    priced: true,
  };
  const term = (requested: string, current: string | null) => ({
    requested,
    current,
    today: '2026-11-10',
    maxEndDate: '2027-11-09',
  });

  it('leaves people of a group out of a request back in the queue', () => {
    expect(checkSupplement({ ...facts, leavesPeopleOut: true })).toBeNull();
  });

  it.each(['PENDING', 'AWAITING_FINANCE_REVIEW', 'AWAITING_SPEND_DECISION', 'AWAITING_BUDGET', 'EXECUTING'])(
    'is not for a request that is %s',
    (state) => {
      expect(checkSupplement({ ...facts, state })).toBe('NOT_IN_QUEUE');
    },
  );

  it('is not for a request with no price, nor for a file that changes nothing', () => {
    expect(checkSupplement({ ...facts, priced: false })).toBe('NOT_PRICED');
    expect(checkSupplement({ ...facts })).toBe('NO_CHANGE');
  });

  it('L2-38: shortens a term to an earlier end date, and gives an end to a right that had none', () => {
    expect(checkSupplement({ ...facts, term: term('2026-12-31', '2027-03-31') })).toBeNull();
    expect(checkSupplement({ ...facts, term: term('2027-09-30', null) })).toBeNull();
  });

  it('L2-38: refuses an end date that is not earlier than the one the request has', () => {
    expect(checkSupplement({ ...facts, term: term('2027-03-31', '2027-03-31') })).toBe('TERM_NOT_REDUCED');
    expect(checkSupplement({ ...facts, term: term('2027-06-30', '2027-03-31') })).toBe('TERM_NOT_REDUCED');
  });

  it('L2-38: refuses an end date before today or more than a year from today', () => {
    expect(checkSupplement({ ...facts, term: term('2026-11-09', null) })).toBe('END_DATE_OUT_OF_RANGE');
    expect(checkSupplement({ ...facts, term: term('2027-11-10', null) })).toBe('END_DATE_OUT_OF_RANGE');
  });
});

describe('what a supplementary file changes, and what it says (QĐ-82n, US-06-14 AC-13, AC-15, P1-06)', () => {
  const before = {
    status: 'PRICED' as const,
    expectedEndDate: null,
    budgetYear: 2026,
    amount: { amountMinor: 1000n, currency: 'VND' },
  };
  const after = {
    status: 'PRICED' as const,
    expectedEndDate: '2026-12-31',
    budgetYear: 2026,
    amount: { amountMinor: 800n, currency: 'VND' },
  };

  it('puts what the request was beside what it became: the end date, the year, the amount and the currency it keeps', () => {
    expect(supplementChangeOf(before, after)).toEqual({
      beforeExpectedEndDate: null,
      afterExpectedEndDate: '2026-12-31',
      beforeBudgetYear: 2026,
      afterBudgetYear: 2026,
      beforeAmountMinor: 1000n,
      afterAmountMinor: 800n,
      currency: 'VND',
    });
  });

  it.each([
    ['is not priced again', { ...after, status: 'MISSING' as const }, before],
    ['has no amount again', { ...after, amount: null }, before],
    ['has no year again', { ...after, budgetYear: null }, before],
    ['had no amount', after, { ...before, amount: null }],
    ['had no year', after, { ...before, budgetYear: null }],
  ])('is not a change that can be recorded when the request %s', (_label, repriced, original) => {
    expect(supplementChangeOf(original, repriced)).toBeNull();
  });

  it('says in the audit entry what the file was before and after, with the amounts as text, and who was left out', () => {
    expect(
      supplementAuditDetail(
        'req-1',
        {
          number: 2,
          beforeExpectedEndDate: null,
          afterExpectedEndDate: '2026-12-31',
          beforeBudgetYear: 2026,
          afterBudgetYear: 2026,
          beforeAmountMinor: 1000n,
          afterAmountMinor: 800n,
        },
        ['emp-3'],
      ),
    ).toEqual({
      requestId: 'req-1',
      number: 2,
      beforeExpectedEndDate: null,
      afterExpectedEndDate: '2026-12-31',
      beforeBudgetYear: 2026,
      afterBudgetYear: 2026,
      beforeAmountMinor: '1000',
      afterAmountMinor: '800',
      droppedEmployeeIds: ['emp-3'],
    });
  });
});
