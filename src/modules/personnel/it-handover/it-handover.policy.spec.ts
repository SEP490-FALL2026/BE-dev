import {
  handoverRefusal,
  handoverState,
  milestoneDay,
  milestoneReached,
  pendingNoticeOwed,
} from './it-handover.policy';

describe('it-handover.policy (QĐ-110j, QĐ-111g, R-8, R-26: one hand-over of an IT Admin who leaves, no blocker)', () => {
  describe('milestoneDay and milestoneReached: the block moment of a departure, the day a transfer takes effect', () => {
    it('is the first day a departure refuses the person: the block, or the day they left, whichever came first', () => {
      expect(
        milestoneDay({ kind: 'OFFBOARDING_CASE', blockedFrom: '2026-10-01', leftOn: null, effectiveOn: null }),
      ).toBe('2026-10-01');
      expect(
        milestoneDay({ kind: 'OFFBOARDING_CASE', blockedFrom: '2026-10-05', leftOn: '2026-10-02', effectiveOn: null }),
      ).toBe('2026-10-02');
      expect(milestoneDay({ kind: 'OFFBOARDING_CASE', blockedFrom: null, leftOn: null, effectiveOn: null })).toBeNull();
    });

    it('is the day the transfer takes effect', () => {
      expect(
        milestoneDay({ kind: 'DEPARTMENT_TRANSFER', blockedFrom: null, leftOn: null, effectiveOn: '2026-11-16' }),
      ).toBe('2026-11-16');
    });

    it.each([
      ['2026-10-01', '2026-09-30', false],
      ['2026-10-01', '2026-10-01', true],
      ['2026-10-01', '2026-10-02', true],
      [null, '2026-10-02', false],
    ])('a milestone of %s on %s is reached: %s', (day, today, reached) => {
      expect(milestoneReached(day, today)).toBe(reached);
    });
  });

  describe('handoverRefusal: the person leaving hands over before the milestone, any IT Admin from it, nothing to do refuses', () => {
    const base = {
      cancelled: false,
      milestoneReached: true,
      actorEmployeeId: 'it-other',
      leavingEmployeeId: 'it-leaving',
      remaining: 3,
    };

    it('lets any IT Admin hand over from the milestone', () => {
      expect(handoverRefusal(base)).toBeNull();
    });

    it('lets the person who leaves hand over before the milestone, and nobody else', () => {
      const before = { ...base, milestoneReached: false };

      expect(handoverRefusal({ ...before, actorEmployeeId: 'it-leaving' })).toBeNull();
      expect(handoverRefusal(before)).toBe('NOT_YET_YOURS');
    });

    it('refuses a file that was cancelled, whoever asks', () => {
      expect(handoverRefusal({ ...base, cancelled: true })).toBe('SOURCE_CANCELLED');
      expect(handoverRefusal({ ...base, cancelled: true, milestoneReached: false })).toBe('SOURCE_CANCELLED');
    });

    it('refuses when the person answers for nothing now, even for the one who leaves', () => {
      expect(handoverRefusal({ ...base, remaining: 0 })).toBe('NOTHING_TO_HAND_OVER');
      expect(handoverRefusal({ ...base, remaining: 0, milestoneReached: false, actorEmployeeId: 'it-leaving' })).toBe(
        'NOTHING_TO_HAND_OVER',
      );
    });

    it('judges the file, then the milestone, then what is left', () => {
      expect(handoverRefusal({ ...base, cancelled: true, remaining: 0, milestoneReached: false })).toBe(
        'SOURCE_CANCELLED',
      );
      expect(handoverRefusal({ ...base, remaining: 0, milestoneReached: false })).toBe('NOT_YET_YOURS');
    });
  });

  describe('handoverState: pending while the person still answers for something', () => {
    it.each([
      [3, 'PENDING'],
      [1, 'PENDING'],
      [0, 'DONE'],
    ])('with %s left it is %s, whoever moved the rest', (remaining, expected) => {
      expect(handoverState({ remaining })).toBe(expected);
    });
  });

  describe('pendingNoticeOwed: at the milestone, the IT Admins are told once when something is left', () => {
    it('is owed only when the milestone is reached and the person still answers for something', () => {
      expect(pendingNoticeOwed({ milestoneReached: true, cancelled: false, remaining: 2 })).toBe(true);
      expect(pendingNoticeOwed({ milestoneReached: false, cancelled: false, remaining: 2 })).toBe(false);
      expect(pendingNoticeOwed({ milestoneReached: true, cancelled: false, remaining: 0 })).toBe(false);
      expect(pendingNoticeOwed({ milestoneReached: true, cancelled: true, remaining: 2 })).toBe(false);
    });
  });
});
