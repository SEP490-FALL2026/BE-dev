import {
  decidableVerdictOf,
  exemptionProblemOf,
  graceNotBefore,
  isLeftToExpire,
  isSelfDecided,
  lockOrderOf,
  returnOutcomeOf,
} from './decision.policy';

describe('the decision of a head on a recommendation (qd103-ghost-seat-manager-decision)', () => {
  it('AC-4, INV-09: an exemption needs a day after today and within 12 calendar months; exactly 12 months is allowed', () => {
    expect(exemptionProblemOf('2026-11-09', undefined)).toBe('REQUIRED');
    expect(exemptionProblemOf('2026-11-09', '2026-11-09')).toBe('TOO_LONG');
    expect(exemptionProblemOf('2026-11-09', '2026-11-08')).toBe('TOO_LONG');
    expect(exemptionProblemOf('2026-11-09', '2026-11-10')).toBeNull();
    expect(exemptionProblemOf('2026-11-09', '2027-11-09')).toBeNull();
    expect(exemptionProblemOf('2026-11-09', '2027-11-10')).toBe('TOO_LONG');
    expect(exemptionProblemOf('2026-11-09', '2027-12-09')).toBe('TOO_LONG');
    expect(exemptionProblemOf('2028-02-29', '2029-02-28')).toBeNull();
  });

  it('R-J06, US-10-06 AC-17, AC-18: a right ending within one calendar month is left to end; one ending later, or never, is reclaimed', () => {
    expect(isLeftToExpire('2026-12-31', '2026-12-10')).toBe(true);
    expect(isLeftToExpire('2027-01-01', '2026-12-01')).toBe(true);
    expect(isLeftToExpire('2026-12-31', '2026-10-20')).toBe(false);
    expect(isLeftToExpire(null, '2026-12-10')).toBe(false);
    expect(isLeftToExpire('2026-12-10', '2026-12-10')).toBe(true);
  });

  it('BR-MF5-04, Q-88: the first reclaim waits the grace in calendar days; after a return the promised day stands but never a day in the past', () => {
    expect(graceNotBefore({ decidedOn: '2026-11-01', graceDays: 7, previous: null })).toBe('2026-11-08');
    expect(graceNotBefore({ decidedOn: '2026-11-03', graceDays: 7, previous: '2026-11-08' })).toBe('2026-11-08');
    expect(graceNotBefore({ decidedOn: '2026-11-10', graceDays: 7, previous: '2026-11-08' })).toBe('2026-11-10');
    expect(graceNotBefore({ decidedOn: '2026-11-01', graceDays: 0, previous: null })).toBe('2026-11-01');
  });

  it('Q-94: a batch is locked once for each id, in ascending order', () => {
    expect(lockOrderOf(['c', 'a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('AC-8: only the head of the asked department decides; a paused or already decided recommendation answers 409 to the head and nothing to anybody else', () => {
    const base = { deciderDepartmentId: 'D1', callerHeadedDepartmentId: 'D1' } as const;
    expect(decidableVerdictOf({ ...base, state: 'AWAITING_DECISION' })).toBe('OK');
    expect(decidableVerdictOf({ ...base, state: 'RETURNED_TO_HEAD' })).toBe('OK');
    expect(decidableVerdictOf({ ...base, state: 'PAUSED' })).toBe('PAUSED');
    expect(decidableVerdictOf({ ...base, state: 'RECLAIM_DECIDED' })).toBe('NOT_DECIDABLE');
    expect(decidableVerdictOf({ ...base, state: 'WAITING_FOR_HEAD' })).toBe('NOT_DECIDABLE');
    expect(decidableVerdictOf({ ...base, callerHeadedDepartmentId: 'D2', state: 'PAUSED' })).toBe('NOT_DECIDER');
    expect(decidableVerdictOf({ ...base, callerHeadedDepartmentId: null, state: 'AWAITING_DECISION' })).toBe(
      'NOT_DECIDER',
    );
    expect(decidableVerdictOf({ ...base, deciderDepartmentId: null, state: 'OPEN' })).toBe('NOT_DECIDER');
  });

  it('US-10-03 AC-13: a head deciding on their own seat is marked self-decided', () => {
    expect(isSelfDecided('E1', 'E1')).toBe(true);
    expect(isSelfDecided('E1', 'E2')).toBe(false);
    expect(isSelfDecided(null, 'E2')).toBe(false);
  });
});

describe('returnOutcomeOf — M5-10 (OI-02, US-10-06 AC-10, AC-12): the IT Admin gives a reclaim back', () => {
  it('gives back a reclaim whose task was closed as failed or cancelled: the seat has no live revocation', () => {
    expect(returnOutcomeOf({ taskId: null, outcome: 'NOT_FOUND' })).toBe('CANCELLED');
  });

  it('gives back a task that goes on or was cancelled by the withdrawal; a task another IT Admin works is theirs', () => {
    expect(returnOutcomeOf({ taskId: 't', outcome: 'CONTINUES' })).toBe('CONTINUES');
    expect(returnOutcomeOf({ taskId: 't', outcome: 'CANCELLED' })).toBe('CANCELLED');
    expect(returnOutcomeOf({ taskId: 't', outcome: 'IT_ADMIN_TO_CLOSE' })).toBe('IT_ADMIN_TO_CLOSE');
  });

  it('refuses a task that ended, and a live task that carries no reason of this reclaim', () => {
    expect(returnOutcomeOf({ taskId: 't', outcome: 'ALREADY_ENDED' })).toBeNull();
    expect(returnOutcomeOf({ taskId: 't', outcome: 'NOT_FOUND' })).toBeNull();
  });
});
