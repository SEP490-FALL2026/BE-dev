import { RateMalformedError, RateOutOfRangeError, RateScaleExceededError } from './money.errors';

/** An exchange rate times 10^10, held exactly (ADR-0007 `ScaledRate`). */
export type ScaledRate = bigint;

export const RATE_DECIMALS = 10;
const RATE_UNIT = 10n ** BigInt(RATE_DECIMALS);
/** The rate `10^10` and above is refused; as a scaled value that is `10^20`. */
export const RATE_LIMIT_SCALED = RATE_UNIT * RATE_UNIT;

const RATE_SHAPE = /^(-?)(\d{1,16})(?:\.(\d+))?$/;

/** Reads a plain decimal rate; refuses more than ten decimals, and a value that is not above 0 and below 10^10. */
export function parseRate(input: string): ScaledRate {
  const match = RATE_SHAPE.exec(input);
  if (!match) throw new RateMalformedError();
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > RATE_DECIMALS) throw new RateScaleExceededError();

  const magnitude = BigInt(whole + fraction.padEnd(RATE_DECIMALS, '0'));
  if (sign === '-' || magnitude === 0n || magnitude >= RATE_LIMIT_SCALED) throw new RateOutOfRangeError();

  return magnitude;
}

/** Writes a scaled rate as a plain decimal string: no exponent, no trailing zeros. */
export function formatRate(rate: ScaledRate): string {
  const digits = rate.toString().padStart(RATE_DECIMALS + 1, '0');
  const whole = digits.slice(0, digits.length - RATE_DECIMALS);
  const fraction = digits.slice(digits.length - RATE_DECIMALS).replace(/0+$/, '');

  return fraction === '' ? whole : `${whole}.${fraction}`;
}
