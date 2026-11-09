import { MoneyMalformedError, MoneyOutOfRangeError, MoneyScaleExceededError } from './money.errors';

/** A money value: whole minor units of one currency (ADR-0007). */
export interface Money {
  amountMinor: bigint;
  currency: string;
}

/** The most minor units a money value may hold: 10^15. */
export const MAX_AMOUNT_MINOR = 10n ** 15n;

const AMOUNT_SHAPE = /^(-?)(\d{1,16})(?:\.(\d+))?$/;

/**
 * Reads a plain decimal string in major units into minor units. Fewer decimals than the currency has are padded;
 * more are refused, never rounded. No path goes through `Number`.
 */
export function parseDecimalAmount(input: string, minorUnits: number): bigint {
  const match = AMOUNT_SHAPE.exec(input);
  if (!match) throw new MoneyMalformedError();
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > minorUnits) throw new MoneyScaleExceededError(minorUnits);

  const magnitude = BigInt(whole + fraction.padEnd(minorUnits, '0'));
  if (magnitude > MAX_AMOUNT_MINOR) throw new MoneyOutOfRangeError();

  return sign === '-' ? -magnitude : magnitude;
}

/** Writes minor units as a plain decimal string in major units with exactly the currency's minor digits. */
export function formatAmount(amountMinor: bigint, minorUnits: number): string {
  const negative = amountMinor < 0n;
  const digits = (negative ? -amountMinor : amountMinor).toString().padStart(minorUnits + 1, '0');
  const whole = digits.slice(0, digits.length - minorUnits);
  const fraction = digits.slice(digits.length - minorUnits);

  return `${negative ? '-' : ''}${whole}${minorUnits > 0 ? `.${fraction}` : ''}`;
}
