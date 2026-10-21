import { MAX_AMOUNT_MINOR } from './money';
import { MoneyOutOfRangeError, RateMalformedError, RateOutOfRangeError, RateScaleExceededError } from './money.errors';

/** One tax of a profile: its name, its estimated rate in hundredths of a percent (1000 is 10%), the deductible default. */
export interface TaxLineInput {
  taxType: string;
  rateBp: number;
  deductible: boolean;
}

export interface TaxEstimateLine extends TaxLineInput {
  taxMinor: bigint;
}

export interface TaxEstimate {
  lines: TaxEstimateLine[];
  /** The estimated tax: the sum of the lines. */
  taxMinor: bigint;
  /** The part that may be deducted as input tax. */
  deductibleMinor: bigint;
  /** The part that is a real cost. */
  nonDeductibleMinor: bigint;
  /** The price before tax plus the tax that cannot be deducted (`QĐ-60a`). */
  estimatedCostMinor: bigint;
}

const MAX_RATE_BP = 10000;

/**
 * Estimates the tax on a price before tax, in the same currency, in whole minor units (ADR-0007). Each line is
 * `net x rate` rounded to the nearest minor unit, an exact half away from zero; the lines are summed, never the
 * products. This is an estimate for display: nothing here is a tax payable, a filing or a deduction decision.
 */
export function estimateTax(netMinor: bigint, lines: readonly TaxLineInput[]): TaxEstimate {
  if (netMinor < 0n || netMinor > MAX_AMOUNT_MINOR) throw new MoneyOutOfRangeError();

  let taxMinor = 0n;
  let deductibleMinor = 0n;
  const estimated = lines.map((line): TaxEstimateLine => {
    if (!Number.isInteger(line.rateBp) || line.rateBp < 0 || line.rateBp > MAX_RATE_BP) {
      throw new RateOutOfRangeError();
    }
    const tax = (netMinor * BigInt(line.rateBp) * 2n + 10000n) / 20000n;
    taxMinor += tax;
    if (line.deductible) deductibleMinor += tax;

    return { ...line, taxMinor: tax };
  });
  const nonDeductibleMinor = taxMinor - deductibleMinor;

  return {
    lines: estimated,
    taxMinor,
    deductibleMinor,
    nonDeductibleMinor,
    estimatedCostMinor: netMinor + nonDeductibleMinor,
  };
}

const PERCENT_SHAPE = /^(\d{1,3})(?:\.(\d+))?$/;

/** Reads a plain percentage such as `10` or `7.25` into hundredths of a percent; at most two decimals, 0 to 100. */
export function parseRatePercent(input: string): number {
  const match = PERCENT_SHAPE.exec(input);
  if (!match) throw new RateMalformedError();
  const [, whole, fraction = ''] = match;
  if (fraction.length > 2) throw new RateScaleExceededError();

  const rateBp = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (rateBp > MAX_RATE_BP) throw new RateOutOfRangeError();

  return rateBp;
}

/** Writes hundredths of a percent as a plain percentage: no trailing zeros (`1000` is `10`, `725` is `7.25`). */
export function formatRatePercent(rateBp: number): string {
  const whole = Math.floor(rateBp / 100);
  const fraction = String(rateBp % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');

  return fraction === '' ? String(whole) : `${whole}.${fraction}`;
}
