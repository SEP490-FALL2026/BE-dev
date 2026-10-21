import { MAX_AMOUNT_MINOR } from './money';
import { MoneyOutOfRangeError, RateOutOfRangeError } from './money.errors';
import { RATE_DECIMALS, RATE_LIMIT_SCALED, ScaledRate } from './rate';

/** The most minor units a converted (reporting) value may hold: 10^18. */
export const MAX_REPORTING_MINOR = 10n ** 18n;

/**
 * Converts `amountMinor` (a currency with `fromMinorUnits` minor digits) into the reporting currency (`toMinorUnits`)
 * at `rate`, in exact integer arithmetic. The result is the nearest whole minor unit; only an exact half moves away
 * from zero (`508.5` → `509`, `-508.5` → `-509`). Done once when the value is recorded, never again on read.
 */
export function convertToReporting(
  amountMinor: bigint,
  rate: ScaledRate,
  fromMinorUnits: number,
  toMinorUnits: number,
): bigint {
  if (rate <= 0n || rate >= RATE_LIMIT_SCALED) throw new RateOutOfRangeError();
  if (amountMinor > MAX_AMOUNT_MINOR || amountMinor < -MAX_AMOUNT_MINOR) throw new MoneyOutOfRangeError();

  const shift = toMinorUnits - fromMinorUnits;
  const numerator = amountMinor * rate * 10n ** BigInt(Math.max(shift, 0));
  const denominator = 10n ** BigInt(RATE_DECIMALS) * 10n ** BigInt(Math.max(-shift, 0));

  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  let quotient = magnitude / denominator;
  if (2n * (magnitude % denominator) >= denominator) quotient += 1n;

  if (quotient > MAX_REPORTING_MINOR) throw new MoneyOutOfRangeError();

  return negative ? -quotient : quotient;
}
