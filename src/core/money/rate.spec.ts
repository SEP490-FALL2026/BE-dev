import { MoneyOutOfRangeError } from './money.errors';
import { formatRate, parseRate } from './rate';
import { RateMalformedError, RateOutOfRangeError, RateScaleExceededError } from './money.errors';

describe('parseRate', () => {
  it('scales a decimal string by 10^10', () => {
    expect(parseRate('25000')).toBe(250000000000000n);
    expect(parseRate('25431.5')).toBe(254315000000000n);
    expect(parseRate('0.0000384615')).toBe(384615n);
    expect(parseRate('1')).toBe(10n ** 10n);
  });

  it('accepts ten decimals and refuses an eleventh instead of rounding (M15)', () => {
    expect(parseRate('26000.1234567891')).toBe(260001234567891n);
    expect(() => parseRate('25000.12345678901')).toThrow(RateScaleExceededError);
  });

  it('refuses zero, negatives and 10^10 or more (M15)', () => {
    expect(() => parseRate('0')).toThrow(RateOutOfRangeError);
    expect(() => parseRate('0.0000000000')).toThrow(RateOutOfRangeError);
    expect(() => parseRate('-1')).toThrow(RateOutOfRangeError);
    expect(() => parseRate('10000000000')).toThrow(RateOutOfRangeError);
    expect(parseRate('9999999999.9999999999')).toBe(10n ** 20n - 1n);
  });

  it.each(['1e3', '1,5', '+2', '', ' 1', '.5', '5.', 'abc'])('refuses the shape %j', (input) => {
    expect(() => parseRate(input)).toThrow(RateMalformedError);
  });

  it('keeps the money error type separate from the rate error types', () => {
    expect(new RateOutOfRangeError()).not.toBeInstanceOf(MoneyOutOfRangeError);
  });
});

describe('formatRate', () => {
  it('writes a plain decimal string with no exponent and no trailing zeros', () => {
    expect(formatRate(250000000000000n)).toBe('25000');
    expect(formatRate(254315000000000n)).toBe('25431.5');
    expect(formatRate(384615n)).toBe('0.0000384615');
    expect(formatRate(1n)).toBe('0.0000000001');
  });

  it('round-trips what parseRate accepts', () => {
    for (const text of ['1', '25000', '25431.5', '0.0000384615', '9999999999.9999999999']) {
      expect(formatRate(parseRate(text))).toBe(text);
    }
  });
});
