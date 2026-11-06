/**
 * `percent` percent of an amount written as a decimal string in major units, rounded down to the smallest unit the amount is
 * written in. Whole arithmetic on the digits: no number of the language is made of the amount.
 */
export function percentOf(amount: string, percent: number): string {
  if (!Number.isInteger(percent) || percent < 0) throw new Error(`A share is a whole percent, not ${percent}`);
  const [whole, fraction = ''] = amount.split('.');
  const scale = fraction.length;
  const units = (BigInt(whole + fraction) * BigInt(percent)) / 100n;
  if (scale === 0) return units.toString();
  const digits = units.toString().padStart(scale + 1, '0');

  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}
