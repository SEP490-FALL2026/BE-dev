import { formatAmount, parseDecimalAmount } from './money';
import { MoneyMalformedError, MoneyOutOfRangeError, MoneyScaleExceededError } from './money.errors';

describe('parseDecimalAmount', () => {
  it('turns a major-unit string into minor units, padding missing decimals (M11)', () => {
    expect(parseDecimalAmount('1200', 2)).toBe(120000n);
    expect(parseDecimalAmount('1200.5', 2)).toBe(120050n);
    expect(parseDecimalAmount('1200.00', 2)).toBe(120000n);
    expect(parseDecimalAmount('0.01', 2)).toBe(1n);
  });

  it('reads a currency with no minor digits as whole units', () => {
    expect(parseDecimalAmount('30000000', 0)).toBe(30000000n);
  });

  it('keeps the sign and treats minus zero as zero', () => {
    expect(parseDecimalAmount('-0.02', 2)).toBe(-2n);
    expect(parseDecimalAmount('-0.00', 2)).toBe(0n);
  });

  it('refuses more decimals than the currency has instead of rounding (M10)', () => {
    expect(() => parseDecimalAmount('12.345', 2)).toThrow(MoneyScaleExceededError);
    expect(() => parseDecimalAmount('12.340', 2)).toThrow(MoneyScaleExceededError);
    expect(() => parseDecimalAmount('1200.5', 0)).toThrow(MoneyScaleExceededError);
  });

  it.each(['1.2e3', '1,200.00', '+5', '', ' 5', '5 ', '.5', '5.', '1_000', '0x10', 'NaN', '१२३'])(
    'refuses the shape %j (M12)',
    (input) => {
      expect(() => parseDecimalAmount(input, 2)).toThrow(MoneyMalformedError);
    },
  );

  it('refuses more than sixteen integer digits as malformed', () => {
    expect(() => parseDecimalAmount('12345678901234567', 2)).toThrow(MoneyMalformedError);
  });

  it('accepts exactly 10^15 minor units and refuses one more (M14)', () => {
    expect(parseDecimalAmount('10000000000000.00', 2)).toBe(10n ** 15n);
    expect(() => parseDecimalAmount('10000000000000.01', 2)).toThrow(MoneyOutOfRangeError);
    expect(parseDecimalAmount('-10000000000000.00', 2)).toBe(-(10n ** 15n));
    expect(() => parseDecimalAmount('-10000000000000.01', 2)).toThrow(MoneyOutOfRangeError);
  });
});

describe('formatAmount', () => {
  it('always writes the currency minor digits, without exponent or separators (M1)', () => {
    expect(formatAmount(120000n, 2)).toBe('1200.00');
    expect(formatAmount(1n, 2)).toBe('0.01');
    expect(formatAmount(0n, 2)).toBe('0.00');
    expect(formatAmount(30000000n, 0)).toBe('30000000');
    expect(formatAmount(10n ** 15n, 2)).toBe('10000000000000.00');
  });

  it('writes a negative amount with one leading minus', () => {
    expect(formatAmount(-2n, 2)).toBe('-0.02');
    expect(formatAmount(-120050n, 2)).toBe('-1200.50');
  });

  it('round-trips what parseDecimalAmount accepts', () => {
    for (const text of ['0.00', '0.01', '99.99', '1200.00', '-5.50']) {
      expect(formatAmount(parseDecimalAmount(text, 2), 2)).toBe(text);
    }
  });
});
