import { checkSupplement, entryFor, judgePlanLineChoice, submissionStop } from './spend-submission.policy';

describe('the line a request is attached to (US-05-04 AC-12, AC-13)', () => {
  const today = '2026-05-15';

  it('keeps a line whose window is still to come, with or without the head saying it is needed', () => {
    const line = { windowTo: '2026-06-30' };

    expect(judgePlanLineChoice({ kind: 'LINE', position: 1, stillNeeded: false }, { line, today })).toEqual({
      ok: true,
      confirmed: false,
    });
    expect(judgePlanLineChoice({ kind: 'LINE', position: 1, stillNeeded: true }, { line, today })).toEqual({
      ok: true,
      confirmed: true,
    });
  });

  it('keeps a line whose window ends today', () => {
    expect(
      judgePlanLineChoice({ kind: 'LINE', position: 1, stillNeeded: false }, { line: { windowTo: today }, today }),
    ).toMatchObject({ ok: true });
  });

  it('refuses an overdue line the head did not confirm, and keeps it when they did', () => {
    const line = { windowTo: '2026-03-31' };

    expect(judgePlanLineChoice({ kind: 'LINE', position: 5, stillNeeded: false }, { line, today })).toEqual({
      ok: false,
      reason: 'STILL_NEEDED_REQUIRED',
    });
    expect(judgePlanLineChoice({ kind: 'LINE', position: 5, stillNeeded: true }, { line, today })).toEqual({
      ok: true,
      confirmed: true,
    });
  });

  it('refuses a line that is not there, and takes outside the plan as it is', () => {
    expect(judgePlanLineChoice({ kind: 'LINE', position: 9, stillNeeded: true }, { line: null, today })).toEqual({
      ok: false,
      reason: 'LINE_NOT_FOUND',
    });
    expect(judgePlanLineChoice({ kind: 'OFF_PLAN' }, { line: null, today })).toEqual({ ok: true, confirmed: false });
  });
});

describe('sending a request on (US-06-14 AC-5)', () => {
  it('needs a line or outside the plan, and says which is missing without a figure', () => {
    expect(submissionStop({ hasPlanLine: false, offPlan: false })).toBe('PLAN_LINE_REQUIRED');
    expect(submissionStop({ hasPlanLine: true, offPlan: false })).toBeNull();
    expect(submissionStop({ hasPlanLine: false, offPlan: true })).toBeNull();
  });
});

describe('where an approved request goes (US-06-14 AC-8)', () => {
  const base = { deciderEmployeeId: 'h1', spendingApproverEmployeeId: 'c1' };

  it('is the queue of the head when the head decided the need and is not the approver', () => {
    expect(entryFor({ ...base, deciderRole: 'MANAGER' })).toBe('HEAD_QUEUE');
  });

  it('is straight to the check when the fallback approver decided it, who has no queue', () => {
    expect(entryFor({ ...base, deciderRole: 'FALLBACK_APPROVER', deciderEmployeeId: 'r0' })).toBe('DIRECT');
  });

  it('is straight to the check when the spending approver decided it, as the head or in the place of one', () => {
    expect(entryFor({ ...base, deciderRole: 'MANAGER', deciderEmployeeId: 'c1' })).toBe('DIRECT');
    expect(entryFor({ ...base, deciderRole: 'SPENDING_APPROVER', deciderEmployeeId: 'c1' })).toBe('DIRECT');
  });

  it('is the queue of the head when nobody holds the role of the approver', () => {
    expect(entryFor({ deciderRole: 'MANAGER', deciderEmployeeId: 'h1', spendingApproverEmployeeId: null })).toBe(
      'HEAD_QUEUE',
    );
  });
});

describe('the supplementary file (US-06-14 AC-13, AC-15; US-05-04 AC-16)', () => {
  const facts = {
    state: 'AWAITING_SPEND_SUBMISSION',
    priced: true,
    currentExpectedSpendOn: '2025-12-20',
    newExpectedSpendOn: '2026-01-15',
  };

  it('changes the day of a request back in the queue to another day', () => {
    expect(checkSupplement(facts)).toBeNull();
  });

  it.each(['PENDING', 'AWAITING_FINANCE_REVIEW', 'AWAITING_SPEND_DECISION', 'AWAITING_BUDGET', 'EXECUTING'])(
    'is not for a request that is %s',
    (state) => {
      expect(checkSupplement({ ...facts, state })).toBe('NOT_IN_QUEUE');
    },
  );

  it('is not for a request with no price, nor to the same day', () => {
    expect(checkSupplement({ ...facts, priced: false })).toBe('NOT_PRICED');
    expect(checkSupplement({ ...facts, newExpectedSpendOn: '2025-12-20' })).toBe('NO_CHANGE');
  });
});
