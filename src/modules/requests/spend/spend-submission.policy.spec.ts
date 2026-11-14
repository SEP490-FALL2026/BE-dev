import { checkSupplement, stopReasonOf, supplementAuditDetail, supplementChangeOf } from './spend-submission.policy';

describe('the supplementary file (US-06-14 AC-13, AC-15; US-05-04 AC-16; L2-38)', () => {
  const facts = {
    state: 'AWAITING_SPEND_SUBMISSION',
    priced: true,
  };
  const term = (requested: number, current: number | null) => ({ requested, current });

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

  it('L2-38, QĐ-111i: shortens the time of use to fewer months, and gives an end to a right that had none', () => {
    expect(checkSupplement({ ...facts, term: term(3, 6) })).toBeNull();
    expect(checkSupplement({ ...facts, term: term(12, null) })).toBeNull();
  });

  it('L2-38: refuses a time of use that is not shorter than the one the request has', () => {
    expect(checkSupplement({ ...facts, term: term(6, 6) })).toBe('TERM_NOT_REDUCED');
    expect(checkSupplement({ ...facts, term: term(9, 6) })).toBe('TERM_NOT_REDUCED');
  });

  it('QĐ-111i: refuses a time of use that is not 1 to 12 whole months', () => {
    expect(checkSupplement({ ...facts, term: term(0, null) })).toBe('TERM_MONTHS_OUT_OF_RANGE');
    expect(checkSupplement({ ...facts, term: term(13, null) })).toBe('TERM_MONTHS_OUT_OF_RANGE');
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

describe('QĐ-111an, R-4: the stop reason of a batch item an older release made is read with the reasons that exist now', () => {
  it('reads a request that stopped for want of a rate as the missing price it comes to, and leaves the other reasons as they were', () => {
    expect(['RATE_MISSING', 'PRICE_MISSING', 'OVER_RESERVE', null].map(stopReasonOf)).toEqual([
      'PRICE_MISSING',
      'PRICE_MISSING',
      'OVER_RESERVE',
      null,
    ]);
  });
});
