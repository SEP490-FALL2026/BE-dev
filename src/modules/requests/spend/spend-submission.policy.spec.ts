import { checkSupplement, entryFor, supplementAuditDetail, supplementChangeOf } from './spend-submission.policy';

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
});

describe('the supplementary file (US-06-14 AC-13, AC-15; US-05-04 AC-16)', () => {
  const facts = {
    state: 'AWAITING_SPEND_SUBMISSION',
    priced: true,
  };

  it('leaves people of a group out of a request back in the queue', () => {
    expect(checkSupplement({ ...facts, leavesPeopleOut: true })).toBeNull();
  });

  it.each(['PENDING', 'AWAITING_FINANCE_REVIEW', 'AWAITING_SPEND_DECISION', 'AWAITING_BUDGET', 'EXECUTING'])(
    'is not for a request that is %s',
    (state) => {
      expect(checkSupplement({ ...facts, state })).toBe('NOT_IN_QUEUE');
    },
  );

  it('is not for a request with no price, nor to the same day', () => {
    expect(checkSupplement({ ...facts, priced: false })).toBe('NOT_PRICED');
    expect(checkSupplement({ ...facts })).toBe('NO_CHANGE');
  });
});

describe('what a supplementary file changes, and what it says (QĐ-82n, US-06-14 AC-13, AC-15)', () => {
  const before = {
    status: 'PRICED' as const,
    expectedSpendOn: '2026-11-01',
    budgetYear: 2026,
    amount: { amountMinor: 1000n, currency: 'VND' },
  };
  const after = {
    status: 'PRICED' as const,
    expectedSpendOn: '2027-01-15',
    budgetYear: 2027,
    amount: { amountMinor: 1200n, currency: 'VND' },
  };

  it('puts what the request was beside what it became: the day, the year, the amount and the currency it keeps', () => {
    expect(supplementChangeOf(before, after)).toEqual({
      beforeExpectedSpendOn: '2026-11-01',
      afterExpectedSpendOn: '2027-01-15',
      beforeBudgetYear: 2026,
      afterBudgetYear: 2027,
      beforeAmountMinor: 1000n,
      afterAmountMinor: 1200n,
      currency: 'VND',
    });
  });

  it.each([
    ['is not priced again', { ...after, status: 'MISSING' as const }, before],
    ['has no amount again', { ...after, amount: null }, before],
    ['has no day again', { ...after, expectedSpendOn: null }, before],
    ['has no year again', { ...after, budgetYear: null }, before],
    ['had no amount', after, { ...before, amount: null }],
    ['had no day', after, { ...before, expectedSpendOn: null }],
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
          beforeExpectedSpendOn: '2026-11-01',
          afterExpectedSpendOn: '2027-01-15',
          beforeBudgetYear: 2026,
          afterBudgetYear: 2027,
          beforeAmountMinor: 1000n,
          afterAmountMinor: 1200n,
        },
        ['emp-3'],
      ),
    ).toEqual({
      requestId: 'req-1',
      number: 2,
      before: '2026-11-01',
      after: '2027-01-15',
      beforeBudgetYear: 2026,
      afterBudgetYear: 2027,
      beforeAmountMinor: '1000',
      afterAmountMinor: '1200',
      droppedEmployeeIds: ['emp-3'],
    });
  });
});
