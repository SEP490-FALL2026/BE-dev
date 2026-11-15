/** The light of a Cost Center at the close of a month (`QĐ-111af`): green, yellow, red, or under what it should have used. */
export type ReviewLight = 'GREEN' | 'YELLOW' | 'RED' | 'UNDER';

/** A month that only closes the month, or one of March, June and September, which is the quarterly review (`QĐ-111ae`). */
export type ReviewKind = 'MONTH' | 'QUARTER';

/** Where a period is: closed on the figures, waiting for the explanations of the quarter (`RV-3`), or signed by Finance. */
export type ReviewState = 'SNAPSHOT' | 'AWAITING_EXPLANATIONS' | 'SIGNED';

/**
 * What the review of one Cost Center reads at the close of month `month` of a year, in one currency (VND, `D2`): the effective budget, what was spent
 * since 01/01, what is held, what waits for the spend decision, what the invoices of the year cost against their price before tax (the basis of the
 * difference k), and the price increase already known.
 */
export interface ReviewInput {
  /** The month that was closed, 1 to 12. */
  month: number;
  baseMinor: bigint;
  reserveMinor: bigint;
  spentMinor: bigint;
  committedMinor: bigint;
  pendingMinor: bigint;
  /** The price before tax of the invoices of the Cost Center and the year, and what they cost (price and the tax that cannot be deducted). */
  invoiceNetMinor: bigint;
  invoiceActualMinor: bigint;
  priceIncreaseMinor: bigint;
}

/** The figures the snapshot keeps, worked out from the input and never again. */
export interface ReviewFigures {
  /** The budget (base and reserve) less what was spent, what is held and what waits; negative when the Cost Center is over. */
  remainingMinor: bigint;
  /** The difference k in millionths: the tax and fees of the invoices over their price, 0 with no invoice. */
  variancePpm: bigint;
  forecastMinor: bigint;
  /** The spent over the base of the months gone, in hundredths of a percent, rounded up; null with no base. */
  paceBasisPoints: bigint | null;
  light: ReviewLight;
}

/** One commitment's price increase: what a seat costs a month now against what it was committed at, for the seats and the months of the year left. */
export interface PriceIncreaseItem {
  currentMonthlyMinor: bigint;
  committedMonthlyMinor: bigint;
  seats: number;
  monthsLeft: number;
}
