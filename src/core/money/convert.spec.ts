import { convertToReporting } from './convert';
import { MoneyOutOfRangeError, RateOutOfRangeError } from './money.errors';
import { parseDecimalAmount } from './money';
import { parseRate } from './rate';

const usd = (text: string): bigint => parseDecimalAmount(text, 2);

/** USD (2 minor digits) to VND (0), the case the stories use. */
const toVnd = (amount: string, rate: string): bigint => convertToReporting(usd(amount), parseRate(rate), 2, 0);

describe('convertToReporting (ADR-0007 worked examples)', () => {
  it('M1: 1,200.00 USD at 25,000 VND/USD is 30,000,000 VND', () => {
    expect(toVnd('1200.00', '25000')).toBe(30000000n);
  });

  it('M3: 19.99 USD x 25,431.5 is exactly 508375.685 and rounds to 508376 (nearest, not a tie)', () => {
    expect(toVnd('19.99', '25431.5')).toBe(508376n);
  });

  it('M4: 0.01 USD x 25,449.99 is 254.4999 and rounds to 254, not away from zero', () => {
    expect(toVnd('0.01', '25449.99')).toBe(254n);
    expect(toVnd('-0.01', '25449.99')).toBe(-254n);
  });

  it('M5/M6: an exact half moves away from zero in both directions', () => {
    expect(toVnd('0.02', '25425')).toBe(509n);
    expect(toVnd('-0.02', '25425')).toBe(-509n);
  });

  it('M8: a large amount at a ten-decimal rate keeps every digit', () => {
    expect(toVnd('9999999999.99', '26000.1234567891')).toBe(260001234567631n);
  });

  it('M9: a tie at large magnitude still moves away from zero', () => {
    expect(toVnd('9999999999.99', '50')).toBe(500000000000n);
  });

  it('converts a currency with no minor digits to one with two', () => {
    // 250,000 VND at 0.0000384615 USD per VND = 9.615375 USD, i.e. 962 cents (nearest).
    expect(convertToReporting(250000n, parseRate('0.0000384615'), 0, 2)).toBe(962n);
  });

  it('keeps the minor digits unchanged when both currencies have the same count', () => {
    expect(convertToReporting(1999n, parseRate('1.5'), 2, 2)).toBe(2999n); // 29.985 -> 2998.5 -> 2999
  });

  it('M14: refuses a result above 10^18 minor units and accepts one just below', () => {
    expect(() => convertToReporting(10n ** 15n, parseRate('9999999999'), 0, 0)).toThrow(MoneyOutOfRangeError);
    expect(convertToReporting(10n ** 8n, parseRate('9999999999'), 0, 0)).toBe(9999999999n * 10n ** 8n);
  });

  it('refuses an amount above 10^15 minor units', () => {
    expect(() => convertToReporting(10n ** 15n + 1n, parseRate('1'), 2, 2)).toThrow(MoneyOutOfRangeError);
  });
});

/** An independent reading of the same rule: exact rational, magnitude rounded half up (so half away from zero). */
function reference(amountMinor: bigint, rateScaled: bigint, from: number, to: number): bigint {
  const numerator = amountMinor * rateScaled * 10n ** BigInt(to);
  const denominator = 10n ** 10n * 10n ** BigInt(from);
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (2n * magnitude + denominator) / (2n * denominator);

  return numerator < 0n ? -rounded : rounded;
}

/** mulberry32: a tiny seeded generator so the property test is the same on every run. */
function seeded(seed: number): () => number {
  let state = seed;

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('convertToReporting (M18 property)', () => {
  it('equals the exact-rational reference for 10,000 seeded amounts and rates', () => {
    const next = seeded(20261020);
    const big = (digits: number): bigint => {
      let value = 0n;
      for (let i = 0; i < digits; i++) value = value * 10n + BigInt(Math.floor(next() * 10));

      return value;
    };
    let compared = 0;

    for (let i = 0; i < 10000; i++) {
      const magnitude = big(1 + Math.floor(next() * 15)); // up to 10^15 - 1
      const amountMinor = next() < 0.3 ? -magnitude : magnitude;
      const rateScaled = big(1 + Math.floor(next() * 20)) + 1n; // 1 .. < 10^20
      const from = Math.floor(next() * 4);
      const to = Math.floor(next() * 4);
      if (rateScaled >= 10n ** 20n) continue;

      const exact = reference(amountMinor, rateScaled, from, to);
      if (exact > 10n ** 18n || exact < -(10n ** 18n)) {
        expect(() => convertToReporting(amountMinor, rateScaled, from, to)).toThrow(MoneyOutOfRangeError);
      } else {
        expect(convertToReporting(amountMinor, rateScaled, from, to)).toBe(exact);
        compared++;
      }
    }

    expect(compared).toBeGreaterThan(1000);
  });
});

describe('convertToReporting (arguments that were never validated)', () => {
  it.each([
    ['a rate of zero', 0n],
    ['a negative rate', -1n],
    ['a rate of 10^10 or more', 10n ** 20n],
  ])('refuses %s instead of converting silently', (_name, rate) => {
    expect(() => convertToReporting(100n, rate, 2, 0)).toThrow(RateOutOfRangeError);
  });

  it('keeps the largest rate that can be recorded convertible', () => {
    expect(convertToReporting(1n, 10n ** 20n - 1n, 0, 0)).toBe(10n ** 10n);
  });
});
