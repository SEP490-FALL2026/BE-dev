import {
  countedTotalOf,
  duplicateRankPositions,
  overCeilingNoteMissing,
  overCeilingParts,
  priceRisesTooMuch,
  zbbMissingPositions,
  type RuledLine,
} from './proposal-line-rules.policy';

const zbb = { purpose: 'p', alternatives: 'a', consequenceIfNot: 'c', usageIndicator: 'u' };
const line = (position: number, patch: Partial<RuledLine> = {}): RuledLine => ({
  position,
  lineType: 'RENEW',
  priorityRank: position,
  amountMinor: 10n,
  seats: null,
  planId: null,
  zbb: null,
  note: null,
  ...patch,
});
const context = {
  kpi3ByPlan: new Map<string, number>(),
  kpi3BelowPercent: 70,
  priceIncreasePercent: 10,
  monthlyPriceByPlan: new Map([['plan', 100n]]),
};

describe('priority ranks', () => {
  it('names every position that shares a rank, and none when the ranks are different', () => {
    expect(duplicateRankPositions([line(1, { priorityRank: 1 }), line(2, { priorityRank: 2 })])).toEqual([]);
    expect(
      duplicateRankPositions([
        line(1, { priorityRank: 2 }),
        line(2, { priorityRank: 1 }),
        line(3, { priorityRank: 2 }),
      ]),
    ).toEqual([1, 3]);
  });
});

describe('when a zero-based-budget explanation is required (QĐ-94l)', () => {
  it('requires it of a NEW line, and of no other kind when nothing else applies', () => {
    const lines = [line(1, { lineType: 'NEW' }), line(2), line(3, { lineType: 'CANCEL' })];

    expect(zbbMissingPositions(lines, context)).toEqual([1]);
    expect(zbbMissingPositions([line(1, { lineType: 'NEW', zbb })], context)).toEqual([]);
  });

  it('BR-MF4-02: requires it of a RENEW or CHANGE line whose plan has a usage below the threshold; not when it is unknown or at it', () => {
    const lines = [line(1, { planId: 'plan' }), line(2, { lineType: 'CHANGE', planId: 'plan' })];
    const usage = (percent: number) => ({ ...context, kpi3ByPlan: new Map([['plan', percent]]) });

    expect(zbbMissingPositions(lines, usage(65))).toEqual([1, 2]);
    expect(zbbMissingPositions(lines, usage(70))).toEqual([]);
    expect(zbbMissingPositions(lines, context)).toEqual([]);
  });

  it('QĐ-109d: a NEW or CANCEL line is never asked for KPI-3 (a NEW line is asked anyway), and usage is the one of the plan of the line', () => {
    const low = { ...context, kpi3ByPlan: new Map([['plan', 40]]) };
    const lines = [
      line(1, { lineType: 'NEW', zbb, planId: 'plan' }),
      line(2, { lineType: 'CANCEL', planId: 'plan' }),
      line(3, { planId: 'other' }),
      line(4, { planId: null }),
    ];

    expect(zbbMissingPositions(lines, low)).toEqual([]);
  });

  describe('a unit price that rises over the threshold', () => {
    // 10 seats at 100 a month for 12 months: 12 000 a year at the price of now.
    const at = (amountMinor: bigint, patch: Partial<RuledLine> = {}) =>
      line(1, { planId: 'plan', seats: 10, amountMinor, ...patch });

    it('is 11 % over: required; exactly 10 % over: not', () => {
      expect(zbbMissingPositions([at(13_320n)], context)).toEqual([1]);
      expect(zbbMissingPositions([at(13_200n)], context)).toEqual([]);
    });

    it('is not asked of a CANCEL line', () => {
      expect(zbbMissingPositions([at(13_320n, { lineType: 'CANCEL' })], context)).toEqual([]);
    });

    it('is not judged without seats, with zero seats, without a plan, or when the plan has no monthly price (a one-time purchase)', () => {
      expect(priceRisesTooMuch(at(99_999n, { seats: null }), context)).toBe(false);
      expect(priceRisesTooMuch(at(99_999n, { seats: 0 }), context)).toBe(false);
      expect(priceRisesTooMuch(at(99_999n, { planId: null }), context)).toBe(false);
      expect(priceRisesTooMuch(at(99_999n), { ...context, monthlyPriceByPlan: new Map() })).toBe(false);
    });
  });
});

describe('what a proposal is worth (QĐ-109c)', () => {
  it('BR-MF4-02: a CANCEL line of 50 million is shown and not added', () => {
    const lines = [line(1, { amountMinor: 100n }), line(2, { lineType: 'CANCEL', amountMinor: 50_000_000n })];

    expect(countedTotalOf(lines)).toBe(100n);
  });
});

describe('the part of a line that goes over the ceiling of the department (AC-20)', () => {
  const lines = [line(1, { amountMinor: 50n }), line(2, { amountMinor: 70n }), line(3, { amountMinor: 40n })];

  it('flags the line that carries the total over, with what goes over, and every line after it with its whole amount', () => {
    expect([...overCeilingParts(lines, 90n)]).toEqual([
      [2, 30n],
      [3, 40n],
    ]);
  });

  it('takes the lines by rank, whatever order they were sent in', () => {
    const sent = [
      line(1, { amountMinor: 40n, priorityRank: 3 }),
      line(2, { amountMinor: 50n, priorityRank: 1 }),
      line(3, { amountMinor: 70n, priorityRank: 2 }),
    ];

    expect([...overCeilingParts(sent, 90n)].sort()).toEqual([
      [1, 40n],
      [3, 30n],
    ]);
  });

  it('QĐ-109c: a CANCEL line is neither added nor flagged, and leaves the flag of the others where it was', () => {
    const withCancel = [
      line(1, { amountMinor: 50n }),
      line(2, { lineType: 'CANCEL', amountMinor: 50_000_000n }),
      line(3, { amountMinor: 70n }),
    ];

    expect([...overCeilingParts(withCancel, 90n)]).toEqual([[3, 30n]]);
    expect(overCeilingParts([line(1, { lineType: 'CANCEL', amountMinor: 999n })], 10n).size).toBe(0);
  });

  it('flags nothing when the lines add up to the ceiling or less, or the department has none', () => {
    expect(overCeilingParts(lines, 160n).size).toBe(0);
    expect(overCeilingParts(lines, null).size).toBe(0);
  });

  it('asks a note of each flagged line that has none', () => {
    const flagged = overCeilingParts(lines, 90n);

    expect(overCeilingNoteMissing([line(1), line(2, { note: ' ' }), line(3, { note: 'why' })], flagged)).toEqual([2]);
    expect(overCeilingNoteMissing([line(1), line(2, { note: 'a' }), line(3, { note: 'b' })], flagged)).toEqual([]);
  });
});
