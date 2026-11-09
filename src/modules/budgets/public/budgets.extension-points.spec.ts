import { PendingSpendContributions } from './budgets.extension-points';

describe('BR-MF4-05 pending spend contributions', () => {
  const pairs = [
    { costCenterId: 'a', year: 2026 },
    { costCenterId: 'b', year: 2027 },
  ];

  it('answers zero without a registered requests graph, including an empty batch', async () => {
    const contributions = new PendingSpendContributions();
    expect(await contributions.total('a', 2026)).toBe(0n);
    expect(await contributions.totals(pairs)).toEqual(new Map());
    expect(await contributions.totals([])).toEqual(new Map());
  });

  it('calls each batch provider once and adds its amounts without mixing years or centers', async () => {
    const contributions = new PendingSpendContributions();
    const first = {
      pendingOf: jest.fn(),
      pendingMany: jest.fn().mockResolvedValue(
        new Map([
          ['a:2026', 20n],
          ['b:2027', 5n],
        ]),
      ),
    };
    const second = { pendingOf: jest.fn(), pendingMany: jest.fn().mockResolvedValue(new Map([['a:2026', 3n]])) };
    contributions.add('first', first);
    contributions.add('second', second);
    expect(await contributions.totals(pairs)).toEqual(
      new Map([
        ['a:2026', 23n],
        ['b:2027', 5n],
      ]),
    );
    expect(first.pendingMany).toHaveBeenCalledTimes(1);
    expect(second.pendingMany).toHaveBeenCalledWith(pairs, undefined);
    expect(first.pendingOf).not.toHaveBeenCalled();
  });
});
