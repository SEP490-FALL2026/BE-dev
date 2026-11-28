import { ENDED_STATES, type AccessRequestState } from '../access-request/access-request.types';
import {
  MAX_TICKET_ITEMS,
  findDuplicates,
  openLimitRefusals,
  orderByPosition,
  ticketStatusOf,
} from './request-ticket.policy';

describe('request-ticket.policy', () => {
  it('defines MAX_TICKET_ITEMS as 6', () => {
    expect(MAX_TICKET_ITEMS).toBe(6);
  });

  describe('ticketStatusOf (§7.4)', () => {
    it.each(ENDED_STATES)('returns DONE when all items are in ended state %s', (state) => {
      expect(ticketStatusOf([state])).toBe('DONE');
    });

    it('returns IN_PROGRESS when any item is not in ENDED_STATES', () => {
      const states: AccessRequestState[] = ['COMPLETED', 'REJECTED', 'AWAITING_SPEND_DECISION'];

      expect(ticketStatusOf(states)).toBe('IN_PROGRESS');
    });

    it('returns DONE for an empty state list', () => {
      expect(ticketStatusOf([])).toBe('DONE');
    });
  });

  // OQ-W4-5 = A
  describe('findDuplicates (§7.2 step 3)', () => {
    it('flags a later item with the same planId as DUPLICATE_IN_TICKET pointing to the earlier position', () => {
      expect(
        findDuplicates([
          { position: 1, planId: 'plan-figma-full' },
          { position: 2, planId: 'plan-figma-full' },
        ]),
      ).toEqual([{ position: 2, duplicateOfPosition: 1 }]);
    });

    it('allows different plans of the same application including annual and monthly variants (L-1)', () => {
      expect(
        findDuplicates([
          { position: 1, planId: 'plan-figma-org-annual' },
          { position: 2, planId: 'plan-figma-org-monthly' },
        ]),
      ).toEqual([]);
    });

    it('sorts duplicate findings by position even when input items are unordered', () => {
      expect(
        findDuplicates([
          { position: 3, planId: 'plan-a' },
          { position: 1, planId: 'plan-a' },
          { position: 2, planId: 'plan-a' },
        ]),
      ).toEqual([
        { position: 2, duplicateOfPosition: 1 },
        { position: 3, duplicateOfPosition: 1 },
      ]);
    });
  });

  describe('openLimitRefusals (§7.2 step 3, GH-2)', () => {
    const weeklyLimit = 10;

    it('refuses item 2 when sentThisWeek is 9 and two valid items are submitted (§7.2 H)', () => {
      expect(
        openLimitRefusals({
          sentThisWeek: 9,
          weeklyLimit,
          items: [
            { position: 1, refused: false, exempt: false },
            { position: 2, refused: false, exempt: false },
          ],
        }),
      ).toEqual([2]);
    });

    it('does not count or refuse an item already refused earlier when sentThisWeek is 8 (§7.2 G)', () => {
      expect(
        openLimitRefusals({
          sentThisWeek: 8,
          weeklyLimit,
          items: [
            { position: 1, refused: false, exempt: false },
            { position: 2, refused: false, exempt: false },
            { position: 3, refused: true, exempt: false },
          ],
        }),
      ).toEqual([]);

      expect(
        openLimitRefusals({
          sentThisWeek: 8,
          weeklyLimit,
          items: [
            { position: 1, refused: true, exempt: false },
            { position: 2, refused: false, exempt: false },
            { position: 3, refused: false, exempt: false },
          ],
        }),
      ).toEqual([]);
    });

    it('refuses item 1 when sentThisWeek has already reached weeklyLimit', () => {
      expect(
        openLimitRefusals({
          sentThisWeek: 10,
          weeklyLimit,
          items: [{ position: 1, refused: false, exempt: false }],
        }),
      ).toEqual([1]);
    });

    it('does not refuse an exempt item even when sentThisWeek is at weeklyLimit', () => {
      expect(
        openLimitRefusals({
          sentThisWeek: 10,
          weeklyLimit,
          items: [{ position: 1, refused: false, exempt: true }],
        }),
      ).toEqual([]);
    });

    it('skips exempt item in count and refuses only item 3 when sentThisWeek is 9 with [exempt, ok, ok]', () => {
      expect(
        openLimitRefusals({
          sentThisWeek: 9,
          weeklyLimit,
          items: [
            { position: 1, refused: false, exempt: true },
            { position: 2, refused: false, exempt: false },
            { position: 3, refused: false, exempt: false },
          ],
        }),
      ).toEqual([3]);
    });
  });

  describe('orderByPosition', () => {
    it('returns a new array ordered by position without mutating the input', () => {
      const original = [
        { position: 3, id: 'c' },
        { position: 1, id: 'a' },
        { position: 2, id: 'b' },
      ];
      const snapshot = [...original];

      const ordered = orderByPosition(original);

      expect(ordered).toEqual([
        { position: 1, id: 'a' },
        { position: 2, id: 'b' },
        { position: 3, id: 'c' },
      ]);
      expect(original).toEqual(snapshot);
      expect(ordered).not.toBe(original);
    });
  });
});
