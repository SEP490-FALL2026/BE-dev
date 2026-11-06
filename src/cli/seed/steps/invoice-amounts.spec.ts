import { percentOf } from './invoice-amounts';

describe('percentOf', () => {
  it.each([
    ['200000', 50, '100000'],
    ['375000', 40, '150000'],
    ['150000', 10, '15000'],
    ['150000', 5, '7500'],
    ['200000', 110, '220000'],
    ['200000', 100, '200000'],
    ['0', 50, '0'],
  ])('is %s at %i percent: %s', (amount, percent, expected) => {
    expect(percentOf(amount, percent)).toBe(expected);
  });

  it('rounds down to the smallest unit and does not lose the decimals the amount is written with', () => {
    expect(percentOf('10', 33)).toBe('3');
    expect(percentOf('12.50', 50)).toBe('6.25');
    expect(percentOf('0.10', 50)).toBe('0.05');
    expect(percentOf('0.01', 50)).toBe('0.00');
    expect(percentOf('99999999999999.99', 100)).toBe('99999999999999.99');
  });

  it('turns away a share that is not a whole percent, or is negative', () => {
    expect(() => percentOf('100', 12.5)).toThrow();
    expect(() => percentOf('100', -1)).toThrow();
  });
});
