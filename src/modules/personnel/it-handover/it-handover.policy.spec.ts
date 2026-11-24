import {
  handoverRefusal,
  handoverState,
  milestoneDay,
  milestoneReached,
  pendingNoticeOwed,
  plansLeftWithoutAdmin,
} from './it-handover.policy';

describe('it-handover.policy (one hand-over of an IT Admin who leaves, no blocker)', () => {
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

  describe('handoverRefusal: Super Admin may hand over regardless of milestone; cancelled and nothing left refuse', () => {
    const base = {
      cancelled: false,
      milestoneReached: true,
      actorEmployeeId: 'super-admin',
      leavingEmployeeId: 'it-leaving',
      remaining: 3,
    };

    it('allows handover after milestone', () => {
      expect(handoverRefusal(base)).toBeNull();
    });

    it('allows handover before milestone', () => {
      expect(handoverRefusal({ ...base, milestoneReached: false })).toBeNull();
    });

    it('refuses a file that was cancelled, regardless of milestone', () => {
      expect(handoverRefusal({ ...base, cancelled: true })).toBe('SOURCE_CANCELLED');
      expect(handoverRefusal({ ...base, cancelled: true, milestoneReached: false })).toBe('SOURCE_CANCELLED');
    });

    it('refuses when the person answers for nothing now', () => {
      expect(handoverRefusal({ ...base, remaining: 0 })).toBe('NOTHING_TO_HAND_OVER');
      expect(handoverRefusal({ ...base, remaining: 0, milestoneReached: false })).toBe('NOTHING_TO_HAND_OVER');
    });

    it('judges cancelled before nothing left', () => {
      expect(handoverRefusal({ ...base, cancelled: true, remaining: 0, milestoneReached: false })).toBe(
        'SOURCE_CANCELLED',
      );
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

  describe('plansLeftWithoutAdmin: the plans nobody else who works administers', () => {
    it('keeps only the roles with no other admin working: one left is a flag, not work', () => {
      const roles = [
        { planId: 'figma', othersWorking: 1 },
        { planId: 'miro', othersWorking: 0 },
        { planId: 'canva', othersWorking: 2 },
      ];

      expect(plansLeftWithoutAdmin(roles)).toEqual([{ planId: 'miro', othersWorking: 0 }]);
      expect(plansLeftWithoutAdmin([])).toEqual([]);
    });
  });
});
