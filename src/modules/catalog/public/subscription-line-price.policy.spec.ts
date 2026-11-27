import { servingLineOf, servingMonthlyPriceMinor, type PricedLine } from './subscription-line-price.policy';

const line = (over: Partial<PricedLine> = {}): PricedLine => ({
  planId: 'standard',
  monthlyUnitPriceMinor: 500_000n,
  closedReason: null,
  createdAt: new Date('2027-01-01T00:00:00Z'),
  ...over,
});

describe('servingMonthlyPriceMinor', () => {
  const standard = line();
  const premium = line({ planId: 'premium', monthlyUnitPriceMinor: 800_000n });

  it.each([
    {
      name: 'the period has no line: the column of the period prices the seat',
      lines: [],
      plan: 'standard',
      expected: 1_000_000n,
    },
    {
      name: 'the seat is of the first plan: its line',
      lines: [standard, premium],
      plan: 'standard',
      expected: 500_000n,
    },
    {
      name: 'the seat is of the second plan: its line, not the column and not the first line',
      lines: [standard, premium],
      plan: 'premium',
      expected: 800_000n,
    },
    {
      name: 'a plan with no line on a period with lines has no price',
      lines: [standard],
      plan: 'premium',
      expected: null,
    },
    {
      name: 'only a line taken away: it prices nothing and the column answers as for a period with no line',
      lines: [line({ closedReason: 'REMOVED' })],
      plan: 'standard',
      expected: 1_000_000n,
    },
    {
      name: 'a live line wins over a closed one of the same plan',
      lines: [line({ closedReason: 'RENEWED', monthlyUnitPriceMinor: 400_000n }), standard],
      plan: 'standard',
      expected: 500_000n,
    },
    {
      name: 'with no live line the one closed last prices the seat',
      lines: [
        line({ closedReason: 'RENEWED', monthlyUnitPriceMinor: 400_000n, createdAt: new Date('2026-01-01T00:00:00Z') }),
        line({ closedReason: 'ENDED', monthlyUnitPriceMinor: 450_000n, createdAt: new Date('2026-06-01T00:00:00Z') }),
      ],
      plan: 'standard',
      expected: 450_000n,
    },
    {
      name: 'a free line (price 0) is a price, not a missing one',
      lines: [line({ monthlyUnitPriceMinor: 0n })],
      plan: 'standard',
      expected: 0n,
    },
  ])('$name', ({ lines, plan, expected }) => {
    expect(servingMonthlyPriceMinor(lines, plan, 1_000_000n)).toBe(expected);
  });

  it('keeps a null column as no price for a period with no line', () => {
    expect(servingMonthlyPriceMinor([], 'standard', null)).toBeNull();
  });
});

describe('servingLineOf', () => {
  it('is the live line of the plan, then the one closed last, and never a line taken away', () => {
    const live = line({ closedReason: null, createdAt: new Date('2027-02-01T00:00:00Z') });
    const closedLast = line({ closedReason: 'ENDED', createdAt: new Date('2026-06-01T00:00:00Z') });
    const closedFirst = line({ closedReason: 'RENEWED', createdAt: new Date('2026-01-01T00:00:00Z') });
    const removed = line({ closedReason: 'REMOVED', createdAt: new Date('2027-03-01T00:00:00Z') });

    expect(servingLineOf([closedFirst, closedLast, live, removed], 'standard')).toBe(live);
    expect(servingLineOf([closedFirst, closedLast, removed], 'standard')).toBe(closedLast);
    expect(servingLineOf([removed], 'standard')).toBeNull();
    expect(servingLineOf([live], 'premium')).toBeNull();
  });
});
