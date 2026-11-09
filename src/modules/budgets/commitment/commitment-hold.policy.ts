/**
 * What a commitment may hold (`FR-5.8`(1), `FR-5.8a`, `INV-16`, `BR-MF1-07d`), as pure decisions: the approval of a request holds exactly one
 * commitment, for the year of the day it is decided, of an amount above nothing; and only on an approved version of that year (the budget
 * decides the last of the four, once the year is locked). A request that costs nothing this year holds nothing, and a request never holds
 * the year after: the part of the next year is the commitment made on 01/01.
 */

export type HoldRefusal =
  /** More than one year (or none) is asked to be held: the approval holds one. */
  | 'MORE_THAN_ONE_YEAR'
  /** The year is not the current fiscal year of the organization. */
  | 'NOT_CURRENT_YEAR'
  /** The amount is not above nothing. */
  | 'NOT_POSITIVE'
  /** The Cost Center has no approved version of the year: no commitment is made without a budget (`FR-5.8a`). */
  | 'NO_APPROVED_BUDGET';

/** What can be judged before the budget is read: the number of years, the year and the amount. */
export function checkHoldable(input: {
  items: readonly { year: number; amountMinor: bigint }[];
  currentYear: number;
}): Exclude<HoldRefusal, 'NO_APPROVED_BUDGET'> | null {
  const [item] = input.items;
  if (input.items.length !== 1 || item === undefined) return 'MORE_THAN_ONE_YEAR';
  if (item.year !== input.currentYear) return 'NOT_CURRENT_YEAR';
  if (item.amountMinor <= 0n) return 'NOT_POSITIVE';

  return null;
}
