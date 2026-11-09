import { deadlineOutcomeOf, lateFlagDue } from './renewal-deadline.policy';

describe('the late flag (FR-1.4, US-11-03 AC-13, AC-14, AC-20)', () => {
  const base = {
    baseDate: '2026-12-01',
    decided: true,
    decidedAfterDeadline: false,
    outcomeRecorded: false,
    alreadyFlagged: false,
  };

  it('is set from the milestone when decided and not carried out', () => {
    expect(lateFlagDue({ ...base, today: '2026-11-30' })).toBe(false);
    expect(lateFlagDue({ ...base, today: '2026-12-01' })).toBe(true);
    expect(lateFlagDue({ ...base, today: '2026-12-03' })).toBe(true);
  });

  it('is not set once carried out, once set, without a decision, or for a decision after the milestone', () => {
    expect(lateFlagDue({ ...base, today: '2026-12-01', outcomeRecorded: true })).toBe(false);
    expect(lateFlagDue({ ...base, today: '2026-12-01', alreadyFlagged: true })).toBe(false);
    expect(lateFlagDue({ ...base, today: '2026-12-01', decided: false })).toBe(false);
    expect(lateFlagDue({ ...base, today: '2026-12-06', decidedAfterDeadline: true })).toBe(false);
  });
});

describe('a milestone passed with no decision (US-11-04 AC-1 → AC-4, AC-6, AC-7, AC-9)', () => {
  const base = { baseDate: '2026-12-01', autoRenew: true, decidedOn: null, alreadyRecorded: false };

  it('is an incident when the subscription renews itself, a mark of its end otherwise, after the milestone only', () => {
    expect(deadlineOutcomeOf({ ...base, today: '2026-12-01' })).toBeNull();
    expect(deadlineOutcomeOf({ ...base, today: '2026-12-02' })).toBe('AUTO_RENEWAL_INCIDENT');
    expect(deadlineOutcomeOf({ ...base, today: '2026-12-02', autoRenew: false })).toBe('EXPIRY_MARKED');
  });

  it('is nothing when a decision was taken by the milestone, even with no outcome (AC-2)', () => {
    expect(deadlineOutcomeOf({ ...base, today: '2026-12-02', decidedOn: '2026-11-28' })).toBeNull();
    expect(deadlineOutcomeOf({ ...base, today: '2026-12-02', decidedOn: '2026-12-01' })).toBeNull();
  });

  it('still counts a decision taken after the milestone as none by it, and is written once (AC-6, AC-7)', () => {
    expect(deadlineOutcomeOf({ ...base, today: '2026-12-06', decidedOn: '2026-12-05' })).toBe('AUTO_RENEWAL_INCIDENT');
    expect(deadlineOutcomeOf({ ...base, today: '2026-12-06', alreadyRecorded: true })).toBeNull();
  });
});
