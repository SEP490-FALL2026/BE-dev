import {
  decisionDueOn,
  headWatchOf,
  isoWeekKeyOf,
  isRoutedTier,
  isTransferOver,
  queueStateOf,
  resumeStepOf,
} from './decision-routing.policy';

describe('the routing of a recommendation to the head of the department (qd103-ghost-seat-manager-decision)', () => {
  it('Q-96: names the ISO week of a day, so two runs of one week make one notice', () => {
    expect(isoWeekKeyOf('2026-11-09')).toBe('2026-W46');
    expect(isoWeekKeyOf('2026-11-15')).toBe('2026-W46');
    expect(isoWeekKeyOf('2026-11-16')).toBe('2026-W47');
    expect(isoWeekKeyOf('2027-01-01')).toBe('2026-W53');
    expect(isoWeekKeyOf('2026-12-31')).toBe('2026-W53');
  });

  it('DA6-20: only the review and action tiers go to a head; MONITOR stays with the IT Admin', () => {
    expect([null, 'MONITOR', 'REVIEW', 'ACTION'].map((tier) => isRoutedTier(tier as never))).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it('US-10-06 AC-16: the due day is the fifth working day after the day it entered the queue, skipping the weekend and the holidays', () => {
    expect(decisionDueOn('2026-11-09', 5, new Set())).toBe('2026-11-16');
    expect(decisionDueOn('2026-11-12', 5, new Set())).toBe('2026-11-19');
    expect(decisionDueOn('2026-11-09', 5, new Set(['2026-11-11']))).toBe('2026-11-17');
  });

  it('US-10-06 AC-9: with no head the recommendation waits; with the return of the IT Admin it goes back to the head as returned', () => {
    expect(queueStateOf(true, false)).toBe('AWAITING_DECISION');
    expect(queueStateOf(true, true)).toBe('RETURNED_TO_HEAD');
    expect(queueStateOf(false, false)).toBe('WAITING_FOR_HEAD');
  });

  it('DA6-21: a department that lost its head makes the queue wait; a head again hands it back as it was, never resetting the due day', () => {
    expect(headWatchOf({ state: 'AWAITING_DECISION', hasHead: false, returnCount: 0 })).toEqual({ kind: 'WAIT' });
    expect(headWatchOf({ state: 'RETURNED_TO_HEAD', hasHead: false, returnCount: 1 })).toEqual({ kind: 'WAIT' });
    expect(headWatchOf({ state: 'WAITING_FOR_HEAD', hasHead: true, returnCount: 0 })).toEqual({
      kind: 'ASSIGN',
      to: 'AWAITING_DECISION',
    });
    expect(headWatchOf({ state: 'WAITING_FOR_HEAD', hasHead: true, returnCount: 1 })).toEqual({
      kind: 'ASSIGN',
      to: 'RETURNED_TO_HEAD',
    });
    expect(headWatchOf({ state: 'AWAITING_DECISION', hasHead: true, returnCount: 0 })).toEqual({ kind: 'KEEP' });
    expect(headWatchOf({ state: 'WAITING_FOR_HEAD', hasHead: false, returnCount: 0 })).toEqual({ kind: 'KEEP' });
  });

  it('QĐ-90c: a transfer still on keeps it paused; over, it ends with the seat, goes to the queue (review, action) or back to open (MONITOR)', () => {
    const over = { transferOver: true, seatStillOpen: true };
    expect(resumeStepOf({ transferOver: false, seatStillOpen: true, tier: 'ACTION' })).toEqual({ kind: 'STAY' });
    expect(resumeStepOf({ ...over, seatStillOpen: false, tier: 'ACTION' })).toEqual({ kind: 'SEAT_REVOKED' });
    expect(resumeStepOf({ ...over, tier: 'REVIEW' })).toEqual({ kind: 'TO_QUEUE' });
    expect(resumeStepOf({ ...over, tier: 'MONITOR' })).toEqual({ kind: 'TO_OPEN' });
  });

  it('a transfer is over when it is cancelled or closed', () => {
    expect(isTransferOver({ status: 'CANCELLED', closedAt: null })).toBe(true);
    expect(isTransferOver({ status: 'EFFECTIVE', closedAt: new Date() })).toBe(true);
    expect(isTransferOver({ status: 'EFFECTIVE', closedAt: null })).toBe(false);
  });
});
